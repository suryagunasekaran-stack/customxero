/**
 * Handler for fixing deal title format issues in Pipedrive.
 * 
 * This handler addresses validation issues where deal titles don't match
 * the expected format (ProjectCode-VesselName). It validates that fixes
 * are safe to apply and handles title updates with proper rollback support.
 * 
 * The handler includes safety checks to prevent:
 * - Overwriting manually updated titles
 * - Fixing duplicate deals with "(copy)" in the title
 * - Applying placeholder or instruction text as titles
 * - Modifying deals that have been updated since validation
 * 
 * @fileoverview Title Format Fix Handler
 * @since 2024
 */

import { FixHandler } from './FixHandler';
import { ValidationIssue, FixHandlerContext, FixHandlerResult } from '../fixTypes';
import { PipedriveFixService } from '../services/PipedriveFixService';
import { logger } from '@/lib/logger';

/**
 * Implementation of FixHandler for correcting deal title formats.
 * 
 * This class handles the INVALID_TITLE_FORMAT issue code by updating
 * Pipedrive deal titles to match the expected ProjectCode-VesselName format.
 * 
 * @class TitleFormatFixHandler
 * @implements {FixHandler}
 * @since 2024
 * @example
 * ```typescript
 * const handler = new TitleFormatFixHandler();
 * const canFix = handler.canHandle(validationIssue);
 * if (canFix) {
 *   const isValid = await handler.validate(issue, context);
 *   if (isValid) {
 *     const result = await handler.applyFix(issue, context);
 *   }
 * }
 * ```
 */
export class TitleFormatFixHandler implements FixHandler {
  /** @readonly Unique identifier for this handler */
  readonly handlerId = 'title_format_fix';
  
  /** @readonly Array of issue codes this handler can process */
  readonly supportedIssueCodes = ['INVALID_TITLE_FORMAT'];
  
  /** Service for Pipedrive API operations with rate limiting */
  private pipedriveService: PipedriveFixService;

  /**
   * Creates a new TitleFormatFixHandler instance.
   * 
   * Initializes the Pipedrive service for API operations.
   * The service handles rate limiting and API communication.
   * 
   * @constructor
   * @since 2024
   */
  constructor() {
    this.pipedriveService = new PipedriveFixService();
  }

  /**
   * Checks if this handler can process the given validation issue.
   * 
   * Simply verifies that the issue code matches INVALID_TITLE_FORMAT.
   * More detailed validation is performed in the validate() method.
   * 
   * @param {ValidationIssue} issue - The validation issue to check
   * @returns {boolean} True if issue code is INVALID_TITLE_FORMAT
   * @since 2024
   */
  canHandle(issue: ValidationIssue): boolean {
    return this.supportedIssueCodes.includes(issue.code);
  }

  /**
   * Validates that the title format issue can be safely fixed.
   * 
   * Performs comprehensive validation including:
   * - Verifying expected title is provided and not a placeholder
   * - Checking if title already matches (case-insensitive)
   * - Skipping duplicate deals with "(copy)" in title
   * - Confirming deal still exists and is accessible
   * - Ensuring title hasn't changed since validation
   * 
   * @param {ValidationIssue} issue - The validation issue to validate
   * @param {FixHandlerContext} context - Authentication and configuration context
   * @returns {Promise<boolean>} Promise resolving to true if fix can be applied
   * @throws {Error} Logs errors but returns false instead of throwing
   * @since 2024
   */
  async validate(issue: ValidationIssue, context: FixHandlerContext): Promise<boolean> {
    try {
      // Check if we have the necessary data to fix the issue
      const { expectedTitle, dealTitle } = issue.metadata;
      
      if (!expectedTitle) {
        logger.warn({ dealId: issue.metadata.dealId }, 'No expected title provided, cannot fix');
        return false;
      }

      // Don't fix if the expected title is a placeholder or instruction
      if (expectedTitle.includes('(missing') || expectedTitle.includes('(set ')) {
        logger.warn({ 
          dealId: issue.metadata.dealId,
          expectedTitle 
        }, 'Expected title is a placeholder, cannot auto-fix');
        return false;
      }

      // Don't fix if the title already matches (case-insensitive)
      if (dealTitle?.toLowerCase() === expectedTitle.toLowerCase()) {
        logger.info({ dealId: issue.metadata.dealId }, 'Title already matches expected format');
        return false;
      }

      // Don't fix if this is a duplicate (contains "(copy)" in title)
      if (dealTitle?.toLowerCase().includes('(copy)')) {
        logger.info({ dealId: issue.metadata.dealId }, 'Skipping duplicate deal with "(copy)" in title');
        return false;
      }

      // Verify the deal still exists and is accessible
      const currentDeal = await this.pipedriveService.getDeal(
        context.apiKey,
        context.companyDomain,
        issue.metadata.dealId
      );

      if (!currentDeal) {
        logger.error({ dealId: issue.metadata.dealId }, 'Deal not found or not accessible');
        return false;
      }

      // Check if the deal title has changed since validation
      if (currentDeal.title !== dealTitle) {
        logger.warn({ 
          dealId: issue.metadata.dealId,
          originalTitle: dealTitle,
          currentTitle: currentDeal.title 
        }, 'Deal title has changed since validation');
        return false;
      }

      return true;
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : error,
        dealId: issue.metadata.dealId 
      }, 'Error validating title fix');
      return false;
    }
  }

  /**
   * Applies the title format fix to the Pipedrive deal.
   * 
   * Updates the deal title to the expected format and stores rollback data.
   * The operation includes:
   * - Retrieving current deal state for rollback
   * - Updating the deal title via Pipedrive API
   * - Storing complete rollback information
   * 
   * @param {ValidationIssue} issue - The validation issue being fixed
   * @param {FixHandlerContext} context - Authentication and configuration context
   * @returns {Promise<FixHandlerResult>} Promise resolving to fix operation result
   * @throws {Error} Catches errors and returns them in the result object
   * @since 2024
   */
  async applyFix(issue: ValidationIssue, context: FixHandlerContext): Promise<FixHandlerResult> {
    try {
      const { dealId, dealTitle, expectedTitle } = issue.metadata;

      if (!expectedTitle) {
        return {
          success: false,
          error: 'No expected title provided'
        };
      }

      // Get current deal state for rollback
      const currentDeal = await this.pipedriveService.getDeal(
        context.apiKey,
        context.companyDomain,
        dealId
      );

      if (!currentDeal) {
        return {
          success: false,
          error: 'Deal not found'
        };
      }

      // Apply the fix
      logger.info({ 
        dealId,
        oldTitle: currentDeal.title,
        newTitle: expectedTitle 
      }, 'Applying title fix');

      const updated = await this.pipedriveService.updateDealTitle(
        context.apiKey,
        context.companyDomain,
        dealId,
        expectedTitle
      );

      if (updated) {
        return {
          success: true,
          originalValue: currentDeal.title,
          newValue: expectedTitle,
          rollbackData: {
            dealId,
            originalTitle: currentDeal.title,
            originalDeal: currentDeal
          }
        };
      } else {
        return {
          success: false,
          error: 'Failed to update deal title'
        };
      }
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : error,
        dealId: issue.metadata.dealId 
      }, 'Error applying title fix');
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Rolls back a previously applied title fix.
   * 
   * Restores the deal title to its original value using stored rollback data.
   * Validates rollback data integrity before attempting the restoration.
   * 
   * @param {ValidationIssue} issue - The original validation issue
   * @param {any} rollbackData - Data stored during fix application
   * @param {FixHandlerContext} context - Authentication and configuration context
   * @returns {Promise<boolean>} Promise resolving to true if rollback succeeded
   * @throws {Error} Logs errors but returns false instead of throwing
   * @since 2024
   */
  async rollback(issue: ValidationIssue, rollbackData: any, context: FixHandlerContext): Promise<boolean> {
    try {
      if (!rollbackData?.originalTitle || !rollbackData?.dealId) {
        logger.error({ rollbackData }, 'Invalid rollback data');
        return false;
      }

      logger.info({ 
        dealId: rollbackData.dealId,
        restoringTitle: rollbackData.originalTitle 
      }, 'Rolling back title change');

      const restored = await this.pipedriveService.updateDealTitle(
        context.apiKey,
        context.companyDomain,
        rollbackData.dealId,
        rollbackData.originalTitle
      );

      return restored;
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : error,
        dealId: issue.metadata.dealId 
      }, 'Error rolling back title fix');
      return false;
    }
  }

  /**
   * Returns a description of what this handler fixes.
   * 
   * @returns {string} Human-readable description of handler functionality
   * @since 2024
   */
  getDescription(): string {
    return 'Fixes deal titles to match the expected format (ProjectCode-VesselName)';
  }
}