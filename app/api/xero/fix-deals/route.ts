/**
 * API routes for the Fix Orchestrator system.
 * 
 * Provides REST endpoints for managing fix operations on Pipedrive deals:
 * - POST: Initiates fix workflow with Server-Sent Events for progress tracking
 * - DELETE: Rollback endpoint for undoing previously applied fixes
 * 
 * The POST endpoint implements Server-Sent Events (SSE) to provide real-time
 * progress updates during fix execution. This allows UI clients to display
 * live progress and handle long-running operations gracefully.
 * 
 * @fileoverview Fix Deals API Routes
 * @since 2024
 */

import { NextRequest } from 'next/server';
import { createProtectedRoute } from '@/lib/api/middleware';
import { FixOrchestrator } from '@/lib/orchestration/fix/FixOrchestrator';
import { ValidationIssue } from '@/lib/orchestration/fix/fixTypes';
import { tenantConfigService } from '@/lib/services/tenantConfigService';
import { logger } from '@/lib/logger';

/**
 * POST endpoint for initiating fix operations with Server-Sent Events.
 * 
 * This endpoint processes validation issues and applies automatic fixes
 * using the Fix Orchestrator system. It returns an SSE stream that provides
 * real-time progress updates throughout the fix workflow.
 * 
 * Request Body:
 * - tenantId: string - Tenant identifier for multi-tenant isolation
 * - issues: ValidationIssue[] - Array of validation issues to fix
 * - config?: Partial<FixOrchestrationConfig> - Optional configuration overrides
 * 
 * SSE Events:
 * - 'session_started': Initial session information
 * - 'progress': Step-by-step progress updates
 * - 'session_completed': Final results and summary
 * - 'error': Error information if workflow fails
 * - 'done': End of stream marker
 * 
 * @param {NextRequest} req - Next.js request object containing fix parameters
 * @param {any} session - User session from middleware
 * @returns {Response} SSE stream with fix progress or error response
 * @throws {Response} Returns 400/404/500 status codes for various error conditions
 * @since 2024
 */
export const POST = createProtectedRoute(async (req: NextRequest, session: any) => {
  try {
    const body = await req.json();
    const { tenantId, issues, config } = body;

    // Validate required parameters
    if (!tenantId) {
      return Response.json({ 
        success: false, 
        error: 'Tenant ID is required' 
      }, { status: 400 });
    }

    if (!issues || !Array.isArray(issues)) {
      return Response.json({ 
        success: false, 
        error: 'Issues array is required' 
      }, { status: 400 });
    }

    // Retrieve tenant configuration and validate
    const tenantConfig = await tenantConfigService.getTenantConfig(tenantId);
    
    if (!tenantConfig) {
      return Response.json({ 
        success: false, 
        error: `No configuration found for tenant: ${tenantId}` 
      }, { status: 404 });
    }

    // Obtain Pipedrive API key
    const apiKey = await tenantConfigService.getApiKey(tenantConfig);
    
    if (!apiKey) {
      return Response.json({ 
        success: false, 
        error: 'Pipedrive API key not found or integration is disabled for this tenant' 
      }, { status: 400 });
    }

    // Initialize Server-Sent Events stream
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    /**
     * Sends a Server-Sent Event with the specified type and data.
     * 
     * @param {string} event - Event type identifier
     * @param {any} data - Event data payload
     * @returns {Promise<void>}
     */
    const sendEvent = async (event: string, data: any) => {
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      await writer.write(encoder.encode(message));
    };

    // Execute fix orchestration in background
    (async () => {
      try {
        logger.info({ 
          tenantId, 
          tenantName: tenantConfig.tenantName,
          issueCount: issues.length 
        }, 'Starting fix orchestration');

        // Initialize orchestrator with optional config overrides
        const orchestrator = new FixOrchestrator(config);

        // Configure progress callback for real-time updates
        orchestrator.setProgressCallback(async (step) => {
          await sendEvent('progress', step);
        });

        // Create fix session with validated issues
        const session = orchestrator.initializeSession(
          tenantId,
          tenantConfig.tenantName,
          issues as ValidationIssue[]
        );

        // Notify client that session has started
        await sendEvent('session_started', {
          sessionId: session.id,
          tenantName: session.tenantName,
          totalIssues: session.issues.length
        });

        // Execute the complete fix workflow
        const completedSession = await orchestrator.executeFixWorkflow(
          apiKey,
          tenantConfig.pipedrive.companyDomain
        );

        // Send final results to client
        await sendEvent('session_completed', {
          sessionId: completedSession.id,
          status: completedSession.status,
          summary: completedSession.summary,
          fixResults: completedSession.fixResults
        });

        logger.info({ 
          sessionId: completedSession.id,
          fixed: completedSession.summary?.fixedCount,
          failed: completedSession.summary?.failedCount,
          skipped: completedSession.summary?.skippedCount
        }, 'Fix orchestration completed');

      } catch (error) {
        logger.error({ 
          error: error instanceof Error ? error.message : error,
          tenantId 
        }, 'Fix orchestration failed');

        // Send error information to client
        await sendEvent('error', {
          message: error instanceof Error ? error.message : 'Fix operation failed',
          details: error instanceof Error ? error.stack : undefined
        });
      } finally {
        // Always send done event and close stream
        await sendEvent('done', {});
        await writer.close();
      }
    })();

    // Return SSE response with appropriate headers
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no' // Disable Nginx buffering for real-time updates
      }
    });

  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : error 
    }, 'Error in fix-deals endpoint');

    return Response.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, { status: 500 });
  }
});

/**
 * DELETE endpoint for rolling back previously applied fixes.
 * 
 * This endpoint provides rollback functionality for fix operations,
 * allowing users to undo changes made during a fix session. Currently
 * returns a 501 Not Implemented status as session persistence is not
 * yet implemented.
 * 
 * Query Parameters:
 * - tenantId: string - Tenant identifier
 * - sessionId: string - Fix session identifier to rollback
 * 
 * @param {NextRequest} req - Next.js request object with query parameters
 * @param {any} session - User session from middleware
 * @returns {Response} JSON response indicating rollback status
 * @throws {Response} Returns 400/404/501 status codes for various conditions
 * @since 2024
 * @todo Implement session persistence for rollback functionality
 */
export const DELETE = createProtectedRoute(async (req: NextRequest, session: any) => {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');
    const sessionId = searchParams.get('sessionId');

    // Validate required query parameters
    if (!tenantId || !sessionId) {
      return Response.json({ 
        success: false, 
        error: 'Tenant ID and Session ID are required' 
      }, { status: 400 });
    }

    // Retrieve and validate tenant configuration
    const tenantConfig = await tenantConfigService.getTenantConfig(tenantId);
    
    if (!tenantConfig) {
      return Response.json({ 
        success: false, 
        error: `No configuration found for tenant: ${tenantId}` 
      }, { status: 404 });
    }

    // Obtain Pipedrive API key for rollback operations
    const apiKey = await tenantConfigService.getApiKey(tenantConfig);
    
    if (!apiKey) {
      return Response.json({ 
        success: false, 
        error: 'Pipedrive API key not found' 
      }, { status: 400 });
    }

    // TODO: Implement session persistence and retrieval
    // In a production system, sessions would be stored persistently
    // (e.g., in Redis or database) and retrieved here for rollback.
    // The rollback would then use FixOrchestrator.rollbackSession()
    logger.warn({ sessionId }, 'Rollback requested but session storage not implemented');

    return Response.json({ 
      success: false, 
      error: 'Session rollback not yet implemented' 
    }, { status: 501 });

  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : error 
    }, 'Error in rollback endpoint');

    return Response.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, { status: 500 });
  }
});