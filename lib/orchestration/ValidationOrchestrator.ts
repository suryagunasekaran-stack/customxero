/**
 * Validation orchestrator extending ProjectSyncOrchestrator for Pipedrive-Xero validation
 */

import { ProjectSyncOrchestrator } from './ProjectSyncOrchestrator';
import { XeroProjectService } from '../xeroProjectService';
import { SmartRateLimit } from '../smartRateLimit';
import { logger } from '../logger';
import type { SyncSession, SyncStep } from './types';
import type { PipedriveConfig } from '../utils/tenantConfig';
import type {
  PipedriveValidationContext,
  ValidationIssue,
  TitleValidationResult,
  QuoteValidationResult
} from '../validation/pipedriveValidationRules';
import type {
  PipedriveDeal,
  DetailedDeal
} from '../utils/pipedriveHelpers';
import {
  fetchDealsFromMultiplePipelines,
  fetchBatchDealDetails
} from '../utils/pipedriveHelpers';
import {
  validatePipedriveDeals,
  validateDealTitles,
  crossReferenceQuotes,
  generateProjectKey
} from '../validation/pipedriveValidationRules';

export interface ValidationSession extends SyncSession {
  validationResults?: ValidationResult;
}

export interface ValidationResult {
  tenantId: string;
  timestamp: Date;
  deals: ValidatedDeal[];
  quotes: ValidatedQuote[];
  projects: ValidatedProject[];
  summary: ValidationSummary;
  issues: ValidationIssue[];
}

export interface ValidatedDeal {
  id: number;
  title: string;
  normalizedTitle: string;
  pipelineId: number;
  pipelineName?: string;
  value: number;
  currency: string;
  xeroQuoteId?: string;
  xeroProjectId?: string;
  validationIssues: ValidationIssue[];
  customFields: Record<string, any>;
  matchedProject?: any;
  matchedQuote?: any;
}

export interface ValidatedQuote {
  QuoteID: string;
  QuoteNumber: string;
  Status: string;
  Total: number;
  matchedDealId?: number;
  validationIssues: ValidationIssue[];
}

export interface ValidatedProject {
  projectId: string;
  name: string;
  normalizedKey: string;
  status: string;
  totalAmount?: number;
  matchedDealId?: number;
  validationIssues: ValidationIssue[];
}

export interface ValidationSummary {
  totalDeals: number;
  totalQuotes: number;
  totalProjects: number;
  dealsWithIssues: number;
  quotesWithIssues: number;
  projectsWithIssues: number;
  totalIssues: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  matchedDealsToQuotes: number;
  matchedDealsToProjects: number;
  unmatchedDeals: number;
  unmatchedQuotes: number;
  unmatchedProjects: number;
}

/**
 * Orchestrates comprehensive validation workflows for Pipedrive-Xero data synchronization
 * 
 * @description Extends ProjectSyncOrchestrator to provide specialized validation capabilities
 * for cross-system data integrity checking between Pipedrive deals and Xero quotes/projects.
 * Manages complex multi-step validation workflows with real-time progress tracking.
 * 
 * @example
 * ```typescript
 * // Initialize validation orchestrator
 * const validator = new ValidationOrchestrator({
 *   progressCallback: (step) => console.log(`Step: ${step.name}`)
 * });
 * 
 * // Execute validation workflow
 * const session = await validator.executeValidationWorkflow(tenantId, pipedriveConfig);
 * 
 * if (session.validationResults) {
 *   const summary = session.validationResults.summary;
 *   console.log(`Validation completed: ${summary.totalIssues} issues found`);
 * }
 * ```
 * 
 * @since 1.0.0
 */
export class ValidationOrchestrator extends ProjectSyncOrchestrator {
  /**
   * Creates a new ValidationOrchestrator instance
   * 
   * @param {any} [config={}] - Configuration object passed to parent ProjectSyncOrchestrator
   */
  constructor(config: any = {}) {
    super(config);
  }
  
  /**
   * Override to create validation-specific steps
   */
  private createValidationSteps(): SyncStep[] {
    return [
      {
        id: 'fetch_pipedrive_deals',
        name: 'Fetch Pipedrive Deals',
        description: 'Retrieving deals from all configured pipelines',
        status: 'pending',
      },
      {
        id: 'fetch_xero_quotes',
        name: 'Fetch Xero Quotes',
        description: 'Retrieving quotes from Xero',
        status: 'pending',
      },
      {
        id: 'fetch_xero_projects',
        name: 'Fetch Xero Projects',
        description: 'Retrieving projects from Xero',
        status: 'pending',
      },
      {
        id: 'validate_titles',
        name: 'Validate Deal Titles',
        description: 'Checking deal title formats and normalization',
        status: 'pending',
      },
      {
        id: 'cross_reference',
        name: 'Cross-Reference Systems',
        description: 'Matching deals with quotes and projects',
        status: 'pending',
      },
      {
        id: 'generate_report',
        name: 'Generate Validation Report',
        description: 'Compiling validation results and issues',
        status: 'pending',
      },
    ];
  }
  
  /**
   * Executes a comprehensive validation workflow for a tenant's Pipedrive-Xero integration
   * 
   * @description Orchestrates a multi-step validation process that:
   * 1. Fetches data from Pipedrive and Xero systems
   * 2. Validates deal title formats and required fields
   * 3. Cross-references deals with quotes and projects
   * 4. Generates comprehensive validation report with issues
   * 
   * @param {string} tenantId - The unique identifier for the tenant to validate
   * @param {PipedriveConfig} pipedriveConfig - Tenant's Pipedrive configuration including API keys and field mappings
   * @returns {Promise<ValidationSession>} Promise resolving to complete validation session with results
   * 
   * @throws {Error} When validation workflow fails at any step
   * 
   * @example
   * ```typescript
   * const orchestrator = new ValidationOrchestrator();
   * 
   * try {
   *   const session = await orchestrator.executeValidationWorkflow(
   *     'ea67107e-c352-40a9-a8b8-24d81ae3fc85',
   *     {
   *       apiKey: 'pipedrive-key',
   *       companyDomain: 'api',
   *       pipelineIds: [2],
   *       customFieldKeys: { xeroQuoteId: 'abc123', vesselName: 'def456' },
   *       enabled: true
   *     }
   *   );
   * 
   *   const results = session.validationResults;
   *   if (results) {
   *     console.log(`Found ${results.summary.totalIssues} validation issues`);
   *     console.log(`${results.summary.matchedDealsToQuotes} deals matched to quotes`);
   *   }
   * } catch (error) {
   *   console.error('Validation failed:', error.message);
   * }
   * ```
   * 
   * @since 1.0.0
   */
  async executeValidationWorkflow(
    tenantId: string,
    pipedriveConfig: PipedriveConfig
  ): Promise<ValidationSession> {
    // Initialize session with validation steps
    const session = this.initializeSession(tenantId, pipedriveConfig.tenantName || 'Unknown');
    session.steps = this.createValidationSteps();
    
    try {
      (session as any).status = 'running';
      logger.info({ sessionId: session.id, tenantId }, 'Starting validation workflow');
      
      // Step 1: Fetch Pipedrive deals
      const pipedriveDeals = await this.executeValidationStep(
        'fetch_pipedrive_deals',
        async () => await this.fetchPipedriveDeals(pipedriveConfig)
      );
      
      // Step 2: Fetch Xero quotes
      const xeroQuotes = await this.executeValidationStep(
        'fetch_xero_quotes',
        async () => await this.fetchXeroQuotes(tenantId)
      );
      
      // Step 3: Fetch Xero projects
      const xeroProjects = await this.executeValidationStep(
        'fetch_xero_projects',
        async () => await this.fetchXeroProjects(tenantId)
      );
      
      // Step 4: Validate deal titles
      const titleValidations = await this.executeValidationStep(
        'validate_titles',
        async () => await this.validateDealsStep(pipedriveDeals)
      );
      
      // Step 5: Cross-reference systems
      const crossReferenceResult = await this.executeValidationStep(
        'cross_reference',
        async () => await this.crossReferenceStep(
          pipedriveDeals,
          xeroQuotes,
          xeroProjects,
          pipedriveConfig
        )
      );
      
      // Step 6: Generate report
      const validationResult = await this.executeValidationStep(
        'generate_report',
        async () => await this.generateReportStep(
          pipedriveDeals,
          xeroQuotes,
          xeroProjects,
          titleValidations,
          crossReferenceResult,
          pipedriveConfig
        )
      );
      
      // Complete session
      (session as any).endTime = new Date();
      (session as any).status = 'completed';
      (session as ValidationSession).validationResults = validationResult;
      
      logger.info({
        sessionId: session.id,
        summary: validationResult.summary
      }, 'Validation workflow completed');
      
      return session as ValidationSession;
      
    } catch (error) {
      (session as any).status = 'failed';
      (session as any).error = (error as Error).message;
      (session as any).endTime = new Date();
      
      logger.error({
        sessionId: session.id,
        error: (error as Error).message
      }, 'Validation workflow failed');
      
      throw error;
    }
  }
  
  /**
   * Execute a validation step using parent's protected method
   */
  private async executeValidationStep<T>(stepId: string, executor: () => Promise<T>): Promise<T> {
    // Access parent's private method through prototype
    const parentExecuteStep = (this as any).executeStep;
    if (typeof parentExecuteStep === 'function') {
      return parentExecuteStep.call(this, stepId, executor);
    }
    throw new Error('Parent executeStep method not accessible');
  }
  
  /**
   * Fetch deals from Pipedrive
   */
  private async fetchPipedriveDeals(config: PipedriveConfig): Promise<PipedriveDeal[]> {
    logger.info({ 
      domain: config.companyDomain,
      pipelines: config.pipelineIds 
    }, 'Fetching Pipedrive deals');
    
    // First fetch deal fields to understand custom field mapping
    const { fetchDealFields } = await import('@/lib/utils/pipedriveHelpers');
    await fetchDealFields(config.apiKey, config.companyDomain);
    
    // Apply rate limiting
    await SmartRateLimit.waitIfNeeded();
    
    const deals = await fetchDealsFromMultiplePipelines(
      config.apiKey,
      config.companyDomain,
      config.pipelineIds,
      'won' // Only fetch won deals for validation
    );
    
    logger.info({ dealCount: deals.length }, 'Fetched Pipedrive deals');
    return deals;
  }
  
  /**
   * Fetch quotes from Xero
   */
  private async fetchXeroQuotes(tenantId: string): Promise<any[]> {
    logger.info({ tenantId }, 'Fetching Xero quotes');
    
    try {
      // Use XeroProjectService or direct API call
      const response = await fetch('/api/xero/quotes', {
        headers: {
          'x-tenant-id': tenantId
        }
      });
      
      if (!response.ok) {
        // If quotes endpoint doesn't exist, return empty array
        logger.warn('Quotes endpoint not available, skipping quote validation');
        return [];
      }
      
      const data = await response.json();
      return data.quotes || [];
      
    } catch (error) {
      logger.error({ error: (error as Error).message }, 'Failed to fetch Xero quotes');
      return [];
    }
  }
  
  /**
   * Fetch projects from Xero
   */
  private async fetchXeroProjects(tenantId: string): Promise<any[]> {
    logger.info({ tenantId }, 'Fetching Xero projects');
    
    try {
      const projectData = await XeroProjectService.getProjectData('INPROGRESS');
      return projectData.projects || [];
    } catch (error) {
      logger.error({ error: (error as Error).message }, 'Failed to fetch Xero projects');
      return [];
    }
  }
  
  /**
   * Validate deal titles
   */
  private async validateDealsStep(deals: PipedriveDeal[]): Promise<TitleValidationResult[]> {
    logger.info({ dealCount: deals.length }, 'Validating deal titles');
    
    const titleValidations = validateDealTitles(deals);
    
    const stats = {
      total: titleValidations.length,
      valid: titleValidations.filter(v => v.isValid).length,
      invalid: titleValidations.filter(v => !v.isValid).length,
      withIssues: titleValidations.filter(v => v.issues.length > 0).length
    };
    
    logger.info(stats, 'Title validation completed');
    return titleValidations;
  }
  
  /**
   * Cross-reference deals with quotes and projects
   */
  private async crossReferenceStep(
    deals: PipedriveDeal[],
    quotes: any[],
    projects: any[],
    config: PipedriveConfig
  ): Promise<QuoteValidationResult[]> {
    logger.info('Cross-referencing deals with Xero data');
    
    const context: PipedriveValidationContext = {
      pipedriveDeals: deals,
      xeroQuotes: quotes,
      xeroProjects: projects,
      tenantConfig: {
        tenantId: config.companyDomain,
        pipedriveApiKey: config.apiKey,
        companyDomain: config.companyDomain,
        pipelineIds: config.pipelineIds,
        customFieldKeys: config.customFieldKeys,
        enabled: config.enabled
      }
    };
    
    const quoteValidations = crossReferenceQuotes(context);
    
    logger.info({
      dealsWithQuotes: quoteValidations.filter(q => q.hasQuote).length,
      dealsWithoutQuotes: quoteValidations.filter(q => !q.hasQuote).length
    }, 'Cross-reference completed');
    
    return quoteValidations;
  }
  
  /**
   * Generate validation report
   */
  private async generateReportStep(
    deals: PipedriveDeal[],
    quotes: any[],
    projects: any[],
    titleValidations: TitleValidationResult[],
    quoteValidations: QuoteValidationResult[],
    config: PipedriveConfig
  ): Promise<ValidationResult> {
    logger.info('Generating validation report');
    
    // Combine all issues
    const allIssues: ValidationIssue[] = [];
    
    // Collect title validation issues
    titleValidations.forEach(tv => {
      allIssues.push(...tv.issues);
    });
    
    // Collect quote validation issues
    quoteValidations.forEach(qv => {
      allIssues.push(...qv.issues);
    });
    
    // Map deals with their validation results
    const validatedDeals: ValidatedDeal[] = deals.map(deal => {
      const titleValidation = titleValidations.find(tv => tv.dealId === deal.id);
      const quoteValidation = quoteValidations.find(qv => qv.dealId === deal.id);
      const dealIssues: ValidationIssue[] = [];
      
      if (titleValidation) {
        dealIssues.push(...titleValidation.issues);
      }
      if (quoteValidation) {
        dealIssues.push(...quoteValidation.issues);
      }
      
      // Find matching project
      const normalizedKey = generateProjectKey(deal.title || deal.name || '');
      const matchedProject = projects.find(p => 
        generateProjectKey(p.name) === normalizedKey
      );
      
      return {
        id: deal.id,
        title: deal.title || deal.name || '',
        normalizedTitle: titleValidation?.normalizedTitle || '',
        pipelineId: deal.pipeline_id,
        value: deal.value,
        currency: deal.currency,
        xeroQuoteId: deal[config.customFieldKeys.xeroQuoteId],
        xeroProjectId: matchedProject?.projectId,
        validationIssues: dealIssues,
        customFields: this.extractCustomFields(deal, config.customFieldKeys),
        matchedProject,
        matchedQuote: quotes.find(q => q.QuoteID === deal[config.customFieldKeys.xeroQuoteId])
      };
    });
    
    // Map quotes with validation
    const validatedQuotes: ValidatedQuote[] = quotes.map(quote => {
      const matchedDeal = deals.find(d => 
        d[config.customFieldKeys.xeroQuoteId] === quote.QuoteID
      );
      
      return {
        QuoteID: quote.QuoteID,
        QuoteNumber: quote.QuoteNumber,
        Status: quote.Status,
        Total: quote.Total,
        matchedDealId: matchedDeal?.id,
        validationIssues: []
      };
    });
    
    // Map projects with validation
    const validatedProjects: ValidatedProject[] = projects.map(project => {
      const normalizedKey = generateProjectKey(project.name);
      const matchedDeal = deals.find(d => 
        generateProjectKey(d.title || d.name || '') === normalizedKey
      );
      
      const issues: ValidationIssue[] = [];
      if (!matchedDeal && project.status === 'INPROGRESS') {
        issues.push({
          severity: 'info',
          code: 'UNMATCHED_PROJECT',
          message: `Project "${project.name}" has no matching deal in Pipedrive`,
          field: 'project'
        });
      }
      
      return {
        projectId: project.projectId,
        name: project.name,
        normalizedKey,
        status: project.status,
        totalAmount: project.totalAmount?.value,
        matchedDealId: matchedDeal?.id,
        validationIssues: issues
      };
    });
    
    // Calculate summary
    const summary: ValidationSummary = {
      totalDeals: deals.length,
      totalQuotes: quotes.length,
      totalProjects: projects.length,
      dealsWithIssues: validatedDeals.filter(d => d.validationIssues.length > 0).length,
      quotesWithIssues: validatedQuotes.filter(q => q.validationIssues.length > 0).length,
      projectsWithIssues: validatedProjects.filter(p => p.validationIssues.length > 0).length,
      totalIssues: allIssues.length,
      errorCount: allIssues.filter(i => i.severity === 'error').length,
      warningCount: allIssues.filter(i => i.severity === 'warning').length,
      infoCount: allIssues.filter(i => i.severity === 'info').length,
      matchedDealsToQuotes: validatedDeals.filter(d => d.xeroQuoteId).length,
      matchedDealsToProjects: validatedDeals.filter(d => d.xeroProjectId).length,
      unmatchedDeals: validatedDeals.filter(d => !d.xeroProjectId && !d.xeroQuoteId).length,
      unmatchedQuotes: validatedQuotes.filter(q => !q.matchedDealId).length,
      unmatchedProjects: validatedProjects.filter(p => !p.matchedDealId).length
    };
    
    return {
      tenantId: config.companyDomain,
      timestamp: new Date(),
      deals: validatedDeals,
      quotes: validatedQuotes,
      projects: validatedProjects,
      summary,
      issues: allIssues
    };
  }
  
  /**
   * Extract custom fields from deal
   */
  private extractCustomFields(deal: PipedriveDeal, fieldKeys: any): Record<string, any> {
    const customFields: Record<string, any> = {};
    
    for (const [name, fieldId] of Object.entries(fieldKeys)) {
      if (deal[fieldId as string] !== undefined) {
        customFields[name] = deal[fieldId as string];
      }
    }
    
    return customFields;
  }
}