/**
 * Base interface for fix handlers in the Fix Orchestrator system.
 * 
 * Fix handlers are responsible for resolving specific types of validation issues
 * in Pipedrive deals. Each handler implements a consistent interface for
 * validation, fix application, and rollback operations.
 * 
 * Handlers should be stateless and thread-safe, receiving all necessary
 * context through method parameters. The orchestrator manages the lifecycle
 * and provides progress tracking and error handling.
 * 
 * @fileoverview Fix Handler Base Interface
 * @author CustomXero Development Team
 * @since 2024
 */

import { ValidationIssue, FixHandlerContext, FixHandlerResult } from '../fixTypes';

/**
 * Base interface that all fix handlers must implement.
 * 
 * This interface defines the contract for handling specific validation issues.
 * Handlers are registered with the orchestrator and automatically selected
 * based on issue codes they support.
 * 
 * @interface FixHandler
 * @since 2024
 * @example
 * ```typescript
 * class CustomFixHandler implements FixHandler {
 *   readonly handlerId = 'custom_fix';
 *   readonly supportedIssueCodes = ['CUSTOM_ISSUE'];
 *   
 *   canHandle(issue: ValidationIssue): boolean {
 *     return this.supportedIssueCodes.includes(issue.code);
 *   }
 *   
 *   async validate(issue: ValidationIssue, context: FixHandlerContext): Promise<boolean> {
 *     // Validation logic here
 *   }
 *   
 *   async applyFix(issue: ValidationIssue, context: FixHandlerContext): Promise<FixHandlerResult> {
 *     // Fix application logic here
 *   }
 *   
 *   async rollback(issue: ValidationIssue, rollbackData: any, context: FixHandlerContext): Promise<boolean> {
 *     // Rollback logic here
 *   }
 *   
 *   getDescription(): string {
 *     return 'Description of what this handler fixes';
 *   }
 * }
 * ```
 */
export interface FixHandler {
  /**
   * Unique identifier for this handler.
   * Used for logging, debugging, and handler registration.
   * Should be descriptive and follow snake_case convention.
   * 
   * @readonly
   * @example 'title_format_fix', 'pipeline_validation_fix'
   */
  readonly handlerId: string;

  /**
   * Array of validation issue codes that this handler can process.
   * The orchestrator uses this list to route issues to appropriate handlers.
   * Each code should correspond to a specific validation rule in the system.
   * 
   * @readonly
   * @example ['INVALID_TITLE_FORMAT', 'MISSING_PROJECT_CODE']
   */
  readonly supportedIssueCodes: string[];

  /**
   * Determines if this handler can process the given validation issue.
   * 
   * This method performs initial filtering based on issue code and any
   * other basic criteria. It should be fast as it's called during
   * issue analysis phase.
   * 
   * @param {ValidationIssue} issue - The validation issue to check
   * @returns {boolean} True if this handler can process the issue
   * @since 2024
   */
  canHandle(issue: ValidationIssue): boolean;

  /**
   * Validates that the issue can be safely fixed.
   * 
   * This method performs deeper validation including API calls to verify
   * current state, check permissions, and ensure fix prerequisites are met.
   * Should be thorough as it determines whether a fix will be attempted.
   * 
   * @param {ValidationIssue} issue - The validation issue to validate
   * @param {FixHandlerContext} context - Authentication and configuration context
   * @returns {Promise<boolean>} Promise resolving to true if issue can be fixed
   * @throws {Error} May throw if validation encounters unexpected errors
   * @since 2024
   */
  validate(issue: ValidationIssue, context: FixHandlerContext): Promise<boolean>;

  /**
   * Applies the fix for the validated issue.
   * 
   * This method performs the actual fix operation, typically involving
   * API calls to modify data in Pipedrive. Should be idempotent and
   * provide detailed rollback information for potential reversal.
   * 
   * @param {ValidationIssue} issue - The validation issue to fix
   * @param {FixHandlerContext} context - Authentication and configuration context
   * @returns {Promise<FixHandlerResult>} Promise resolving to fix operation result
   * @throws {Error} May throw if fix operation encounters unexpected errors
   * @since 2024
   */
  applyFix(issue: ValidationIssue, context: FixHandlerContext): Promise<FixHandlerResult>;

  /**
   * Rolls back a previously applied fix to restore original state.
   * 
   * This method reverses the changes made by applyFix using the stored
   * rollback data. Should be implemented defensively to handle cases
   * where original data may have been modified since the fix was applied.
   * 
   * @param {ValidationIssue} issue - The original validation issue
   * @param {any} rollbackData - Data stored during fix application for rollback
   * @param {FixHandlerContext} context - Authentication and configuration context
   * @returns {Promise<boolean>} Promise resolving to true if rollback succeeded
   * @throws {Error} May throw if rollback operation encounters unexpected errors
   * @since 2024
   */
  rollback(issue: ValidationIssue, rollbackData: any, context: FixHandlerContext): Promise<boolean>;

  /**
   * Returns a human-readable description of what this handler fixes.
   * 
   * Used for logging, UI display, and documentation purposes.
   * Should be clear and specific about the types of issues addressed.
   * 
   * @returns {string} Description of the handler's purpose and functionality
   * @since 2024
   * @example 'Fixes deal titles to match the expected format (ProjectCode-VesselName)'
   */
  getDescription(): string;
}