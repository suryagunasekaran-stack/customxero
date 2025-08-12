/**
 * @fileoverview Xero Quote Validation API Route - Server-Sent Events endpoint for real-time validation
 * 
 * This API route provides a Server-Sent Events (SSE) endpoint for initiating and monitoring
 * Xero quote validation workflows in real-time. It leverages the XeroValidationOrchestrator
 * to manage complex validation processes while streaming progress updates to connected clients.
 * 
 * **Endpoint Details:**
 * - Method: GET
 * - Authentication: Required (uses createProtectedRoute middleware)
 * - Response Type: Server-Sent Events (text/event-stream)
 * - Content: Real-time validation progress and results
 * 
 * **SSE Event Types:**
 * - `progress`: Validation step updates with progress percentages
 * - `complete`: Final validation results with comprehensive data
 * - `error`: Error messages with optional stack traces for debugging
 * 
 * **Response Format:**
 * All SSE events follow the format: `data: {JSON_PAYLOAD}\n\n`
 * 
 * The route follows CustomXero's API middleware pattern using `createProtectedRoute`
 * for consistent authentication, error handling, and tenant management.
 * 
 * @module ValidateQuotesRoute
 * @since 1.0.0
 * @author CustomXero Team
 */

import { createProtectedRoute } from '@/lib/api/middleware';
import { XeroValidationOrchestrator } from '@/lib/orchestration/XeroValidationOrchestrator';
import { logger } from '@/lib/logger';

/**
 * GET endpoint for Xero quote validation with real-time progress streaming.
 * 
 * This endpoint initiates a comprehensive validation workflow for all accepted Xero quotes
 * within the authenticated tenant's organization. It uses Server-Sent Events (SSE) to
 * provide real-time progress updates and streams the final validation results.
 * 
 * **Workflow Steps:**
 * 1. Extract tenant ID from authenticated session
 * 2. Initialize XeroValidationOrchestrator with progress callback
 * 3. Execute validation workflow with real-time progress streaming
 * 4. Stream final results including validation session and summary statistics
 * 5. Handle errors gracefully with detailed error information
 * 
 * **SSE Response Events:**
 * - `progress`: Contains step information, status, and progress percentage
 * - `complete`: Contains complete validation session and summary statistics
 * - `error`: Contains error message and optional stack trace for debugging
 * 
 * **Authentication:**
 * Uses CustomXero's `createProtectedRoute` middleware ensuring:
 * - Valid session authentication
 * - Tenant-specific data access
 * - Consistent error handling patterns
 * 
 * @function GET
 * @param {Request} req - The incoming HTTP request (unused in current implementation)
 * @param {Object} session - Authenticated session object containing tenantId
 * @returns {Response} Server-Sent Events stream with validation progress and results
 * @throws {Error} Validation workflow failures, API errors, or authentication issues
 * @since 1.0.0
 * @example
 * ```javascript
 * // Client-side usage with fetch API
 * const response = await fetch('/api/xero/validate-quotes', {
 *   method: 'GET',
 *   headers: { 'Accept': 'text/event-stream' }
 * });
 * 
 * const reader = response.body.getReader();
 * // Process SSE events for real-time updates
 * ```
 */
export const GET = createProtectedRoute(async (req, session) => {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const sendProgress = (data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };
        
        // Use session from middleware
        const tenantId = session.tenantId;
        logger.info({ tenantId }, 'Starting Xero quote validation');
        
        // Create orchestrator instance
        const orchestrator = new XeroValidationOrchestrator();
        orchestrator.setProgressCallback((step) => sendProgress({ type: 'progress', step }));
        
        // Execute validation workflow
        const validationSession = await orchestrator.executeValidationWorkflow(tenantId);
        
        // Send completion with results
        sendProgress({ 
          type: 'complete', 
          data: { 
            session: validationSession,
            summary: {
              totalQuotes: validationSession.totalQuotes,
              quotesProcessed: validationSession.quotesProcessed,
              issuesFound: validationSession.issues.length,
              errorCount: validationSession.errorCount,
              warningCount: validationSession.warningCount
            }
          }
        });
        
        controller.close();
        
      } catch (error) {
        logger.error({ error: error instanceof Error ? error.message : error }, 'Xero validation workflow failed');
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'error', 
          message: error instanceof Error ? error.message : 'Validation failed',
          details: error instanceof Error ? error.stack : undefined
        })}\n\n`));
        controller.close();
      }
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
});