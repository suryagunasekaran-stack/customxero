/**
 * Simplified Validation Orchestrator for Pipedrive-Xero validation
 */

import { logger } from '../logger';
import { fetchDealsFromMultiplePipelines } from '../utils/pipedriveHelpers';
import { tenantConfigService, type TenantConfiguration } from '../services/tenantConfigService';

// Simple types for now
export interface ValidationSession {
  id: string;
  tenantId: string;
  tenantName: string;
  startTime: Date;
  endTime?: Date;
  status: 'pending' | 'running' | 'completed' | 'failed';
  validationResults?: any;
}

/**
 * Simplified ValidationOrchestrator
 */
export class ValidationOrchestrator {
  private progressCallback?: (step: any) => void;

  constructor(config: any = {}) {
    // Simple constructor
  }

  setProgressCallback(callback: (step: any) => void) {
    this.progressCallback = callback;
  }

  /**
   * Main validation workflow - simplified version
   */
  async executeValidationWorkflow(
    tenantId: string,
    legacyConfig: any // Keep for compatibility but won't use
  ): Promise<ValidationSession> {
    
    // Fetch tenant configuration from MongoDB
    const tenantConfig = await tenantConfigService.getTenantConfig(tenantId);
    
    if (!tenantConfig) {
      throw new Error(`No configuration found for tenant: ${tenantId}`);
    }
    
    const session: ValidationSession = {
      id: `validation-${Date.now()}`,
      tenantId,
      tenantName: tenantConfig.tenantName,
      startTime: new Date(),
      status: 'running'
    };

    try {
      logger.info({ 
        tenantId, 
        tenantName: tenantConfig.tenantName,
        pipelineCount: tenantConfig.pipedrive.pipelineIds.length,
        apiKeyRef: tenantConfig.pipedrive.apiKeyRef
      }, '🚀 Starting validation workflow with MongoDB config');
      
      // Step 1: Fetch all deals from Pipedrive
      this.notifyProgress({
        id: 'fetch_deals',
        name: 'Fetching Deals',
        description: 'Retrieving all deals from Pipedrive for validation',
        status: 'running'
      });

      const allDeals = await this.fetchWonDeals(tenantConfig);
      
      logger.info({ 
        totalDeals: allDeals.length,
        dealsByStatus: {
          won: allDeals.filter(d => d.status === 'won').length,
          open: allDeals.filter(d => d.status === 'open').length,
          lost: allDeals.filter(d => d.status === 'lost').length
        }
      }, '📊 Deals fetched for validation');
      
      // Step 2: Validate deals based on pipeline rules
      this.notifyProgress({
        id: 'validate_deals',
        name: 'Validating Deals',
        description: 'Checking deals against pipeline rules',
        status: 'running'
      });

      const validationResults = await this.validateDeals(allDeals, tenantConfig);
      
      logger.info({
        totalDeals: validationResults.totalDeals,
        issuesFound: validationResults.issues.length,
        errorCount: validationResults.errorCount,
        warningCount: validationResults.warningCount
      }, '📊 Validation completed');

      this.notifyProgress({
        id: 'validate_deals',
        name: 'Validating Deals',
        description: `Found ${validationResults.issues.length} issues`,
        status: 'completed',
        result: { 
          totalIssues: validationResults.issues.length,
          errors: validationResults.errorCount,
          warnings: validationResults.warningCount
        }
      });

      session.validationResults = validationResults;
      session.status = 'completed';
      session.endTime = new Date();

      logger.info({ 
        sessionId: session.id,
        duration: session.endTime.getTime() - session.startTime.getTime()
      }, '✅ Validation completed');

      return session;

    } catch (error) {
      logger.error({ error }, '❌ Validation failed');
      session.status = 'failed';
      session.endTime = new Date();
      throw error;
    }
  }

  /**
   * Fetch ALL deals from Pipedrive using MongoDB configuration
   */
  private async fetchWonDeals(config: TenantConfiguration): Promise<any[]> {
    logger.info({ 
      domain: config.pipedrive.companyDomain,
      pipelines: config.pipedrive.pipelineIds,
      tenantName: config.tenantName
    }, 'Fetching all deals from Pipedrive for validation');

    try {
      // Get the actual API key from environment variable
      const apiKey = await tenantConfigService.getApiKey(config);
      
      // Include pipeline 1 to catch unqualified deals
      const allPipelineIds = [1, ...config.pipedrive.pipelineIds];
      
      // Fetch won deals
      const wonDeals = await fetchDealsFromMultiplePipelines(
        apiKey,
        config.pipedrive.companyDomain,
        allPipelineIds,
        'won'
      );
      
      // Fetch open deals
      const openDeals = await fetchDealsFromMultiplePipelines(
        apiKey,
        config.pipedrive.companyDomain,
        allPipelineIds,
        'open'
      );
      
      // Combine all deals
      const deals = [...wonDeals, ...openDeals];

      logger.info({ 
        dealCount: deals.length,
        pipelines: config.pipedrive.pipelineIds,
        tenantName: config.tenantName
      }, 'Deals fetched successfully');

      // Log validation rules from config
      logger.info({
        validPrefixes: config.validation.rules.validProjectPrefixes,
        titleFormat: config.validation.rules.titleFormat,
        requireVesselName: config.validation.rules.requireVesselName
      }, 'Validation rules loaded from MongoDB');

      return deals;
    } catch (error) {
      logger.error({ error }, 'Failed to fetch deals');
      throw error;
    }
  }

  /**
   * Validate deals based on pipeline rules
   */
  private async validateDeals(deals: any[], config: TenantConfiguration): Promise<any> {
    const issues: any[] = [];
    let errorCount = 0;
    let warningCount = 0;

    // Define validation rules for this tenant
    const validationRules = {
      noWonInPipeline: [1], // No won deals should be in pipeline 1
      noOpenInPipelines: [6, 8, 7, 3, 5, 4, 9, 16, 11, 17], // No open deals in these pipelines
      ignorePipelines: [12, 13] // Completely ignore these pipelines
    };

    logger.info({
      totalDeals: deals.length,
      rules: validationRules
    }, 'Starting deal validation with pipeline rules');

    // Get custom field mappings from database configuration
    const customFieldMappings = config.pipedrive.customFieldMappings || {};
    
    // For BSENI tenant, 'ipc' field is used as projectCode
    // For Brightsun Marine, 'projectcode' field is used (lowercase in DB)
    const projectCodeField = config.tenantId === '6dd39ea4-e6a6-4993-a37a-21482ccf8d22' 
      ? (customFieldMappings.ipc || customFieldMappings.projectCode)  // BSENI uses 'ipc'
      : (customFieldMappings.projectcode || customFieldMappings.projectCode); // Brightsun uses 'projectcode' (lowercase)
    
    const vesselNameField = customFieldMappings.vesselName;
    
    logger.debug({
      tenantId: config.tenantId,
      customFieldMappings: Object.keys(customFieldMappings),
      projectCodeField,
      vesselNameField
    }, 'Using custom field mappings from database');

    // Process each deal
    for (const deal of deals) {
      const pipelineId = deal.pipeline_id;
      const status = deal.status;
      
      // Skip ignored pipelines
      if (validationRules.ignorePipelines.includes(pipelineId)) {
        continue;
      }

      // Check: Title format validation (projectCode-vesselName)
      // Only validate title format for won deals
      // v2 API returns custom fields in a custom_fields object
      const projectCode = projectCodeField ? (deal.custom_fields?.[projectCodeField] || '') : '';
      const vesselName = vesselNameField ? (deal.custom_fields?.[vesselNameField] || '') : '';
      
      // Trim whitespace from custom field values for validation
      const trimmedProjectCode = projectCode.trim();
      const trimmedVesselName = vesselName.trim();
      
      // Build the expected title based on custom field values
      let expectedTitle = '';
      let titleHasIssue = false;
      let issueDescription = '';
      
      // Only validate title format for won deals
      if (status === 'won' && projectCode && vesselName) {
        
        // Check if this is an ED project
        const isEDProject = trimmedProjectCode.toUpperCase().startsWith('ED');
        
        if (isEDProject) {
          // For ED projects, the format can be: projectCode-middlePart-vesselName
          // We need to check if the title matches the pattern
          
          // First check if it starts with the project code
          if (deal.title?.startsWith(trimmedProjectCode)) {
            // Remove the project code and the dash after it
            const remainingAfterProjectCode = deal.title.substring(trimmedProjectCode.length + 1);
            
            // Check if what remains ends with the vessel name (trimmed)
            if (remainingAfterProjectCode === trimmedVesselName) {
              // Standard format: projectCode-vesselName
              titleHasIssue = false;
            } else if (remainingAfterProjectCode.endsWith(trimmedVesselName)) {
              // Check if there's a middle part
              const beforeVesselName = remainingAfterProjectCode.substring(0, remainingAfterProjectCode.length - trimmedVesselName.length);
              
              // The middle part should end with a dash
              if (beforeVesselName.endsWith('-')) {
                // Valid ED format: projectCode-middlePart-vesselName
                titleHasIssue = false;
              } else {
                titleHasIssue = true;
                expectedTitle = `${trimmedProjectCode}-[code]-${trimmedVesselName}`;
                issueDescription = `ED project title "${deal.title}" format issue - missing dash before vessel name`;
              }
            } else {
              titleHasIssue = true;
              expectedTitle = `${trimmedProjectCode}-[code]-${trimmedVesselName}`;
              issueDescription = `ED project title "${deal.title}" does not match expected vessel name "${trimmedVesselName}"`;
            }
          } else {
            titleHasIssue = true;
            expectedTitle = `${trimmedProjectCode}-[code]-${trimmedVesselName}`;
            issueDescription = `ED project title "${deal.title}" does not start with project code "${trimmedProjectCode}"`;
          }
        } else {
          // Non-ED projects - standard format only
          expectedTitle = `${trimmedProjectCode}-${trimmedVesselName}`;
          if (deal.title !== expectedTitle) {
            titleHasIssue = true;
            issueDescription = `Title "${deal.title}" does not match expected format "${expectedTitle}"`;
          }
        }
      } else if (status === 'won' && (projectCode || vesselName)) {
        // One field exists but not both
        expectedTitle = `${projectCode || '(missing project code)'}-${vesselName || '(missing vessel name)'}`;
        titleHasIssue = true;
        if (!projectCode) {
          issueDescription = 'Project code is missing in custom fields';
        } else {
          issueDescription = 'Vessel name is missing in custom fields';
        }
      } else if (status === 'won' && deal.title && deal.title.trim() && deal.title !== '-') {
        // Deal has a title but custom fields are empty
        titleHasIssue = true;
        issueDescription = 'Title exists but project code and vessel name custom fields are empty';
        expectedTitle = '(set project code and vessel name in custom fields)';
      }
      
      // Check: Required custom fields validation for Brightsun Marine tenant (ea67107e)
      if (config.tenantId === 'ea67107e-c352-40a9-a8b8-24d81ae3fc85' && status === 'won') {
        // For Brightsun Marine tenant, validate all required custom fields are not null/empty
        // Validate all custom fields except invoiceId
        const requiredFields = [
          { key: customFieldMappings.xeroQuoteId, name: 'Xero Quote ID' },
          { key: customFieldMappings.vesselName, name: 'Vessel Name' },
          { key: customFieldMappings.department, name: 'Department' },
          { key: customFieldMappings.projectcode, name: 'Project Code' },
          { key: customFieldMappings.woponumber, name: 'WO/PO Number' },
          { key: customFieldMappings.location, name: 'Location' },
          { key: customFieldMappings.salesincharge, name: 'Sales In Charge' },
          { key: customFieldMappings.xeroquotenumber, name: 'Xero Quote Number' }
        ];
        
        for (const field of requiredFields) {
          if (!field.key) {
            logger.warn({ fieldName: field.name }, 'Custom field mapping not found in database config');
            continue;
          }
          
          const fieldValue = deal.custom_fields?.[field.key];
          if (!fieldValue || fieldValue === '' || fieldValue === null) {
            const issue = {
              code: 'REQUIRED_FIELD_MISSING',
              severity: 'warning' as const,
              message: `Required field "${field.name}" is missing or empty`,
              suggestedFix: `Please fill in the ${field.name} field in Pipedrive`,
              metadata: {
                dealId: deal.id,
                dealTitle: deal.title,
                fieldName: field.name,
                fieldKey: field.key,
                pipelineId: pipelineId,
                status: status,
                dealValue: deal.value,
                currency: deal.currency || 'SGD'
              }
            };
            issues.push(issue);
            warningCount++;
            
            logger.debug({
              dealId: deal.id,
              title: deal.title,
              missingField: field.name,
              fieldKey: field.key
            }, 'Required custom field missing');
          }
        }
      }
      
      if (titleHasIssue) {
        const issue = {
          code: 'INVALID_TITLE_FORMAT',
          severity: 'warning' as const,
          message: `Deal title format incorrect: "${deal.title}"`,
          suggestedFix: issueDescription || `Title should be "${expectedTitle}" (ProjectCode-VesselName format)`,
          metadata: {
            dealId: deal.id,
            dealTitle: deal.title,
            expectedTitle: expectedTitle,
            projectCode: projectCode || '(missing)',
            vesselName: vesselName || '(missing)',
            pipelineId: pipelineId,
            status: status,
            dealValue: deal.value,
            currency: deal.currency || 'SGD'
          }
        };
        issues.push(issue);
        warningCount++;
        
        logger.debug({
          dealId: deal.id,
          title: deal.title,
          expectedTitle: expectedTitle,
          projectCode: projectCode || '(empty)',
          vesselName: vesselName || '(empty)',
          issue: issueDescription
        }, 'Deal title validation issue found');
      }

      // Check: No won deals in pipeline 1
      if (status === 'won' && validationRules.noWonInPipeline.includes(pipelineId)) {
        const issue = {
          code: 'WON_DEAL_IN_UNQUALIFIED_PIPELINE',
          severity: 'error',
          message: `Won deal "${deal.title}" found in unqualified pipeline (Pipeline ${pipelineId})`,
          suggestedFix: `Move this deal to an appropriate pipeline or change its status`,
          metadata: {
            dealId: deal.id,
            dealTitle: deal.title,
            pipelineId: pipelineId,
            status: status,
            dealValue: deal.value,
            stageId: deal.stage_id,
            currency: deal.currency || 'SGD'
          }
        };
        issues.push(issue);
        errorCount++;
        
        logger.warn({
          dealId: deal.id,
          title: deal.title,
          pipeline: pipelineId
        }, 'Won deal in unqualified pipeline');
      }

      // Check: No open deals in specified pipelines
      if (status === 'open' && validationRules.noOpenInPipelines.includes(pipelineId)) {
        const issue = {
          code: 'OPEN_DEAL_IN_WRONG_PIPELINE',
          severity: 'error',
          message: `Open deal "${deal.title}" found in pipeline ${pipelineId}`,
          suggestedFix: `This pipeline should only contain closed (won/lost) deals. Please update the deal status or move to appropriate pipeline`,
          metadata: {
            dealId: deal.id,
            dealTitle: deal.title,
            pipelineId: pipelineId,
            status: status,
            dealValue: deal.value,
            stageId: deal.stage_id,
            currency: deal.currency || 'SGD'
          }
        };
        issues.push(issue);
        errorCount++;
        
        logger.warn({
          dealId: deal.id,
          title: deal.title,
          pipeline: pipelineId,
          status: status
        }, 'Open deal in pipeline that should only have closed deals');
      }
    }

    // Log summary
    logger.info({
      totalDealsProcessed: deals.length,
      issuesFound: issues.length,
      errors: errorCount,
      warnings: warningCount
    }, 'Deal validation completed');

    return {
      totalDeals: deals.length,
      issues: issues,
      errorCount: errorCount,
      warningCount: warningCount,
      summary: {
        message: issues.length > 0 
          ? `Found ${issues.length} validation issues` 
          : 'All deals passed validation',
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Notify progress to callback if set
   */
  private notifyProgress(step: any) {
    if (this.progressCallback) {
      this.progressCallback(step);
    }
  }
}