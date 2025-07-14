import { NextResponse } from 'next/server';
import { createAuthResponse } from './authErrorHandler';

/**
 * Wraps API route handlers with consistent auth error handling
 * Automatically handles token refresh failures and returns proper auth responses
 * @param handler - The API route handler function
 * @returns Wrapped handler with auth error handling
 */
export function withAuthErrorHandling<T extends any[], R>(
  handler: (...args: T) => Promise<R>
) {
  return async (...args: T): Promise<R | NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      console.error('[API Route] Error:', error);
      
      // Check if this is an auth error
      const authResponse = createAuthResponse(error);
      if (authResponse) {
        return NextResponse.json(authResponse, { status: 401 }) as R;
      }
      
      // Re-throw non-auth errors to be handled by the route
      throw error;
    }
  };
}