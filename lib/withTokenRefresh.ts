// lib/withTokenRefresh.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

/**
 * Middleware wrapper for API routes that automatically handles token refresh
 * Wraps API route handlers to ensure fresh tokens and handle authentication errors
 */
export function withTokenRefresh(
  handler: (request: NextRequest, context?: any) => Promise<NextResponse>
) {
  return async (request: NextRequest, context?: any) => {
    try {
      // First attempt with current session
      const response = await handler(request, context);
      
      // If response indicates token error, force a session refresh
      if (response.status === 401) {
        const body = await response.json().catch(() => ({}));
        
        if (body.error?.includes('Token expired') || 
            body.error?.includes('re-authenticate')) {
          
          // Get fresh session (this triggers token refresh in auth.ts)
          const freshSession = await auth();
          
          if (!freshSession || freshSession.error) {
            return NextResponse.json(
              { error: 'Authentication failed. Please log in again.' },
              { status: 401 }
            );
          }
          
          // Retry the handler with fresh session
          return handler(request, context);
        }
      }
      
      return response;
    } catch (error) {
      // Handle any unhandled authentication errors
      if (error instanceof Error) {
        if (error.message.includes('Token expired') || 
            error.message.includes('re-authenticate') ||
            error.message.includes('No authenticated session')) {
          
          return NextResponse.json(
            { error: 'Authentication required. Please log in.' },
            { status: 401 }
          );
        }
      }
      
      // Re-throw other errors
      throw error;
    }
  };
}