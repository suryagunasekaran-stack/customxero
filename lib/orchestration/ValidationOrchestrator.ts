/**
 * Simplified Validation Orchestrator for Pipedrive-Xero validation
 */

import { logger } from '../logger';
import { fetchDealsFromMultiplePipelines, fetchDealProducts } from '../utils/pipedriveHelpers';
import { tenantConfigService, type TenantConfiguration } from '../services/tenantConfigService';
import { XeroQuoteService, type XeroQuote } from '../services/xeroQuoteService';
import { ensureValidToken } from '../ensureXeroToken';

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

      // Get the actual API key from environment variable
      const apiKey = await tenantConfigService.getApiKey(tenantConfig);
      
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

      const validationResults = await this.validateDeals(allDeals, tenantConfig, apiKey);
      
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
      
      // Fetch lost deals for Xero quote status validation
      const lostDeals = await fetchDealsFromMultiplePipelines(
        apiKey,
        config.pipedrive.companyDomain,
        allPipelineIds,
        'lost'
      );
      
      // Combine all deals
      const deals = [...wonDeals, ...openDeals, ...lostDeals];

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
  private async validateDeals(deals: any[], config: TenantConfiguration, apiKey: string): Promise<any> {
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
    
    // TENANT-SPECIFIC FIELD MAPPING LOGIC
    // Different tenants use different custom field names for the same business concept
    // This mapping ensures validation works consistently across tenant implementations
    
    // BSENI tenant (6dd39ea4-e6a6-4993-a37a-21482ccf8d22) uses 'ipc' field for project codes
    // Brightsun Marine tenant uses 'projectcode' field (note: lowercase in database)
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
        
        // ED PROJECT SPECIAL HANDLING
        // ED (Engineering Department) projects have more flexible title formats
        // They can include additional descriptive elements between project code and vessel name
        const isEDProject = trimmedProjectCode.toUpperCase().startsWith('ED');
        
        if (isEDProject) {
          // ED project title formats supported:
          // 1. Standard: "projectCode-vesselName" or "projectCode - vesselName"
          // 2. Extended: "projectCode-middlePart-vesselName" or with spaces around dashes
          // This flexibility accommodates engineering project naming conventions
          
          // First check if it starts with the project code
          if (deal.title?.startsWith(trimmedProjectCode)) {
            // Handle both dash formats (with or without spaces)
            let remainingAfterProjectCode = '';
            if (deal.title.substring(trimmedProjectCode.length, trimmedProjectCode.length + 3) === ' - ') {
              // Format with spaces: "projectCode - remaining"
              remainingAfterProjectCode = deal.title.substring(trimmedProjectCode.length + 3);
            } else if (deal.title.substring(trimmedProjectCode.length, trimmedProjectCode.length + 1) === '-') {
              // Format without spaces: "projectCode-remaining"
              remainingAfterProjectCode = deal.title.substring(trimmedProjectCode.length + 1);
            } else {
              titleHasIssue = true;
              expectedTitle = `${trimmedProjectCode}-[code]-${trimmedVesselName}`;
              issueDescription = `ED project title "${deal.title}" has invalid separator after project code`;
            }
            
            if (!titleHasIssue) {
              // Check if what remains is exactly the vessel name
              if (remainingAfterProjectCode === trimmedVesselName) {
                // Standard format: projectCode-vesselName or projectCode - vesselName
                titleHasIssue = false;
              } else if (remainingAfterProjectCode.endsWith(trimmedVesselName)) {
                // Extended format with middle part
                const beforeVesselName = remainingAfterProjectCode.substring(0, remainingAfterProjectCode.length - trimmedVesselName.length);
                
                // The middle part must end with a dash (with or without spaces) to separate from vessel name
                if (beforeVesselName.endsWith('-') || beforeVesselName.endsWith(' - ')) {
                  // Valid ED format: projectCode-middlePart-vesselName (with or without spaces)
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
            }
          } else {
            titleHasIssue = true;
            expectedTitle = `${trimmedProjectCode}-[code]-${trimmedVesselName}`;
            issueDescription = `ED project title "${deal.title}" does not start with project code "${trimmedProjectCode}"`;
          }
        } else {
          // STANDARD PROJECT TITLE VALIDATION
          // Allow both "ProjectCode-VesselName" and "ProjectCode - VesselName" formats
          // Some tenants use spaces around the dash for better readability
          const expectedTitleNoSpaces = `${trimmedProjectCode}-${trimmedVesselName}`;
          const expectedTitleWithSpaces = `${trimmedProjectCode} - ${trimmedVesselName}`;
          
          // Accept both formats as valid
          if (deal.title !== expectedTitleNoSpaces && deal.title !== expectedTitleWithSpaces) {
            titleHasIssue = true;
            // Use the no-spaces format as the canonical expected format
            expectedTitle = expectedTitleNoSpaces;
            issueDescription = `Title "${deal.title}" does not match expected format "${expectedTitle}" or "${expectedTitleWithSpaces}"`;
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
      
      // Check: Required custom fields validation for Brightsun Marine tenant only
      if (config.tenantId === 'ea67107e-c352-40a9-a8b8-24d81ae3fc85' && status === 'won') {
        // For Brightsun Marine tenant, validate all required custom fields are not null/empty
        // Validate all custom fields except invoiceId
        const requiredFields = [
          { key: customFieldMappings.xeroQuoteId, name: 'Xero Quote ID', severity: 'error' },
          { key: customFieldMappings.xeroquotenumber, name: 'Xero Quote Number', severity: 'error' },
          { key: customFieldMappings.projectcode, name: 'Project Code', severity: 'error' },
          { key: customFieldMappings.vesselName, name: 'Vessel Name', severity: 'warning' },
          { key: customFieldMappings.department, name: 'Department', severity: 'warning' },
          { key: customFieldMappings.woponumber, name: 'WO/PO Number', severity: 'warning' },
          { key: customFieldMappings.location, name: 'Location', severity: 'warning' },
          { key: customFieldMappings.salesincharge, name: 'Sales In Charge', severity: 'warning' }
        ];
        
        for (const field of requiredFields) {
          if (!field.key) {
            logger.warn({ fieldName: field.name }, 'Custom field mapping not found in database config');
            continue;
          }
          
          const fieldValue = deal.custom_fields?.[field.key];
          if (!fieldValue || fieldValue === '' || fieldValue === null) {
            // Determine severity based on field criticality
            const severity = field.severity || 'warning';
            
            const issue = {
              code: 'REQUIRED_FIELD_MISSING',
              severity: severity as 'error' | 'warning',
              message: `Required field "${field.name}" is missing or empty`,
              dealId: deal.id,
              dealTitle: deal.title || deal.name,
              suggestedFix: `Please fill in the ${field.name} field in Pipedrive`,
              metadata: {
                dealId: deal.id,
                dealTitle: deal.title || deal.name,
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

    // Product validation for won deals
    this.notifyProgress({
      id: 'validate_products',
      status: 'running',
      message: 'Validating products for won deals...',
      details: { phase: 'products' }
    });

    // Get all won deals that need product validation
    const wonDeals = deals.filter(deal => deal.status === 'won' && !validationRules.ignorePipelines.includes(deal.pipeline_id));
    
    // Get all lost deals for Xero quote validation
    const lostDeals = deals.filter(deal => deal.status === 'lost' && !validationRules.ignorePipelines.includes(deal.pipeline_id));
    
    if (wonDeals.length > 0) {
      logger.info({ wonDealsCount: wonDeals.length }, 'Fetching products for won deals');
      
      try {
        // Fetch products for all won deals using bulk API
        const dealIds = wonDeals.map(deal => deal.id);
        const dealProducts = await fetchDealProducts(
          apiKey,
          config.pipedrive.companyDomain,
          dealIds
        );
        
        // Validate each won deal has products
        for (const deal of wonDeals) {
          const products = dealProducts[deal.id] || [];
          
          if (products.length === 0) {
            const issue = {
              code: 'NO_PRODUCTS_IN_WON_DEAL',
              severity: 'error' as const,
              message: `Won deal has no products attached`,
              dealId: deal.id,
              dealTitle: deal.title || deal.name,
              suggestedFix: `Add products to this won deal in Pipedrive`,
              metadata: {
                dealId: deal.id,
                dealTitle: deal.title || deal.name,
                dealValue: deal.value,
                currency: deal.currency || 'SGD',
                pipelineId: deal.pipeline_id,
                status: deal.status
              }
            };
            issues.push(issue);
            errorCount++;
            
            logger.debug({
              dealId: deal.id,
              title: deal.title,
              value: deal.value
            }, 'Won deal missing products');
          }
        }
        
        logger.info({
          wonDealsChecked: wonDeals.length,
          dealsWithoutProducts: wonDeals.filter(d => !dealProducts[d.id] || dealProducts[d.id].length === 0).length
        }, 'Product validation completed');
        
      } catch (error) {
        logger.error({ 
          error: error instanceof Error ? error.message : error 
        }, 'Failed to fetch products for validation');
        
        // GRACEFUL DEGRADATION: Continue validation workflow despite product fetch failure
        // This ensures core validation rules are still applied even if Pipedrive API encounters issues
        const issue = {
          code: 'PRODUCT_VALIDATION_FAILED',
          severity: 'warning' as const,
          message: 'Unable to validate products for won deals',
          suggestedFix: 'Product validation could not be completed. Please check manually.',
          metadata: {
            error: error instanceof Error ? error.message : 'Unknown error',
            wonDealsCount: wonDeals.length
          }
        };
        issues.push(issue);
        warningCount++;
      }
    }

    this.notifyProgress({
      id: 'validate_products',
      status: 'completed',
      message: 'Product validation completed',
      details: { 
        wonDealsChecked: wonDeals.length,
        productsValidated: true
      }
    });

    // XERO QUOTE VALIDATION - Enabled for both Brightsun Marine and BSENI tenants
    // This validation step ensures strict quote-to-deal consistency across both organizations
    const isXeroValidationTenant = config.tenantId === 'ea67107e-c352-40a9-a8b8-24d81ae3fc85' || // Brightsun Marine
                                   config.tenantId === '6dd39ea4-e6a6-4993-a37a-21482ccf8d22';   // BSENI
    
    if (isXeroValidationTenant) {
      this.notifyProgress({
        id: 'validate_xero_quotes',
        name: 'Validating Xero Quotes',
        description: 'Checking Xero quote data against won and lost Pipedrive deals',
        status: 'running'
      });

      try {
        // Execute comprehensive Xero quote validation against won and lost deals
        // This performs validation rules covering existence, consistency, status alignment, and business logic
        const dealsForXeroValidation = [...wonDeals, ...lostDeals];
        const xeroValidationResults = await this.validateXeroQuotes(dealsForXeroValidation, config);
        
        // Add Xero validation issues to the main issues list
        issues.push(...xeroValidationResults.issues);
        errorCount += xeroValidationResults.errorCount;
        warningCount += xeroValidationResults.warningCount;
        
        this.notifyProgress({
          id: 'validate_xero_quotes',
          name: 'Validating Xero Quotes',
          description: `Xero quote validation completed - found ${xeroValidationResults.issues.length} issues`,
          status: 'completed',
          result: {
            totalIssues: xeroValidationResults.issues.length,
            errors: xeroValidationResults.errorCount,
            warnings: xeroValidationResults.warningCount,
            quotesChecked: xeroValidationResults.quotesChecked
          }
        });
        
        logger.info({
          quotesChecked: xeroValidationResults.quotesChecked,
          issuesFound: xeroValidationResults.issues.length,
          errors: xeroValidationResults.errorCount,
          warnings: xeroValidationResults.warningCount
        }, 'Xero quote validation completed');
        
      } catch (error) {
        logger.error({ 
          error: error instanceof Error ? error.message : error 
        }, 'Failed to validate Xero quotes');
        
        // GRACEFUL DEGRADATION: Add warning issue when Xero validation fails
        // This ensures validation workflow continues even if Xero integration encounters errors
        const issue = {
          code: 'XERO_VALIDATION_FAILED',
          severity: 'warning' as const,
          message: 'Unable to validate Xero quotes',
          suggestedFix: 'Xero quote validation could not be completed. Please check manually.',
          metadata: {
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        };
        issues.push(issue);
        warningCount++;
        
        this.notifyProgress({
          id: 'validate_xero_quotes',
          name: 'Validating Xero Quotes',
          description: 'Xero quote validation failed',
          status: 'failed'
        });
      }
    }

    // VALIDATION SUMMARY LOGGING
    // Provides comprehensive metrics for monitoring and debugging validation performance
    logger.info({
      totalDealsProcessed: deals.length,
      issuesFound: issues.length,
      errors: errorCount,
      warnings: warningCount
    }, 'Deal validation completed');

    // RETURN COMPREHENSIVE VALIDATION RESULTS
    // Structure designed for integration with validation orchestrator and UI components
    return {
      totalDeals: deals.length,        // Total number of deals processed
      issues: issues,                  // Detailed array of all validation issues found
      errorCount: errorCount,          // Critical errors requiring immediate attention
      warningCount: warningCount,      // Non-critical issues for review
      summary: {
        message: issues.length > 0 
          ? `Found ${issues.length} validation issues` 
          : 'All deals passed validation',
        timestamp: new Date().toISOString()  // ISO timestamp for audit trail
      }
    };
  }

  /**
   * Validates Xero quotes against Pipedrive deals for data consistency and business rule compliance.
   * 
   * This method performs comprehensive validation of Xero quotes against their corresponding Pipedrive deals,
   * ensuring data integrity across both systems. It checks for quote existence, reference format compliance,
   * contact matching, value alignment, and status consistency for both won and lost deals.
   * 
   * @description Validates Xero quotes against Pipedrive deals to ensure data consistency across systems.
   * Executed for both Brightsun Marine and BSENI tenants.
   * 
   * @param deals - Array of deals (won and lost) from Pipedrive that need Xero quote validation
   * @param config - Tenant configuration containing custom field mappings and validation rules
   * 
   * @returns Promise resolving to validation results containing:
   *   - issues: Array of validation issues found
   *   - errorCount: Number of critical errors detected
   *   - warningCount: Number of warnings detected
   *   - quotesChecked: Total number of quotes validated
   * 
   * @throws {Error} When Xero authentication fails or quote fetching encounters unrecoverable errors
   * 
   * @example
   * ```typescript
   * const wonDeals = await fetchWonDeals(config);
   * const validationResults = await this.validateXeroQuotes(wonDeals, config);
   * 
   * console.log(`Found ${validationResults.issues.length} validation issues`);
   * console.log(`Errors: ${validationResults.errorCount}, Warnings: ${validationResults.warningCount}`);
   * ```
   * 
   * @since 2025-08-11
   * 
   * Validation Rules Enforced:
   * 1. **Quote Existence**: Verifies that quote IDs/numbers referenced in Pipedrive exist in Xero
   * 2. **ID/Number Consistency**: Ensures quote ID and number refer to the same quote when both are provided
   * 3. **Reference Format**: Validates quote reference follows "Pipedrive deal id : {dealId}" format
   * 4. **Contact Matching**: Compares Xero quote contact name with Pipedrive organization name
   * 5. **Value Alignment**: Checks that quote total matches deal value (allowing 0.01 rounding tolerance)
   * 6. **Won Deal Status**: Ensures won deals have ACCEPTED quotes in Xero
   * 7. **Lost Deal Status**: Ensures lost deals have DECLINED quotes in Xero
   * 
   * Error Severity Levels:
   * - **ERROR**: Critical issues requiring immediate attention (missing quotes, value mismatches, status issues)
   * - **WARNING**: Data inconsistencies that should be reviewed (reference format, contact mismatches)
   */
  private async validateXeroQuotes(
    deals: any[],
    config: TenantConfiguration
  ): Promise<{ issues: any[]; errorCount: number; warningCount: number; quotesChecked: number }> {
    const issues: any[] = [];
    let errorCount = 0;
    let warningCount = 0;
    let quotesChecked = 0;

    try {
      // Ensure valid Xero authentication token and get the effective tenant ID
      // This handles token refresh automatically if needed
      const { effective_tenant_id } = await ensureValidToken();
      
      logger.info({ 
        tenantId: effective_tenant_id,
        totalDealsCount: deals.length,
        wonDeals: deals.filter(d => d.status === 'won').length,
        lostDeals: deals.filter(d => d.status === 'lost').length
      }, 'Starting Xero quote validation');

      // Fetch all quotes from Xero using the authenticated tenant
      // This retrieves the complete quote dataset for validation matching
      const xeroQuotes = await XeroQuoteService.fetchAllQuotes(effective_tenant_id);
      
      logger.info({ 
        quotesCount: xeroQuotes.length 
      }, 'Fetched Xero quotes for validation');

      // Create lookup maps for efficient quote matching during validation
      // Using Maps provides O(1) lookup performance for large quote datasets
      const quotesByID = new Map<string, XeroQuote>();
      const quotesByNumber = new Map<string, XeroQuote>();
      
      // Populate lookup maps with both QuoteID and QuoteNumber as keys
      // This allows validation against either identifier from Pipedrive
      for (const quote of xeroQuotes) {
        if (quote.QuoteID) {
          quotesByID.set(quote.QuoteID, quote);
        }
        if (quote.QuoteNumber) {
          quotesByNumber.set(quote.QuoteNumber, quote);
        }
      }

      // Extract custom field mappings from tenant configuration
      // These mappings define which Pipedrive custom fields contain Xero quote references
      const customFieldMappings = config.pipedrive.customFieldMappings || {};
      const xeroQuoteIdField = customFieldMappings.xeroQuoteId;
      const xeroQuoteNumberField = customFieldMappings.xeroquotenumber;

      // Validate each deal (won or lost) against its corresponding Xero quote
      // Process each deal individually to provide detailed validation feedback
      for (const deal of deals) {
        quotesChecked++;
        
        // Extract Xero quote identifiers from Pipedrive custom fields
        const xeroQuoteId = deal.custom_fields?.[xeroQuoteIdField];
        const xeroQuoteNumber = deal.custom_fields?.[xeroQuoteNumberField];
        
        // Skip validation if deal has no Xero quote references
        // This allows for deals that don't require quote integration
        if (!xeroQuoteId && !xeroQuoteNumber) {
          continue;
        }

        let matchedQuote: XeroQuote | undefined;
        
        // Attempt quote matching using hierarchical lookup strategy:
        // 1. Primary: Match by QuoteID (most reliable identifier)
        // 2. Fallback: Match by QuoteNumber (human-readable identifier)
        if (xeroQuoteId) {
          matchedQuote = quotesByID.get(xeroQuoteId);
        }
        
        if (!matchedQuote && xeroQuoteNumber) {
          matchedQuote = quotesByNumber.get(xeroQuoteNumber);
        }

        // VALIDATION RULE 1: Quote Existence Check
        // Ensures that quotes referenced in Pipedrive actually exist in Xero
        // Critical for maintaining data integrity across systems
        if (!matchedQuote) {
          const issue = {
            code: 'XERO_QUOTE_NOT_FOUND',
            severity: 'error' as const,
            message: `Xero quote not found in Xero system`,
            dealId: deal.id,
            dealTitle: deal.title || deal.name,
            suggestedFix: `Quote ID "${xeroQuoteId || ''}" or Number "${xeroQuoteNumber || ''}" does not exist in Xero. Please verify the quote exists or update the deal.`,
            metadata: {
              dealId: deal.id,
              dealTitle: deal.title || deal.name,
              xeroQuoteId: xeroQuoteId || null,
              xeroQuoteNumber: xeroQuoteNumber || null,
              dealValue: deal.value,
              currency: deal.currency || 'SGD'
            }
          };
          issues.push(issue);
          errorCount++;
          
          logger.debug({
            dealId: deal.id,
            xeroQuoteId,
            xeroQuoteNumber
          }, 'Xero quote not found');
          
          continue; // Skip further validations if quote not found
        }

        // VALIDATION RULE 2: ID/Number Consistency Check
        // When both QuoteID and QuoteNumber are provided, verify they reference the same quote
        // Prevents data corruption from mismatched identifiers
        if (xeroQuoteId && xeroQuoteNumber) {
          if (matchedQuote.QuoteID !== xeroQuoteId || matchedQuote.QuoteNumber !== xeroQuoteNumber) {
            const issue = {
              code: 'XERO_QUOTE_ID_NUMBER_MISMATCH',
              severity: 'warning' as const,
              message: `Xero Quote ID and Number do not match the same quote`,
              dealId: deal.id,
              dealTitle: deal.title || deal.name,
              suggestedFix: `Deal has Quote ID "${xeroQuoteId}" and Number "${xeroQuoteNumber}" but they refer to different quotes in Xero`,
              metadata: {
                dealId: deal.id,
                dealTitle: deal.title || deal.name,
                providedQuoteId: xeroQuoteId,
                providedQuoteNumber: xeroQuoteNumber,
                actualQuoteId: matchedQuote.QuoteID,
                actualQuoteNumber: matchedQuote.QuoteNumber
              }
            };
            issues.push(issue);
            warningCount++;
          }
        }

        // VALIDATION RULE 3: Reference Format Compliance
        // Ensures quote references follow standardized format for traceability
        // Accepts multiple formats: "Pipedrive deal id : {dealId}" or "Pipedrive Deal ID: {dealId}"
        // The validation is now case-insensitive and flexible with spacing around the colon
        const referencePattern = new RegExp(`^Pipedrive\\s+(deal\\s+)?id\\s*:\\s*${deal.id}$`, 'i');
        const isReferenceValid = matchedQuote.Reference && referencePattern.test(matchedQuote.Reference);
        
        if (!isReferenceValid) {
          const expectedReference = `Pipedrive Deal ID: ${deal.id}`;
          const issue = {
            code: 'XERO_QUOTE_REFERENCE_MISMATCH',
            severity: 'warning' as const,
            message: `Xero quote Reference does not match expected format`,
            dealId: deal.id,
            dealTitle: deal.title || deal.name,
            suggestedFix: `Quote Reference should be "${expectedReference}" but is "${matchedQuote.Reference || '(empty)'}"`,
            metadata: {
              dealId: deal.id,
              dealTitle: deal.title || deal.name,
              xeroQuoteId: matchedQuote.QuoteID,
              xeroQuoteNumber: matchedQuote.QuoteNumber,
              expectedReference: expectedReference,
              actualReference: matchedQuote.Reference || null
            }
          };
          issues.push(issue);
          warningCount++;
          
          logger.debug({
            dealId: deal.id,
            expectedReference: expectedReference,
            actualReference: matchedQuote.Reference
          }, 'Quote reference mismatch');
        }

        // VALIDATION RULE 4: Contact Name Consistency
        // Verifies that quote contact matches the Pipedrive organization
        // Ensures quotes are issued to the correct customer entity
        if (deal.org_name && matchedQuote.Contact?.Name) {
          // Normalize names for reliable comparison (handles case and whitespace variations)
          const normalizedOrgName = (deal.org_name || '').trim().toLowerCase();
          const normalizedContactName = (matchedQuote.Contact.Name || '').trim().toLowerCase();
          
          if (normalizedOrgName !== normalizedContactName) {
            const issue = {
              code: 'XERO_QUOTE_CONTACT_MISMATCH',
              severity: 'warning' as const,
              message: `Xero quote Contact name does not match Pipedrive organization`,
              dealId: deal.id,
              dealTitle: deal.title || deal.name,
              suggestedFix: `Quote Contact is "${matchedQuote.Contact.Name}" but Pipedrive org is "${deal.org_name}"`,
              metadata: {
                dealId: deal.id,
                dealTitle: deal.title || deal.name,
                xeroQuoteId: matchedQuote.QuoteID,
                xeroQuoteNumber: matchedQuote.QuoteNumber,
                pipedriveOrgName: deal.org_name,
                xeroContactName: matchedQuote.Contact.Name
              }
            };
            issues.push(issue);
            warningCount++;
            
            logger.debug({
              dealId: deal.id,
              pipedriveOrgName: deal.org_name,
              xeroContactName: matchedQuote.Contact.Name
            }, 'Quote contact name mismatch');
          }
        }

        // VALIDATION RULE 5: Value Alignment Check
        // Ensures financial consistency between quote total and deal value
        // Critical for accurate revenue reporting and financial reconciliation
        if (matchedQuote.Total !== undefined && deal.value !== undefined) {
          // Allow for minor rounding differences (0.01) due to currency precision
          const valueDifference = Math.abs(matchedQuote.Total - deal.value);
          
          // Financial discrepancy threshold: 0.01 allows for minor rounding differences
          // while catching significant value mismatches that indicate data issues
          if (valueDifference > 0.01) {
            const issue = {
              code: 'XERO_QUOTE_VALUE_MISMATCH',
              severity: 'error' as const,
              message: `Xero quote total does not match Pipedrive deal value`,
              dealId: deal.id,
              dealTitle: deal.title || deal.name,
              suggestedFix: `Quote total is ${matchedQuote.CurrencyCode || 'SGD'} ${matchedQuote.Total} but deal value is ${deal.currency || 'SGD'} ${deal.value}`,
              metadata: {
                dealId: deal.id,
                dealTitle: deal.title || deal.name,
                xeroQuoteId: matchedQuote.QuoteID,
                xeroQuoteNumber: matchedQuote.QuoteNumber,
                xeroQuoteTotal: matchedQuote.Total,
                xeroQuoteCurrency: matchedQuote.CurrencyCode || 'SGD',
                pipedriveValue: deal.value,
                pipedriveCurrency: deal.currency || 'SGD',
                difference: valueDifference
              }
            };
            issues.push(issue);
            errorCount++;
            
            logger.debug({
              dealId: deal.id,
              xeroQuoteTotal: matchedQuote.Total,
              pipedriveValue: deal.value,
              difference: valueDifference
            }, 'Quote value mismatch');
          }
        }

        // VALIDATION RULE 6: Status Consistency Check for Won Deals
        // Ensures won deals have corresponding ACCEPTED quotes in Xero
        // Maintains alignment between sales pipeline and quote workflow states
        if (deal.status === 'won' && matchedQuote.Status !== 'ACCEPTED') {
          const issue = {
            code: 'XERO_QUOTE_STATUS_NOT_ACCEPTED',
            severity: 'error' as const,
            message: `Xero quote status is not ACCEPTED for won deal`,
            dealId: deal.id,
            dealTitle: deal.title || deal.name,
            suggestedFix: `Won deal has quote with status "${matchedQuote.Status}". Quote should be ACCEPTED for won deals.`,
            metadata: {
              dealId: deal.id,
              dealTitle: deal.title || deal.name,
              xeroQuoteId: matchedQuote.QuoteID,
              xeroQuoteNumber: matchedQuote.QuoteNumber,
              xeroQuoteStatus: matchedQuote.Status,
              pipedriveDealStatus: deal.status
            }
          };
          issues.push(issue);
          errorCount++;
          
          logger.debug({
            dealId: deal.id,
            xeroQuoteStatus: matchedQuote.Status,
            dealStatus: deal.status
          }, 'Quote status not ACCEPTED for won deal');
        }
        
        // VALIDATION RULE 7: Status Consistency Check for Lost Deals
        // Ensures lost deals have corresponding DECLINED quotes in Xero
        // Maintains alignment between lost opportunities and declined quotes
        if (deal.status === 'lost' && matchedQuote.Status !== 'DECLINED') {
          const issue = {
            code: 'XERO_QUOTE_STATUS_NOT_DECLINED',
            severity: 'error' as const,
            message: `Xero quote status is not DECLINED for lost deal`,
            dealId: deal.id,
            dealTitle: deal.title || deal.name,
            suggestedFix: `Lost deal has quote with status "${matchedQuote.Status}". Quote should be DECLINED for lost deals.`,
            metadata: {
              dealId: deal.id,
              dealTitle: deal.title || deal.name,
              xeroQuoteId: matchedQuote.QuoteID,
              xeroQuoteNumber: matchedQuote.QuoteNumber,
              xeroQuoteStatus: matchedQuote.Status,
              pipedriveDealStatus: deal.status
            }
          };
          issues.push(issue);
          errorCount++;
          
          logger.debug({
            dealId: deal.id,
            xeroQuoteStatus: matchedQuote.Status,
            dealStatus: deal.status
          }, 'Quote status not DECLINED for lost deal');
        }
      }

      logger.info({
        quotesChecked,
        xeroQuotesTotal: xeroQuotes.length,
        issuesFound: issues.length,
        errors: errorCount,
        warnings: warningCount
      }, 'Xero quote validation completed');

      // Return comprehensive validation results for integration with main validation workflow
      return {
        issues,           // Array of validation issues found during quote checking
        errorCount,       // Count of critical errors requiring immediate attention
        warningCount,     // Count of warnings that should be reviewed
        quotesChecked     // Total number of deals that had quote validation performed
      };

    } catch (error) {
      // LOG AND RE-THROW: Critical errors that prevent validation completion
      // These are typically authentication failures or system-level issues
      logger.error({ 
        error: error instanceof Error ? error.message : error 
      }, 'Error during Xero quote validation');
      
      // Re-throw to allow calling code to handle the error appropriately
      throw error;
    }
  }

  /**
   * Notifies registered progress callback of validation workflow steps and status updates.
   * 
   * This method provides real-time progress tracking for validation operations, enabling
   * UI components to display current status and progress to users. It safely handles
   * cases where no callback is registered.
   * 
   * @description Sends progress updates to registered callback function for real-time status tracking
   * 
   * @param step - Progress step object containing:
   *   - id: Unique identifier for the validation step
   *   - name: Human-readable name of the operation
   *   - description: Detailed description of current activity
   *   - status: Current status ('running', 'completed', 'failed')
   *   - result?: Optional result data for completed steps
   *   - details?: Optional additional metadata
   * 
   * @example
   * ```typescript
   * this.notifyProgress({
   *   id: 'validate_xero_quotes',
   *   name: 'Validating Xero Quotes',
   *   description: 'Checking quote data consistency',
   *   status: 'running'
   * });
   * ```
   * 
   * @since 2025-08-11
   */
  private notifyProgress(step: any) {
    if (this.progressCallback) {
      this.progressCallback(step);
    }
  }
}