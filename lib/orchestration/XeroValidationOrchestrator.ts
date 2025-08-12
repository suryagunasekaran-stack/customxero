/**
 * @fileoverview Xero Quote Validation Orchestrator - Manages complex multi-step validation workflows
 * for Xero quotes with real-time progress tracking via Server-Sent Events (SSE).
 * 
 * This module provides orchestration capabilities for validating accepted Xero quotes against
 * business rules including quote number format compliance, tracking option validation, and
 * project code verification. It follows the orchestration pattern established in the
 * CustomXero architecture for managing complex workflows.
 * 
 * @module XeroValidationOrchestrator
 * @since 1.0.0
 * @author CustomXero Team
 */

import { logger } from '../logger';
import { ensureValidToken } from '../ensureXeroToken';
import { XeroQuoteService, type XeroQuote } from '../services/xeroQuoteService';
import { XeroValidationIssue, XeroValidationSession } from '../types/validation';

/**
 * Represents a single validation step within the orchestration workflow.
 * Used for progress tracking and real-time status updates via SSE.
 * 
 * @interface ValidationStep
 * @since 1.0.0
 * @example
 * ```typescript
 * const step: ValidationStep = {
 *   id: 'fetch_quotes',
 *   name: 'Fetching Accepted Quotes',
 *   description: 'Retrieving all accepted quotes from Xero',
 *   status: 'running',
 *   progress: 45
 * };
 * ```
 */
interface ValidationStep {
  /** Unique identifier for the validation step */
  id: string;
  /** Human-readable name of the validation step */
  name: string;
  /** Detailed description of what the step does */
  description: string;
  /** Current execution status of the step */
  status: 'pending' | 'running' | 'completed' | 'error' | 'skipped';
  /** Progress percentage (0-100) for the current step */
  progress?: number;
  /** Results data from completed step */
  result?: {
    /** Number of items processed */
    count?: number;
    /** Total issues found */
    totalIssues?: number;
    /** Number of error-level issues */
    errors?: number;
    /** Number of warning-level issues */
    warnings?: number;
  };
  /** Error message if step failed */
  error?: string;
}

/**
 * Configuration options for the XeroValidationOrchestrator.
 * 
 * @interface OrchestratorConfig
 * @since 1.0.0
 */
interface OrchestratorConfig {
  /** Optional callback function to receive real-time progress updates */
  progressCallback?: (step: ValidationStep) => void;
}

/**
 * Orchestrator class that manages complex multi-step Xero quote validation workflows.
 * 
 * This class implements the orchestration pattern used throughout CustomXero for managing
 * complex business processes. It provides real-time progress tracking via Server-Sent Events
 * and handles validation of accepted Xero quotes against business rules.
 * 
 * Key validation rules implemented:
 * - Quote number format: ProjectCode-QuoteNumber (e.g., NY255118-QU0428)
 * - Line item tracking options for financial reporting
 * - Project code format validation (2-10 alphanumeric characters)
 * 
 * The orchestrator follows a multi-step workflow:
 * 1. Fetch all accepted quotes from Xero API
 * 2. Validate quote formats and tracking options
 * 3. Generate detailed validation report with issues and suggestions
 * 
 * @class XeroValidationOrchestrator
 * @since 1.0.0
 * @example
 * ```typescript
 * const orchestrator = new XeroValidationOrchestrator({
 *   progressCallback: (step) => console.log(`Step: ${step.name} - ${step.status}`)
 * });
 * 
 * const session = await orchestrator.executeValidationWorkflow('tenant-123');
 * console.log(`Found ${session.issues.length} validation issues`);
 * ```
 */
export class XeroValidationOrchestrator {
  private progressCallback?: (step: ValidationStep) => void;

  /**
   * Creates a new XeroValidationOrchestrator instance.
   * 
   * @param {OrchestratorConfig} config - Configuration options for the orchestrator
   * @since 1.0.0
   * @example
   * ```typescript
   * const orchestrator = new XeroValidationOrchestrator({
   *   progressCallback: (step) => {
   *     console.log(`${step.name}: ${step.status}`);
   *   }
   * });
   * ```
   */
  constructor(config: OrchestratorConfig = {}) {
    if (config.progressCallback) {
      this.progressCallback = config.progressCallback;
    }
  }

  /**
   * Sets or updates the progress callback function for real-time updates.
   * 
   * @param {Function} callback - Function to call with progress updates
   * @since 1.0.0
   * @example
   * ```typescript
   * orchestrator.setProgressCallback((step) => {
   *   if (step.status === 'running' && step.progress) {
   *     console.log(`${step.name}: ${step.progress}%`);
   *   }
   * });
   * ```
   */
  setProgressCallback(callback: (step: ValidationStep) => void) {
    this.progressCallback = callback;
  }

  /**
   * Executes the complete Xero quote validation workflow.
   * 
   * This method orchestrates a multi-step validation process that:
   * 1. Fetches all accepted quotes from the Xero API
   * 2. Validates quote number formats against business rules
   * 3. Checks line items for tracking option compliance
   * 4. Validates project code formats
   * 5. Generates a comprehensive validation session with detailed results
   * 
   * The method provides real-time progress updates through the configured callback
   * function, making it suitable for Server-Sent Events (SSE) implementations.
   * 
   * @param {string} tenantId - The Xero tenant ID to validate quotes for
   * @returns {Promise<XeroValidationSession>} A complete validation session with all results
   * @throws {Error} If Xero API calls fail or validation process encounters errors
   * @since 1.0.0
   * @example
   * ```typescript
   * try {
   *   const session = await orchestrator.executeValidationWorkflow('xero-tenant-123');
   *   
   *   console.log(`Processed ${session.quotesProcessed} quotes`);
   *   console.log(`Found ${session.issues.length} issues`);
   *   console.log(`Errors: ${session.errorCount}, Warnings: ${session.warningCount}`);
   *   
   *   // Access individual issues
   *   session.issues.forEach(issue => {
   *     console.log(`${issue.severity}: ${issue.message}`);
   *   });
   * } catch (error) {
   *   console.error('Validation failed:', error.message);
   * }
   * ```
   */
  async executeValidationWorkflow(tenantId: string): Promise<XeroValidationSession> {
    const session: XeroValidationSession = {
      id: `xero-validation-${Date.now()}`,
      tenantId,
      startTime: new Date(),
      status: 'running',
      quotesProcessed: 0,
      totalQuotes: 0,
      issues: [],
      errorCount: 0,
      warningCount: 0
    };

    try {
      logger.info({ 
        tenantId,
        sessionId: session.id
      }, 'Starting Xero validation workflow');

      // Get Xero authentication
      const { effective_tenant_id } = await ensureValidToken();
      
      // Step 1: Fetch ACCEPTED quotes from Xero
      this.notifyProgress({
        id: 'fetch_quotes',
        name: 'Fetching Accepted Quotes',
        description: 'Retrieving all accepted quotes from Xero',
        status: 'running'
      });

      const acceptedQuotes = await XeroQuoteService.fetchAllQuotes(effective_tenant_id, 'ACCEPTED');
      
      // Fetch and log tracking categories after getting quotes
      await this.fetchAndLogTrackingCategories(effective_tenant_id);
      
      session.totalQuotes = acceptedQuotes.length;

      logger.info({ 
        totalQuotes: acceptedQuotes.length,
        tenantId: effective_tenant_id
      }, 'Fetched accepted quotes from Xero');

      this.notifyProgress({
        id: 'fetch_quotes',
        name: 'Fetching Accepted Quotes',
        description: `Retrieved ${acceptedQuotes.length} accepted quotes`,
        status: 'completed',
        result: { count: acceptedQuotes.length }
      });

      // Step 2: Validate quote formats and tracking options
      this.notifyProgress({
        id: 'validate_quotes',
        name: 'Validating Quote Formats',
        description: 'Checking quote number formats and tracking options',
        status: 'running',
        progress: 0
      });

      const validationResults = await this.validateQuotes(acceptedQuotes, effective_tenant_id);
      
      session.issues = validationResults.issues;
      session.errorCount = validationResults.errorCount;
      session.warningCount = validationResults.warningCount;
      session.quotesProcessed = acceptedQuotes.length;

      this.notifyProgress({
        id: 'validate_quotes',
        name: 'Validating Quote Formats',
        description: `Found ${validationResults.issues.length} issues`,
        status: 'completed',
        result: { 
          totalIssues: validationResults.issues.length,
          errors: validationResults.errorCount,
          warnings: validationResults.warningCount
        }
      });

      session.status = 'completed';
      session.endTime = new Date();

      logger.info({ 
        sessionId: session.id,
        duration: session.endTime.getTime() - session.startTime.getTime(),
        issuesFound: session.issues.length
      }, 'Xero validation completed');

      return session;

    } catch (error) {
      logger.error({ error }, 'Xero validation failed');
      session.status = 'failed';
      session.endTime = new Date();
      throw error;
    }
  }

  /**
   * Validates a collection of Xero quotes against business rules and format requirements.
   * 
   * This method performs comprehensive validation including:
   * - Quote number format validation (ProjectCode-QuoteNumber pattern)
   * - Project code length and format validation (2-10 alphanumeric characters)
   * - Line item tracking option validation for financial reporting
   * 
   * The validation uses regular expressions to enforce the quote number format:
   * `[A-Z0-9]{2,10}-QU\d{4}(-\d+)?(-v\d+)?$`
   * 
   * Examples of valid formats:
   * - NY255118-QU0428
   * - ABC123-QU1234-1 (with revision)
   * - XYZ789-QU5678-v2 (with version)
   * 
   * @private
   * @param {XeroQuote[]} quotes - Array of accepted quotes to validate
   * @param {string} tenantId - Xero tenant ID for logging context
   * @returns {Promise<{issues: XeroValidationIssue[], errorCount: number, warningCount: number}>} 
   *   Validation results with categorized issues
   * @since 1.0.0
   */
  private async validateQuotes(
    quotes: XeroQuote[],
    tenantId: string
  ): Promise<{ issues: XeroValidationIssue[]; errorCount: number; warningCount: number }> {
    const issues: XeroValidationIssue[] = [];
    let errorCount = 0;
    let warningCount = 0;
    let processedCount = 0;

    for (const quote of quotes) {
      processedCount++;
      
      // Update progress
      if (this.progressCallback && processedCount % 10 === 0) {
        const progress = Math.round((processedCount / quotes.length) * 100);
        this.notifyProgress({
          id: 'validate_quotes',
          name: 'Validating Quote Formats',
          description: `Processing quote ${processedCount} of ${quotes.length}`,
          status: 'running',
          progress
        });
      }

      // Validation 1: Check quote number format
      if (quote.QuoteNumber) {
        let isValidFormat = false;
        let specificIssue = '';
        let suggestedFix = '';
        
        // Check if quote starts with a project code
        const hasProjectCode = /^[A-Z0-9]+(-|$)/.test(quote.QuoteNumber);
        
        if (!hasProjectCode || quote.QuoteNumber.startsWith('QU')) {
          // Missing project code entirely
          specificIssue = 'Quote number is missing project code prefix';
          suggestedFix = 'Add project code before quote number (e.g., "NY255118-QU0428")';
        } else {
          // Has project code - check format based on project type
          const projectCode = quote.QuoteNumber.split('-')[0];
          const isEDProject = projectCode.toUpperCase().startsWith('ED');
          
          if (isEDProject) {
            // ED PROJECT SPECIAL HANDLING
            // ED projects allow flexible format: ProjectCode-[MiddlePart]-QUxxxx
            // Examples: 
            // - ED241903-QU0005-1 (standard)
            // - ED241903-ESE-QU0005-1 (with middle part)
            // - ED241903-DESC-CODE-QU0005-1-v2 (multiple middle parts with version)
            
            // Check if it contains QU followed by digits somewhere in the string
            const hasQuotePattern = /-QU\d+/i.test(quote.QuoteNumber);
            
            if (hasQuotePattern) {
              // Valid ED format - has project code and QU pattern
              isValidFormat = true;
              
              logger.debug({
                quoteNumber: quote.QuoteNumber,
                projectCode,
                format: 'ED project with flexible format'
              }, 'Valid ED project quote format');
            } else {
              // ED project but missing QU pattern
              specificIssue = `ED project quote missing QU number pattern`;
              suggestedFix = `ED quotes should contain -QUxxxx pattern (e.g., ${projectCode}-ESE-QU0001)`;
            }
          } else {
            // STANDARD PROJECT FORMAT VALIDATION
            // Non-ED projects must follow strict format: ProjectCode-QUxxxx[-version]
            // Allow both "ProjectCode-QUxxxx" and "ProjectCode - QUxxxx" (with spaces)
            const standardFormatRegex = /^[A-Z0-9]{2,10}(\s)?-(\s)?QU\d{4}(-\d+)?(-v\d+)?$/;
            
            if (standardFormatRegex.test(quote.QuoteNumber)) {
              isValidFormat = true;
            } else {
              // Check for specific issues
              if (!quote.QuoteNumber.includes('QU')) {
                specificIssue = 'Quote number part should start with "QU"';
                suggestedFix = `Quote number after project code should start with "QU" (e.g., "${projectCode}-QU0428")`;
              } else if (!quote.QuoteNumber.includes('-')) {
                specificIssue = 'Quote number is missing dash separator';
                suggestedFix = `Format should be "${projectCode}-QuoteNumber" (e.g., "${projectCode}-QU0428")`;
              } else {
                // Has QU but format is non-standard
                specificIssue = 'Quote number has non-standard format';
                suggestedFix = `Standard format: ${projectCode}-QUxxxx (e.g., "${projectCode}-QU0428")`;
              }
            }
          }
        }
        
        // Add issue if format is invalid
        if (!isValidFormat && specificIssue) {
          const issue: XeroValidationIssue = {
            severity: 'warning',
            code: 'INVALID_QUOTE_FORMAT',
            message: specificIssue,
            quoteNumber: quote.QuoteNumber,
            quoteId: quote.QuoteID,
            suggestedFix,
            metadata: {
              expectedFormat: quote.QuoteNumber.startsWith('ED') ? 
                'ED projects: ProjectCode-[OptionalMiddle]-QUxxxx' : 
                'Standard: ProjectCode-QUxxxx (e.g., NY255118-QU0428)',
              actualFormat: quote.QuoteNumber,
              contactName: quote.Contact?.Name,
              quoteTotal: quote.Total,
              reference: quote.Reference
            }
          };
          
          issues.push(issue);
          warningCount++;
          
          logger.debug({
            quoteNumber: quote.QuoteNumber,
            quoteId: quote.QuoteID,
            issue: specificIssue
          }, 'Invalid quote format detected');
        }
      }

      // Validation 2: Check for tracking options in line items
      if (quote.LineItems && quote.LineItems.length > 0) {
        let lineItemsWithoutTracking = 0;
        let lineItemsDetails: string[] = [];
        
        for (const lineItem of quote.LineItems) {
          // Check if line item has tracking category information
          // Tracking is an array on each line item that contains tracking category assignments
          if (!lineItem.Tracking || !Array.isArray(lineItem.Tracking) || lineItem.Tracking.length === 0) {
            lineItemsWithoutTracking++;
            
            // Collect details about the line item missing tracking
            const itemDesc = lineItem.Description ? 
              lineItem.Description.substring(0, 50) + (lineItem.Description.length > 50 ? '...' : '') : 
              'No description';
            lineItemsDetails.push(`• ${itemDesc} (Amount: ${lineItem.LineAmount || 0})`);
          } else {
            // Validate that tracking categories are properly assigned
            for (const tracking of lineItem.Tracking) {
              if (!tracking.TrackingCategoryID || !tracking.TrackingOptionID) {
                lineItemsWithoutTracking++;
                const itemDesc = lineItem.Description ? 
                  lineItem.Description.substring(0, 50) + (lineItem.Description.length > 50 ? '...' : '') : 
                  'No description';
                lineItemsDetails.push(`• ${itemDesc} - Invalid tracking configuration`);
                break;
              }
            }
          }
        }
        
        if (lineItemsWithoutTracking > 0) {
          // This is now an ERROR since tracking is required for proper financial reporting
          const issue: XeroValidationIssue = {
            severity: 'error',  // Changed from 'info' to 'error'
            code: 'MISSING_TRACKING_OPTIONS',
            message: `Quote has ${lineItemsWithoutTracking} line item(s) without proper tracking categories`,
            quoteNumber: quote.QuoteNumber || 'Unknown',
            quoteId: quote.QuoteID,
            suggestedFix: 'All line items must have tracking categories assigned. In Xero, edit the quote and assign a Trade tracking category to each line item.',
            metadata: {
              lineItemsWithoutTracking,
              totalLineItems: quote.LineItems.length,
              contactName: quote.Contact?.Name,
              quoteTotal: quote.Total,
              missingTrackingDetails: lineItemsDetails.slice(0, 5).join('\n'), // Show first 5 items
              reference: quote.Reference
            }
          };
          
          issues.push(issue);
          errorCount++;  // Increment error count since this is now an error
          
          logger.debug({
            quoteNumber: quote.QuoteNumber,
            lineItemsWithoutTracking,
            totalLineItems: quote.LineItems.length,
            details: lineItemsDetails.slice(0, 3) // Log first 3 for debugging
          }, 'Line items missing tracking categories');
        }
      }

      // Validation 3: Check project code validity (if we can extract it)
      if (quote.QuoteNumber && quote.QuoteNumber.includes('-')) {
        const projectCode = quote.QuoteNumber.split('-')[0];
        
        // Basic project code validation
        if (projectCode.length < 2 || projectCode.length > 10) {
          const issue: XeroValidationIssue = {
            severity: 'warning',
            code: 'INVALID_PROJECT_CODE',
            message: `Project code "${projectCode}" has invalid length`,
            quoteNumber: quote.QuoteNumber,
            quoteId: quote.QuoteID,
            suggestedFix: 'Project codes should be 2-10 characters long',
            metadata: {
              projectCode,
              contactName: quote.Contact?.Name,
              quoteTotal: quote.Total
            }
          };
          
          issues.push(issue);
          warningCount++;
        }
      }
    }

    logger.info({
      quotesProcessed: quotes.length,
      issuesFound: issues.length,
      errors: errorCount,
      warnings: warningCount
    }, 'Quote validation completed');

    return {
      issues,
      errorCount,
      warningCount
    };
  }

  /**
   * Sends progress updates to the configured callback function.
   * 
   * This method is used internally to provide real-time progress updates
   * during the validation workflow. It safely handles cases where no
   * callback is configured.
   * 
   * @private
   * @param {ValidationStep} step - The current validation step with status and progress
   * @since 1.0.0
   */
  private notifyProgress(step: ValidationStep) {
    if (this.progressCallback) {
      this.progressCallback(step);
    }
  }

  /**
   * Fetches and logs tracking categories from Xero API.
   * 
   * Makes a direct API call to Xero to retrieve all tracking categories
   * and logs them to the console for debugging purposes.
   * 
   * @private
   * @param {string} tenantId - The Xero tenant ID
   * @returns {Promise<void>} Promise that resolves when tracking categories are fetched and logged
   * @since 1.0.0
   */
  private async fetchAndLogTrackingCategories(tenantId: string): Promise<void> {
    try {
      // Get the access token using the same method as XeroQuoteService
      const { access_token } = await ensureValidToken();
      
      const apiUrl = 'https://api.xero.com/api.xro/2.0/TrackingCategories';
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'xero-tenant-id': tenantId,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.error(`❌ Failed to fetch tracking categories: ${response.status} ${response.statusText}`);
        return;
      }

      const data = await response.json();
      
      // Log the tracking categories response to console
      console.log('\n' + '='.repeat(80));
      console.log('📊 XERO TRACKING CATEGORIES');
      console.log('='.repeat(80));
      console.log(JSON.stringify(data, null, 2));
      console.log('='.repeat(80));
      
      // Log a simple summary
      if (data.TrackingCategories && Array.isArray(data.TrackingCategories)) {
        console.log('\nSUMMARY:');
        console.log(`Total Categories: ${data.TrackingCategories.length}`);
        
        data.TrackingCategories.forEach((category: any) => {
          console.log(`\n📁 ${category.Name} (${category.Status})`);
          console.log(`   ID: ${category.TrackingCategoryID}`);
          if (category.Options && category.Options.length > 0) {
            console.log(`   Options (${category.Options.length}):`);
            category.Options.forEach((option: any) => {
              const active = option.IsActive ? '✅' : '❌';
              console.log(`     ${active} ${option.Name} [${option.TrackingOptionID}]`);
            });
          }
        });
      }
      console.log('='.repeat(80) + '\n');
      
    } catch (error) {
      console.error('❌ Error fetching tracking categories:', error);
    }
  }
}