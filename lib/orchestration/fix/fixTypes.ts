/**
 * Type definitions for the Fix Orchestrator system
 * 
 * This module provides comprehensive type definitions for the automated fix system
 * that identifies and resolves validation issues in Pipedrive deals. The system
 * supports various types of fixes including title format corrections, pipeline
 * validations, and data consistency repairs.
 * 
 * @fileoverview Fix Orchestrator Type Definitions
 * @author CustomXero Development Team
 * @since 2024
 */

import { PipedriveDeal } from '@/lib/utils/pipedriveHelpers';

/**
 * Represents a complete fix session with all validation issues and results.
 * A session tracks the entire lifecycle from issue identification through
 * resolution, including progress tracking and rollback capabilities.
 * 
 * @interface FixSession
 * @since 2024
 */
export interface FixSession {
  /** Unique identifier for this fix session */
  id: string;
  /** Tenant ID for multi-tenant isolation */
  tenantId: string;
  /** Human-readable tenant name */
  tenantName: string;
  /** Session start timestamp */
  startTime: Date;
  /** Session completion timestamp (undefined while running) */
  endTime?: Date;
  /** Current status of the fix session */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  /** Array of validation issues to be fixed */
  issues: ValidationIssue[];
  /** Results of individual fix operations */
  fixResults?: FixResult[];
  /** Aggregated summary of session results */
  summary?: FixSummary;
  /** Error message if session failed */
  error?: string;
}

/**
 * Represents a specific validation issue found in a Pipedrive deal.
 * Each issue contains metadata about the problem and suggested fix,
 * along with contextual information needed for resolution.
 * 
 * @interface ValidationIssue
 * @since 2024
 */
export interface ValidationIssue {
  /** Unique code identifying the type of validation issue */
  code: string;
  /** Severity level - errors must be fixed, warnings are optional */
  severity: 'error' | 'warning';
  /** Human-readable description of the validation issue */
  message: string;
  /** Suggested action to resolve the issue */
  suggestedFix: string;
  /** Contextual metadata required for fix processing */
  metadata: {
    /** Pipedrive deal ID */
    dealId: number;
    /** Current deal title */
    dealTitle: string;
    /** Expected deal title format (for title fixes) */
    expectedTitle?: string;
    /** Project code extracted from deal context */
    projectCode?: string;
    /** Vessel name for maritime projects */
    vesselName?: string;
    /** Pipedrive pipeline ID */
    pipelineId: number;
    /** Deal status (open, won, lost, etc.) */
    status: string;
    /** Deal monetary value */
    dealValue: number;
    /** Deal currency (SGD, USD, etc.) */
    currency: string;
    /** Pipedrive stage ID within pipeline */
    stageId?: number;
  };
}

/**
 * Result of applying a fix to a specific validation issue.
 * Contains detailed information about the fix operation including
 * before/after values and rollback data for potential reversal.
 * 
 * @interface FixResult
 * @since 2024
 */
export interface FixResult {
  /** Code of the validation issue that was addressed */
  issueCode: string;
  /** Pipedrive deal ID that was modified */
  dealId: number;
  /** Original deal title before fix */
  originalTitle: string;
  /** New deal title after fix (if successful) */
  newTitle?: string;
  /** Outcome of the fix operation */
  status: 'fixed' | 'skipped' | 'failed';
  /** Error message if fix failed */
  error?: string;
  /** Timestamp when fix was applied */
  timestamp: Date;
  /** Data needed to rollback this fix operation */
  rollbackData?: {
    /** Original deal data for restoration */
    originalDeal: Partial<PipedriveDeal>;
  };
}

/**
 * Aggregated summary of a fix session's results and performance metrics.
 * Provides high-level statistics and recommendations for the session.
 * 
 * @interface FixSummary
 * @since 2024
 */
export interface FixSummary {
  /** Total number of validation issues identified */
  totalIssues: number;
  /** Number of issues that could potentially be fixed */
  fixableIssues: number;
  /** Number of issues successfully fixed */
  fixedCount: number;
  /** Number of issues skipped (validation failed or no handler) */
  skippedCount: number;
  /** Number of fix attempts that failed */
  failedCount: number;
  /** Session duration in milliseconds */
  duration: number;
  /** Detailed results for each fix operation */
  fixResults: FixResult[];
  /** Human-readable recommendations for next steps */
  recommendations: string[];
}

/**
 * Represents a single step in the fix workflow with progress tracking.
 * Steps are executed sequentially and provide real-time progress updates
 * via Server-Sent Events for UI feedback.
 * 
 * @interface FixStep
 * @since 2024
 */
export interface FixStep {
  /** Unique identifier for this workflow step */
  id: string;
  /** Display name for UI progress indicators */
  name: string;
  /** Detailed description of step purpose */
  description: string;
  /** Current execution status */
  status: 'pending' | 'running' | 'completed' | 'error' | 'skipped';
  /** Step execution start time */
  startTime?: Date;
  /** Step completion time */
  endTime?: Date;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Step execution result data */
  result?: any;
  /** Error message if step failed */
  error?: string;
}

/**
 * Callback function type for receiving real-time fix progress updates.
 * Used to send Server-Sent Events to client applications for UI updates.
 * 
 * @callback FixProgressCallback
 * @param {FixStep} step - Current step with updated status and progress
 * @since 2024
 */
export type FixProgressCallback = (step: FixStep) => void;

/**
 * Configuration options for the fix orchestration system.
 * Controls batch processing, retry logic, circuit breaker behavior,
 * and other operational parameters for reliable fix execution.
 * 
 * @interface FixOrchestrationConfig
 * @since 2024
 */
export interface FixOrchestrationConfig {
  /** Number of fixes to process in each batch */
  batchSize: number;
  /** Maximum retry attempts for failed fixes */
  retryAttempts: number;
  /** Delay between retry attempts in milliseconds */
  retryDelayMs: number;
  /** When true, simulate fixes without making API calls */
  enableDryRun: boolean;
  /** When true, store rollback data for potential reversal */
  enableRollback: boolean;
  /** Maximum number of concurrent fix operations */
  maxConcurrentFixes: number;
  /** Number of failures before circuit breaker opens */
  circuitBreakerThreshold: number;
  /** Time in milliseconds before circuit breaker resets */
  circuitBreakerResetMs: number;
}

/**
 * Default configuration values for the fix orchestration system.
 * These values provide a balanced approach between throughput and reliability,
 * with conservative settings to prevent API rate limit violations.
 * 
 * @constant {FixOrchestrationConfig}
 * @since 2024
 */
export const DEFAULT_FIX_CONFIG: FixOrchestrationConfig = {
  batchSize: 10,                    // Process 10 fixes per batch
  retryAttempts: 3,                 // Retry failed fixes up to 3 times
  retryDelayMs: 1000,              // Wait 1 second between retries
  enableDryRun: false,             // Execute actual fixes by default
  enableRollback: true,            // Store rollback data for safety
  maxConcurrentFixes: 5,           // Limit concurrent operations
  circuitBreakerThreshold: 5,      // Open circuit after 5 failures
  circuitBreakerResetMs: 60000,    // Reset circuit breaker after 1 minute
};

/**
 * Context object passed to fix handlers containing authentication
 * and configuration data needed for API operations.
 * 
 * @interface FixHandlerContext
 * @since 2024
 */
export interface FixHandlerContext {
  /** Pipedrive API key for authentication */
  apiKey: string;
  /** Company domain for Pipedrive API calls */
  companyDomain: string;
  /** Tenant ID for multi-tenant isolation */
  tenantId: string;
  /** Fix orchestration configuration settings */
  config: FixOrchestrationConfig;
}

/**
 * Result returned by fix handlers after attempting to resolve an issue.
 * Contains success status, before/after values, and rollback information.
 * 
 * @interface FixHandlerResult
 * @since 2024
 */
export interface FixHandlerResult {
  /** Whether the fix operation succeeded */
  success: boolean;
  /** Original value before fix was applied */
  originalValue?: any;
  /** New value after successful fix */
  newValue?: any;
  /** Error message if fix failed */
  error?: string;
  /** Data needed to rollback this specific fix */
  rollbackData?: any;
}