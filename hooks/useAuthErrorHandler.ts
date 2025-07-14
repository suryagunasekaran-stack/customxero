import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { AUTH_ERROR_CODES } from '@/lib/authErrorHandler';

export function useAuthErrorHandler() {
  const router = useRouter();

  const handleAuthError = async (response: Response | any) => {
    // Handle Response objects from fetch
    if (response instanceof Response) {
      if (response.status === 401) {
        try {
          const data = await response.json();
          if (data.code === AUTH_ERROR_CODES.REFRESH_TOKEN_FAILED || data.requiresAuth) {
            await signOut({ 
              callbackUrl: '/auth/error?error=TokenRefreshFailed',
              redirect: false 
            });
            router.push('/auth/error?error=TokenRefreshFailed');
            return true;
          }
        } catch (e) {
          // If can't parse JSON, still handle 401
          await signOut({ 
            callbackUrl: '/',
            redirect: false 
          });
          router.push('/');
          return true;
        }
      }
    }
    
    // Handle error objects
    if (response?.code === AUTH_ERROR_CODES.REFRESH_TOKEN_FAILED || 
        response?.requiresAuth ||
        response?.error?.includes('Failed to refresh token') ||
        response?.error?.includes('Authentication failed')) {
      await signOut({ 
        callbackUrl: '/auth/error?error=TokenRefreshFailed',
        redirect: false 
      });
      router.push('/auth/error?error=TokenRefreshFailed');
      return true;
    }
    
    return false;
  };

  // Create a fetch wrapper that handles auth errors
  const authFetch = async (url: string, options?: RequestInit): Promise<Response> => {
    try {
      const response = await fetch(url, options);
      
      if (response.status === 401) {
        const handled = await handleAuthError(response.clone());
        if (handled) {
          throw new Error('Authentication required');
        }
      }
      
      return response;
    } catch (error) {
      await handleAuthError(error);
      throw error;
    }
  };

  return { handleAuthError, authFetch };
}