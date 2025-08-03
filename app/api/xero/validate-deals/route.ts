/**
 * API endpoint for Pipedrive-Xero validation with SSE streaming
 */

import { NextResponse } from 'next/server';
import { createProtectedRoute } from '@/lib/api/middleware';
import { ValidationOrchestrator } from '@/lib/orchestration/ValidationOrchestrator';
import { resolvePipedriveConfig } from '@/lib/utils/tenantConfig';
import { logger } from '@/lib/logger';

export const GET = createProtectedRoute(async (req, context) => {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const sendProgress = (data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };
        
        // Use context from middleware
        const tenantId = context.tenantId;
        logger.info({ tenantId }, 'Starting Pipedrive validation');
        
        sendProgress({ 
          type: 'log', 
          message: `Starting validation for tenant: ${tenantId}` 
        });
        
        // Resolve tenant configuration
        const pipedriveConfig = await resolvePipedriveConfig(tenantId);
        
        if (!pipedriveConfig) {
          sendProgress({ 
            type: 'error', 
            message: 'No Pipedrive configuration found for this tenant',
            tenantId
          });
          controller.close();
          return;
        }
        
        if (!pipedriveConfig.enabled || !pipedriveConfig.apiKey) {
          sendProgress({ 
            type: 'error', 
            message: 'Pipedrive integration not enabled for this tenant. Please configure PIPEDRIVE_KEY or PIPEDRIVE_KEY_TENANT1 environment variable.',
            tenantId
          });
          controller.close();
          return;
        }
        
        sendProgress({ 
          type: 'log', 
          message: `Found configuration for ${pipedriveConfig.tenantName || 'tenant'}` 
        });
        
        // Create orchestrator instance
        const orchestrator = new ValidationOrchestrator();
        
        // Set up progress callback
        orchestrator.setProgressCallback((step) => {
          sendProgress({ 
            type: 'progress', 
            step: {
              id: step.id,
              name: step.name,
              description: step.description,
              status: step.status,
              progress: step.progress,
              result: step.result,
              error: step.error
            }
          });
        });
        
        // Execute validation workflow
        sendProgress({ 
          type: 'log', 
          message: 'Starting validation workflow...' 
        });
        
        const validationSession = await orchestrator.executeValidationWorkflow(
          tenantId,
          pipedriveConfig
        );
        
        // Send completion with results
        sendProgress({ 
          type: 'complete', 
          data: {
            session: {
              id: validationSession.id,
              tenantId: validationSession.tenantId,
              tenantName: validationSession.tenantName,
              startTime: validationSession.startTime,
              endTime: validationSession.endTime,
              status: validationSession.status
            },
            results: validationSession.validationResults
          }
        });
        
        logger.info({ 
          sessionId: validationSession.id,
          summary: validationSession.validationResults?.summary
        }, 'Validation completed');
        
        controller.close();
        
      } catch (error) {
        logger.error({ 
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        }, 'Validation workflow failed');
        
        const sendProgress = (data: any) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch (e) {
            // Controller might be closed
            console.error('Failed to send progress:', e);
          }
        };
        
        sendProgress({ 
          type: 'error', 
          message: error instanceof Error ? error.message : 'Validation failed',
          details: error instanceof Error ? error.stack : undefined
        });
        
        controller.close();
      }
    }
  });
  
  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Disable nginx buffering
    }
  });
});