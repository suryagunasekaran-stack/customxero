// hooks/useApiClient.ts
'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { signIn } from 'next-auth/react';

interface UseApiClientOptions {
  onError?: (error: Error) => void;
  maxRetries?: number;
}

/**
 * Custom hook for making API calls with automatic token refresh handling
 * Provides a fetch wrapper that handles authentication errors gracefully
 */
export function useApiClient(options: UseApiClientOptions = {}) {
  const router = useRouter();
  const { onError, maxRetries = 1 } = options;

  const apiCall = useCallback(async <T = any>(
    url: string,
    fetchOptions?: RequestInit
  ): Promise<T> => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          ...fetchOptions,
          headers: {
            'Content-Type': 'application/json',
            ...fetchOptions?.headers,
          },
        });

        // If response is OK, parse and return
        if (response.ok) {
          return await response.json();
        }

        // Handle authentication errors
        if (response.status === 401) {
          const errorData = await response.json().catch(() => ({ error: 'Unauthorized' }));
          
          // Check if it's a token refresh error
          if (errorData.error?.includes('RefreshAccessTokenError') || 
              errorData.error?.includes('re-authenticate') ||
              errorData.error?.includes('Authentication required')) {
            
            // For final attempt, redirect to sign in
            if (attempt === maxRetries) {
              await signIn('xero');
              throw new Error('Session expired. Redirecting to login...');
            }
            
            // Otherwise, refresh the router to trigger token refresh
            router.refresh();
            
            // Wait a bit for the refresh to complete
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Continue to next attempt
            continue;
          }
        }

        // For other errors, throw with the error message
        const errorText = await response.text().catch(() => `HTTP ${response.status}`);
        throw new Error(errorText);

      } catch (error) {
        lastError = error as Error;

        // If this is the last attempt, throw the error
        if (attempt === maxRetries) {
          if (onError) {
            onError(lastError);
          }
          throw lastError;
        }

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }

    // This should never be reached, but just in case
    throw lastError || new Error('Request failed');
  }, [router, onError, maxRetries]);

  return { apiCall };
}