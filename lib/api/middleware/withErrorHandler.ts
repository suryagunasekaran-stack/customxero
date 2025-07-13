import { NextRequest, NextResponse } from 'next/server';
import { ApiError } from '../errors/ApiError';

export type ApiHandler = (...args: any[]) => Promise<NextResponse>;

interface ErrorResponse {
  error: string;
  code?: string;
  details?: any;
  timestamp: string;
  requestId?: string;
}

/**
 * Middleware to handle errors in API routes
 * Catches errors and returns standardized error responses
 */
export function withErrorHandler(handler: ApiHandler): ApiHandler {
  return async (...args: any[]) => {
    try {
      return await handler(...args);
    } catch (error) {
      console.error(`[${handler.name || 'API'}] Error:`, error);
      
      // Generate request ID for tracking
      const requestId = generateRequestId();
      
      // Handle ApiError instances
      if (error instanceof ApiError) {
        const errorResponse: ErrorResponse = {
          error: error.message,
          code: error.code,
          details: error.details,
          timestamp: new Date().toISOString(),
          requestId
        };
        
        return NextResponse.json(errorResponse, { 
          status: error.statusCode,
          headers: {
            'X-Request-Id': requestId
          }
        });
      }
      
      // Handle Xero API errors
      if (isXeroError(error)) {
        const errorResponse: ErrorResponse = {
          error: 'Xero API error',
          code: 'XERO_API_ERROR',
          details: extractXeroErrorDetails(error),
          timestamp: new Date().toISOString(),
          requestId
        };
        
        return NextResponse.json(errorResponse, { 
          status: getXeroErrorStatus(error),
          headers: {
            'X-Request-Id': requestId
          }
        });
      }
      
      // Handle other known error types
      if (error instanceof TypeError) {
        const errorResponse: ErrorResponse = {
          error: 'Invalid request',
          code: 'INVALID_REQUEST',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined,
          timestamp: new Date().toISOString(),
          requestId
        };
        
        return NextResponse.json(errorResponse, { 
          status: 400,
          headers: {
            'X-Request-Id': requestId
          }
        });
      }
      
      // Default error response
      const errorResponse: ErrorResponse = {
        error: error instanceof Error ? error.message : 'An unknown error occurred',
        code: 'INTERNAL_ERROR',
        timestamp: new Date().toISOString(),
        requestId
      };
      
      return NextResponse.json(errorResponse, { 
        status: 500,
        headers: {
          'X-Request-Id': requestId
        }
      });
    }
  };
}

/**
 * Compose multiple middleware functions
 */
export function composeMiddleware(...middlewares: Array<(handler: ApiHandler) => ApiHandler>) {
  return (handler: ApiHandler): ApiHandler => {
    return middlewares.reduceRight((acc, middleware) => middleware(acc), handler);
  };
}

// Helper functions
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function isXeroError(error: any): boolean {
  return error?.response?.headers?.['xero-correlation-id'] !== undefined ||
         error?.message?.toLowerCase().includes('xero') ||
         error?.statusCode !== undefined;
}

function extractXeroErrorDetails(error: any): any {
  if (error.response?.data) {
    return error.response.data;
  }
  
  if (error.body) {
    try {
      return JSON.parse(error.body);
    } catch {
      return error.body;
    }
  }
  
  return {
    message: error.message,
    statusCode: error.statusCode
  };
}

function getXeroErrorStatus(error: any): number {
  if (error.response?.status) {
    return error.response.status;
  }
  
  if (error.statusCode) {
    return error.statusCode;
  }
  
  // Common Xero error status codes
  if (error.message?.includes('unauthorized')) return 401;
  if (error.message?.includes('forbidden')) return 403;
  if (error.message?.includes('not found')) return 404;
  if (error.message?.includes('rate limit')) return 429;
  
  return 502; // Bad Gateway for external API errors
}