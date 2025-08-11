/**
 * Orchestrator for fixing validation issues in Pipedrive deals.
 * 
 * The FixOrchestrator is the central coordinator for the automated fix system.
 * It manages the entire lifecycle of fix operations including:
 * 
 * - Session management and progress tracking
 * - Handler registration and issue routing
 * - Batch processing with rate limiting
 * - Circuit breaker pattern for reliability
 * - Rollback capabilities for error recovery
 * - Real-time progress updates via callbacks
 * 
 * The orchestrator implements a resilient workflow that can handle
 * API failures, rate limits, and other operational challenges while
 * providing comprehensive logging and monitoring capabilities.
 * 
 * @fileoverview Fix Orchestrator - Main coordination class
 * @since 2024
 */

import {
  FixSession,
  FixStep,
  FixResult,
  FixSummary,
  ValidationIssue,
  FixProgressCallback,
  FixOrchestrationConfig,
  DEFAULT_FIX_CONFIG,
  FixHandlerContext
} from './fixTypes';
import { FixHandler } from './handlers/FixHandler';
import { TitleFormatFixHandler } from './handlers/TitleFormatFixHandler';
import { logger } from '@/lib/logger';
import { tenantConfigService } from '@/lib/services/tenantConfigService';

/**
 * Main orchestration class for managing fix operations.
 * 
 * This class coordinates the entire fix process from issue analysis through
 * completion, providing progress tracking, error handling, and rollback
 * capabilities. It uses a session-based approach to track state and
 * implements various reliability patterns.
 * 
 * Key features:
 * - Session-based state management
 * - Pluggable fix handler system
 * - Circuit breaker for failure resilience
 * - Batch processing with rate limiting
 * - Real-time progress callbacks
 * - Comprehensive rollback support
 * 
 * @class FixOrchestrator
 * @since 2024
 * @example
 * ```typescript
 * const orchestrator = new FixOrchestrator({
 *   batchSize: 5,
 *   retryAttempts: 2
 * });
 * 
 * orchestrator.setProgressCallback((step) => {
 *   console.log(`Step ${step.name}: ${step.progress}%`);
 * });
 * 
 * const session = orchestrator.initializeSession(tenantId, tenantName, issues);
 * const result = await orchestrator.executeFixWorkflow(apiKey, domain);
 * ```
 */
export class FixOrchestrator {
  /** Current fix session state */
  private session: FixSession | null = null;
  
  /** Callback function for progress updates */
  private progressCallback: FixProgressCallback | null = null;
  
  /** Configuration settings for orchestration behavior */
  private config: FixOrchestrationConfig;
  
  /** Map of issue codes to their corresponding fix handlers */
  private handlers: Map<string, FixHandler> = new Map();
  
  /** Count of consecutive failures for circuit breaker */
  private circuitBreakerFailures = 0;
  
  /** Timestamp when circuit breaker should reset (0 = closed) */
  private circuitBreakerOpenUntil = 0;

  /**
   * Creates a new FixOrchestrator instance.
   * 
   * Initializes the orchestrator with the provided configuration,
   * merging it with default values. Automatically registers
   * available fix handlers.
   * 
   * @param {Partial<FixOrchestrationConfig>} config - Optional configuration overrides
   * @constructor
   * @since 2024
   */
  constructor(config: Partial<FixOrchestrationConfig> = {}) {
    this.config = { ...DEFAULT_FIX_CONFIG, ...config };
    this.initializeHandlers();
  }

  /**
   * Initializes and registers all available fix handlers.
   * 
   * This method sets up the handler registry by instantiating
   * and registering each available handler type. New handlers
   * should be added here when implemented.
   * 
   * @private
   * @returns {void}
   * @since 2024
   */
  private initializeHandlers(): void {
    // Register the title format fix handler
    const titleHandler = new TitleFormatFixHandler();
    this.registerHandler(titleHandler);
    
    // TODO: Additional handlers can be registered here in the future
    // e.g., this.registerHandler(new PipelineFixHandler());
    // e.g., this.registerHandler(new DataConsistencyFixHandler());
  }

  /**
   * Registers a fix handler for its supported issue codes.
   * 
   * Maps each issue code supported by the handler to the handler
   * instance in the registry. Handlers can support multiple issue
   * codes but each code can only have one handler.
   * 
   * @private
   * @param {FixHandler} handler - The handler to register
   * @returns {void}
   * @since 2024
   */
  private registerHandler(handler: FixHandler): void {
    for (const code of handler.supportedIssueCodes) {
      this.handlers.set(code, handler);
    }
    
    logger.info({ 
      handlerId: handler.handlerId,
      supportedCodes: handler.supportedIssueCodes 
    }, 'Registered fix handler');
  }

  /**
   * Sets the callback function for receiving progress updates.
   * 
   * The callback will be invoked whenever a workflow step updates
   * its status or progress. This enables real-time UI updates
   * via Server-Sent Events or other communication channels.
   * 
   * @param {FixProgressCallback} callback - Function to call with progress updates
   * @returns {void}
   * @since 2024
   */
  setProgressCallback(callback: FixProgressCallback): void {
    this.progressCallback = callback;
  }

  /**
   * Initializes a new fix session with the provided issues.
   * 
   * Creates a new session object to track the fix process, filtering
   * out certain issue types that cannot be automatically fixed.
   * Currently excludes pipeline violation issues as they require
   * manual business logic decisions.
   * 
   * @param {string} tenantId - Unique identifier for the tenant
   * @param {string} tenantName - Human-readable tenant name
   * @param {ValidationIssue[]} issues - Array of validation issues to fix
   * @returns {FixSession} The initialized session object
   * @throws {Error} If session initialization fails
   * @since 2024
   */
  initializeSession(
    tenantId: string,
    tenantName: string,
    issues: ValidationIssue[]
  ): FixSession {
    this.session = {
      id: `fix_${Date.now()}`,
      tenantId,
      tenantName,
      startTime: new Date(),
      status: 'pending',
      // Filter out issues that cannot be automatically fixed
      issues: issues.filter(issue => 
        issue.code !== 'WON_DEAL_IN_UNQUALIFIED_PIPELINE' && 
        issue.code !== 'OPEN_DEAL_IN_WRONG_PIPELINE'
      ),
      fixResults: []
    };

    logger.info({
      sessionId: this.session.id,
      tenantId,
      tenantName,
      totalIssues: this.session.issues.length,
      excludedPipelineViolations: issues.length - this.session.issues.length
    }, 'Fix session initialized');

    return this.session;
  }

  /**
   * Executes the complete fix workflow for the current session.
   * 
   * Orchestrates the entire fix process through defined steps:
   * 1. Analyze issues to identify fixable ones
   * 2. Validate that fixes can be safely applied
   * 3. Apply fixes in controlled batches
   * 4. Generate comprehensive summary report
   * 
   * The workflow includes error handling, progress tracking, and
   * session state management throughout execution.
   * 
   * @param {string} apiKey - Pipedrive API key for authentication
   * @param {string} companyDomain - Company domain for API calls
   * @returns {Promise<FixSession>} Promise resolving to completed session with results
   * @throws {Error} If session not initialized or workflow execution fails
   * @since 2024
   */
  async executeFixWorkflow(
    apiKey: string,
    companyDomain: string
  ): Promise<FixSession> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    try {
      this.session.status = 'running';
      logger.info({ sessionId: this.session.id }, 'Starting fix workflow execution');

      const steps = this.createFixSteps();
      
      // Step 1: Analyze issues to identify which can be fixed
      const fixableIssues = await this.executeStep(
        steps.find(s => s.id === 'analyze_issues')!,
        async () => this.analyzeIssues()
      );

      // Step 2: Validate that fixes can be safely applied
      const validatedIssues = await this.executeStep(
        steps.find(s => s.id === 'validate_fixes')!,
        async () => this.validateFixes(fixableIssues, apiKey, companyDomain)
      );

      // Step 3: Apply fixes in controlled batches
      const fixResults = await this.executeStep(
        steps.find(s => s.id === 'apply_fixes')!,
        async () => this.applyFixes(validatedIssues, apiKey, companyDomain)
      );

      // Step 4: Generate comprehensive summary
      const summary = await this.executeStep(
        steps.find(s => s.id === 'generate_summary')!,
        async () => this.generateSummary(fixResults)
      );

      // Complete session with results
      this.session.endTime = new Date();
      this.session.status = 'completed';
      this.session.fixResults = fixResults;
      this.session.summary = summary;

      logger.info({
        sessionId: this.session.id,
        duration: this.session.endTime.getTime() - this.session.startTime.getTime(),
        summary: {
          fixed: summary.fixedCount,
          skipped: summary.skippedCount,
          failed: summary.failedCount
        }
      }, 'Fix workflow completed successfully');

      return this.session;
    } catch (error) {
      // Update session with failure information
      if (this.session) {
        this.session.status = 'failed';
        this.session.error = (error as Error).message;
        this.session.endTime = new Date();
      }

      logger.error({
        sessionId: this.session?.id,
        error: (error as Error).message
      }, 'Fix workflow failed');

      throw error;
    }
  }

  /**
   * Creates the standard workflow steps for fix processing.
   * 
   * Defines the four main phases of the fix workflow with
   * appropriate metadata for progress tracking and UI display.
   * 
   * @private
   * @returns {FixStep[]} Array of workflow step definitions
   * @since 2024
   */
  private createFixSteps(): FixStep[] {
    return [
      {
        id: 'analyze_issues',
        name: 'Analyze Issues',
        description: 'Identifying fixable issues',
        status: 'pending'
      },
      {
        id: 'validate_fixes',
        name: 'Validate Fixes',
        description: 'Validating fix operations',
        status: 'pending'
      },
      {
        id: 'apply_fixes',
        name: 'Apply Fixes',
        description: 'Applying fixes to deals',
        status: 'pending'
      },
      {
        id: 'generate_summary',
        name: 'Generate Summary',
        description: 'Creating fix report',
        status: 'pending'
      }
    ];
  }

  /**
   * Executes a single workflow step with progress tracking and error handling.
   * 
   * Provides a wrapper for step execution that handles:
   * - Progress state management
   * - Timing and duration tracking
   * - Error handling and logging
   * - Progress callbacks for real-time updates
   * 
   * @private
   * @template T The return type of the step executor
   * @param {FixStep} step - The step definition to execute
   * @param {() => Promise<T>} executor - Async function that performs the step logic
   * @returns {Promise<T>} Promise resolving to the step execution result
   * @throws {Error} Re-throws errors from step execution after logging
   * @since 2024
   */
  private async executeStep<T>(
    step: FixStep,
    executor: () => Promise<T>
  ): Promise<T> {
    try {
      // Initialize step execution
      this.updateStep(step.id, {
        status: 'running',
        startTime: new Date(),
        progress: 0
      });

      logger.debug({ stepId: step.id, stepName: step.name }, 'Executing fix step');

      // Simulate intermediate progress after brief delay
      setTimeout(() => {
        if (step.status === 'running') {
          this.updateStep(step.id, { progress: 50 });
        }
      }, 100);

      // Execute the actual step logic
      const result = await executor();

      // Mark step as completed
      this.updateStep(step.id, {
        status: 'completed',
        endTime: new Date(),
        result,
        progress: 100
      });

      logger.debug({
        stepId: step.id,
        stepName: step.name,
        duration: step.endTime ? step.endTime.getTime() - (step.startTime?.getTime() || 0) : 0
      }, 'Fix step completed');

      return result;
    } catch (error) {
      // Mark step as failed with error details
      this.updateStep(step.id, {
        status: 'error',
        error: (error as Error).message,
        endTime: new Date(),
        progress: 0
      });

      logger.error({
        stepId: step.id,
        stepName: step.name,
        error: (error as Error).message
      }, 'Fix step failed');

      throw error;
    }
  }

  /**
   * Updates a workflow step and triggers progress callback.
   * 
   * Applies partial updates to a step and notifies any registered
   * progress callback for real-time UI updates.
   * 
   * @private
   * @param {string} stepId - ID of the step to update
   * @param {Partial<FixStep>} updates - Partial step data to apply
   * @returns {void}
   * @since 2024
   */
  private updateStep(stepId: string, updates: Partial<FixStep>): void {
    if (!this.session) return;

    const step = this.createFixSteps().find(s => s.id === stepId);
    if (!step) return;

    // Apply updates to step object
    Object.assign(step, updates);

    // Notify progress callback if registered
    if (this.progressCallback) {
      this.progressCallback(step);
    }
  }

  /**
   * Analyzes validation issues to determine which can be automatically fixed.
   * 
   * Iterates through session issues and checks if registered handlers
   * can process each issue type. Only issues with available handlers
   * proceed to the validation phase.
   * 
   * @private
   * @returns {Promise<ValidationIssue[]>} Promise resolving to array of fixable issues
   * @since 2024
   */
  private async analyzeIssues(): Promise<ValidationIssue[]> {
    if (!this.session) return [];

    const fixableIssues: ValidationIssue[] = [];

    // Check each issue against available handlers
    for (const issue of this.session.issues) {
      const handler = this.handlers.get(issue.code);
      
      if (handler && handler.canHandle(issue)) {
        fixableIssues.push(issue);
        logger.debug({
          issueCode: issue.code,
          dealId: issue.metadata.dealId,
          handler: handler.handlerId
        }, 'Issue is fixable');
      } else {
        logger.debug({
          issueCode: issue.code,
          dealId: issue.metadata.dealId
        }, 'No handler available for issue');
      }
    }

    logger.info({
      totalIssues: this.session.issues.length,
      fixableIssues: fixableIssues.length
    }, 'Issue analysis completed');

    return fixableIssues;
  }

  /**
   * Validates that fixes can be safely applied to the given issues.
   * 
   * Performs deeper validation including API calls to verify current state,
   * check permissions, and ensure fix prerequisites are met for each issue.
   * 
   * @private
   * @param {ValidationIssue[]} issues - Array of validation issues to validate
   * @param {string} apiKey - Pipedrive API key for authentication
   * @param {string} companyDomain - Company domain for API calls
   * @returns {Promise<ValidationIssue[]>} Promise resolving to array of validated issues
   * @since 2024
   */
  private async validateFixes(
    issues: ValidationIssue[],
    apiKey: string,
    companyDomain: string
  ): Promise<ValidationIssue[]> {
    const validatedIssues: ValidationIssue[] = [];
    const context: FixHandlerContext = {
      apiKey,
      companyDomain,
      tenantId: this.session?.tenantId || '',
      config: this.config
    };

    for (const issue of issues) {
      const handler = this.handlers.get(issue.code);
      
      if (handler) {
        try {
          const isValid = await handler.validate(issue, context);
          
          if (isValid) {
            validatedIssues.push(issue);
            logger.debug({
              issueCode: issue.code,
              dealId: issue.metadata.dealId
            }, 'Issue validated for fixing');
          } else {
            logger.debug({
              issueCode: issue.code,
              dealId: issue.metadata.dealId
            }, 'Issue failed validation');
          }
        } catch (error) {
          logger.error({
            error: error instanceof Error ? error.message : error,
            issueCode: issue.code,
            dealId: issue.metadata.dealId
          }, 'Error validating issue');
        }
      }
    }

    logger.info({
      validated: validatedIssues.length,
      rejected: issues.length - validatedIssues.length
    }, 'Fix validation completed');

    return validatedIssues;
  }

  /**
   * Applies fixes to validated issues in controlled batches.
   * 
   * Processes fixes using circuit breaker pattern and retry logic.
   * Handles rate limiting and provides comprehensive error handling.
   * 
   * @private
   * @param {ValidationIssue[]} issues - Array of validated issues to fix
   * @param {string} apiKey - Pipedrive API key for authentication
   * @param {string} companyDomain - Company domain for API calls
   * @returns {Promise<FixResult[]>} Promise resolving to array of fix results
   * @since 2024
   */
  private async applyFixes(
    issues: ValidationIssue[],
    apiKey: string,
    companyDomain: string
  ): Promise<FixResult[]> {
    const results: FixResult[] = [];
    const context: FixHandlerContext = {
      apiKey,
      companyDomain,
      tenantId: this.session?.tenantId || '',
      config: this.config
    };

    // Process in batches
    for (let i = 0; i < issues.length; i += this.config.batchSize) {
      // Check circuit breaker
      if (this.isCircuitBreakerOpen()) {
        logger.warn('Circuit breaker is open, skipping remaining fixes');
        break;
      }

      const batch = issues.slice(i, i + this.config.batchSize);
      const batchResults = await this.processBatch(batch, context);
      results.push(...batchResults);

      // Add delay between batches
      if (i + this.config.batchSize < issues.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  /**
   * Processes a single batch of fix operations.
   * 
   * Handles individual fix execution, error handling, and result aggregation
   * for a batch of validation issues.
   * 
   * @private
   * @param {ValidationIssue[]} batch - Batch of issues to process
   * @param {FixHandlerContext} context - Authentication and configuration context
   * @returns {Promise<FixResult[]>} Promise resolving to batch fix results
   * @since 2024
   */
  private async processBatch(
    batch: ValidationIssue[],
    context: FixHandlerContext
  ): Promise<FixResult[]> {
    const results: FixResult[] = [];

    for (const issue of batch) {
      const handler = this.handlers.get(issue.code);
      
      if (!handler) {
        results.push({
          issueCode: issue.code,
          dealId: issue.metadata.dealId,
          originalTitle: issue.metadata.dealTitle,
          status: 'skipped',
          error: 'No handler available',
          timestamp: new Date()
        });
        continue;
      }

      try {
        const fixResult = await this.applyFixWithRetry(handler, issue, context);
        
        results.push({
          issueCode: issue.code,
          dealId: issue.metadata.dealId,
          originalTitle: issue.metadata.dealTitle,
          newTitle: fixResult.newValue as string,
          status: fixResult.success ? 'fixed' : 'failed',
          error: fixResult.error,
          timestamp: new Date(),
          rollbackData: fixResult.rollbackData
        });

        if (fixResult.success) {
          this.circuitBreakerFailures = 0; // Reset on success
        } else {
          this.handleFixFailure();
        }
      } catch (error) {
        results.push({
          issueCode: issue.code,
          dealId: issue.metadata.dealId,
          originalTitle: issue.metadata.dealTitle,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date()
        });
        this.handleFixFailure();
      }
    }

    return results;
  }

  /**
   * Applies a fix with retry logic and error handling.
   * 
   * Implements exponential backoff retry strategy for failed fix operations.
   * 
   * @private
   * @param {FixHandler} handler - Handler to execute the fix
   * @param {ValidationIssue} issue - Issue to fix
   * @param {FixHandlerContext} context - Authentication and configuration context
   * @returns {Promise<any>} Promise resolving to fix handler result
   * @throws {Error} Throws after all retry attempts are exhausted
   * @since 2024
   */
  private async applyFixWithRetry(
    handler: FixHandler,
    issue: ValidationIssue,
    context: FixHandlerContext
  ): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const result = await handler.applyFix(issue, context);
        
        if (result.success) {
          return result;
        }
        
        lastError = new Error(result.error || 'Fix failed');
      } catch (error) {
        lastError = error as Error;
      }

      if (attempt < this.config.retryAttempts) {
        logger.debug({
          attempt,
          dealId: issue.metadata.dealId,
          error: lastError?.message
        }, 'Retrying fix');
        
        await new Promise(resolve => 
          setTimeout(resolve, this.config.retryDelayMs * attempt)
        );
      }
    }

    throw lastError || new Error('Fix failed after retries');
  }

  /**
   * Handles fix operation failures for circuit breaker pattern.
   * 
   * Increments failure count and opens circuit breaker if threshold
   * is reached. This prevents further fix attempts until the reset
   * timeout expires, protecting against cascading failures.
   * 
   * @private
   * @returns {void}
   * @since 2024
   */
  private handleFixFailure(): void {
    this.circuitBreakerFailures++;
    
    if (this.circuitBreakerFailures >= this.config.circuitBreakerThreshold) {
      this.circuitBreakerOpenUntil = Date.now() + this.config.circuitBreakerResetMs;
      logger.warn({
        failures: this.circuitBreakerFailures,
        threshold: this.config.circuitBreakerThreshold,
        resetIn: this.config.circuitBreakerResetMs
      }, 'Circuit breaker opened due to excessive failures');
    }
  }

  /**
   * Checks if the circuit breaker is currently open.
   * 
   * Returns true if the circuit breaker is open (blocking operations).
   * Automatically resets the breaker if the timeout has expired.
   * 
   * @private
   * @returns {boolean} True if circuit breaker is open and blocking operations
   * @since 2024
   */
  private isCircuitBreakerOpen(): boolean {
    // Check if reset timeout has expired
    if (Date.now() > this.circuitBreakerOpenUntil) {
      // Reset circuit breaker state
      this.circuitBreakerFailures = 0;
      this.circuitBreakerOpenUntil = 0;
      return false;
    }
    return this.circuitBreakerOpenUntil > 0;
  }

  /**
   * Generates a comprehensive summary of fix session results.
   * 
   * Creates statistics, recommendations, and detailed reporting
   * for the completed fix operations.
   * 
   * @private
   * @param {FixResult[]} results - Array of fix operation results
   * @returns {FixSummary} Summary object with statistics and recommendations
   * @since 2024
   */
  private generateSummary(results: FixResult[]): FixSummary {
    const fixedCount = results.filter(r => r.status === 'fixed').length;
    const skippedCount = results.filter(r => r.status === 'skipped').length;
    const failedCount = results.filter(r => r.status === 'failed').length;
    
    const recommendations: string[] = [];

    if (fixedCount > 0) {
      recommendations.push(`Successfully fixed ${fixedCount} deal title(s)`);
    }

    if (failedCount > 0) {
      recommendations.push(`${failedCount} fix(es) failed - manual review required`);
    }

    if (skippedCount > 0) {
      recommendations.push(`${skippedCount} issue(s) were skipped (no handler or validation failed)`);
    }

    const duration = this.session?.endTime && this.session?.startTime
      ? this.session.endTime.getTime() - this.session.startTime.getTime()
      : 0;

    return {
      totalIssues: this.session?.issues.length || 0,
      fixableIssues: results.length,
      fixedCount,
      skippedCount,
      failedCount,
      duration,
      fixResults: results,
      recommendations
    };
  }

  /**
   * Rolls back all successfully applied fixes in the current session.
   * 
   * Attempts to reverse all fixes that were successfully applied,
   * using the rollback data stored during fix application. Only
   * processes fixes with 'fixed' status.
   * 
   * @param {string} apiKey - Pipedrive API key for authentication
   * @param {string} companyDomain - Company domain for API calls
   * @returns {Promise<boolean>} Promise resolving to true if all rollbacks succeeded
   * @throws {Error} Logs individual rollback errors but continues processing
   * @since 2024
   */
  async rollbackSession(apiKey: string, companyDomain: string): Promise<boolean> {
    if (!this.session || !this.session.fixResults) {
      logger.warn('No session or fix results to rollback');
      return false;
    }

    const context: FixHandlerContext = {
      apiKey,
      companyDomain,
      tenantId: this.session.tenantId,
      config: this.config
    };

    let rollbackCount = 0;
    const fixedResults = this.session.fixResults.filter(r => r.status === 'fixed');

    // Process each successfully applied fix for rollback
    for (const result of fixedResults) {
      const issue = this.session.issues.find(i => i.metadata.dealId === result.dealId);
      if (!issue) continue;

      const handler = this.handlers.get(result.issueCode);
      if (!handler) continue;

      try {
        const success = await handler.rollback(issue, result.rollbackData, context);
        if (success) {
          rollbackCount++;
          logger.info({ dealId: result.dealId }, 'Fix rolled back successfully');
        }
      } catch (error) {
        logger.error({
          error: error instanceof Error ? error.message : error,
          dealId: result.dealId
        }, 'Failed to rollback fix');
      }
    }

    logger.info({
      totalRollbacks: rollbackCount,
      totalFixed: fixedResults.length
    }, 'Rollback completed');

    return rollbackCount === fixedResults.length;
  }

  /**
   * Returns the current fix session.
   * 
   * Provides access to the session state for monitoring and
   * external integrations. Returns null if no session is active.
   * 
   * @returns {FixSession | null} Current session or null if none active
   * @since 2024
   */
  getSession(): FixSession | null {
    return this.session;
  }

  /**
   * Cancels the current fix session if it's running.
   * 
   * Sets the session status to 'cancelled' and records the end time.
   * This doesn't immediately stop in-progress operations but marks
   * the session for termination.
   * 
   * @returns {void}
   * @since 2024
   */
  cancelSession(): void {
    if (this.session && this.session.status === 'running') {
      this.session.status = 'cancelled';
      this.session.endTime = new Date();
    }
  }
}