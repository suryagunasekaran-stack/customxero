import { signOut } from 'next-auth/react';

export class AuthError extends Error {
  constructor(message: string, public code: string = 'AUTH_ERROR') {
    super(message);
    this.name = 'AuthError';
  }
}

export const AUTH_ERROR_CODES = {
  REFRESH_TOKEN_FAILED: 'REFRESH_TOKEN_FAILED',
  NO_REFRESH_TOKEN: 'NO_REFRESH_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  UNAUTHORIZED: 'UNAUTHORIZED'
} as const;

export type AuthErrorCode = typeof AUTH_ERROR_CODES[keyof typeof AUTH_ERROR_CODES];

export function isAuthError(error: any): error is AuthError {
  return error instanceof AuthError || 
         (error?.code && Object.values(AUTH_ERROR_CODES).includes(error.code));
}

export async function handleAuthError(error: any): Promise<void> {
  if (isAuthError(error) || 
      error?.message?.includes('Failed to refresh token') ||
      error?.message?.includes('Please re-authenticate')) {
    
    // Clear any client-side caches
    if (typeof window !== 'undefined') {
      // Clear any stored auth data
      sessionStorage.clear();
      
      // Sign out and redirect to login
      await signOut({ 
        callbackUrl: '/auth/error?error=TokenRefreshFailed',
        redirect: true 
      });
    }
  }
}

export function createAuthResponse(error: any) {
  if (error?.message?.includes('Failed to refresh token') || 
      error?.message?.includes('Please re-authenticate') ||
      error?.error === 'RefreshAccessTokenError' ||
      error?.error === 'NoRefreshToken') {
    
    return {
      error: 'Authentication failed',
      code: AUTH_ERROR_CODES.REFRESH_TOKEN_FAILED,
      message: 'Your session has expired. Please log in again.',
      requiresAuth: true
    };
  }
  
  return null;
}