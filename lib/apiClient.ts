// lib/apiClient.ts
import { signIn } from 'next-auth/react';

interface ApiClientOptions extends RequestInit {
  maxRetries?: number;
  retryDelay?: number;
}

/**
 * Enhanced fetch wrapper with automatic token refresh handling
 * Automatically retries requests that fail due to authentication errors
 */
export class ApiClient {
  private static instance: ApiClient;
  private isRefreshing = false;
  private refreshSubscribers: Array<(token: string) => void> = [];

  private constructor() {}

  static getInstance(): ApiClient {
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient();
    }
    return ApiClient.instance;
  }

  /**
   * Subscribe to token refresh completion
   */
  private subscribeTokenRefresh(cb: (token: string) => void) {
    this.refreshSubscribers.push(cb);
  }

  /**
   * Notify all subscribers when token is refreshed
   */
  private onRefreshed(token: string) {
    this.refreshSubscribers.map(cb => cb(token));
    this.refreshSubscribers = [];
  }

  /**
   * Main fetch method with automatic retry on 401
   */
  async fetch(url: string, options: ApiClientOptions = {}): Promise<Response> {
    const { maxRetries = 1, retryDelay = 1000, ...fetchOptions } = options;
    
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          ...fetchOptions,
          headers: {
            ...fetchOptions.headers,
          },
        });

        // If response is OK, return it
        if (response.ok) {
          return response;
        }

        // If it's a 401, we need to handle token refresh
        if (response.status === 401) {
          // Check if the error indicates a refresh token failure
          const errorData = await response.json().catch(() => ({}));
          
          if (errorData.error?.includes('RefreshAccessTokenError') || 
              errorData.error?.includes('re-authenticate')) {
            // Refresh token is invalid, need to re-login
            await signIn('xero');
            throw new Error('Session expired. Please log in again.');
          }

          // If this is the first attempt, try to wait for any ongoing refresh
          if (attempt === 0 && this.isRefreshing) {
            return new Promise<Response>((resolve, reject) => {
              this.subscribeTokenRefresh(async () => {
                try {
                  const retryResponse = await fetch(url, fetchOptions);
                  resolve(retryResponse);
                } catch (error) {
                  reject(error);
                }
              });
            });
          }

          // If not already refreshing and this is our first attempt, trigger a page refresh
          // This will cause NextAuth to refresh the token in the JWT callback
          if (attempt === 0 && !this.isRefreshing) {
            this.isRefreshing = true;
            
            // Try to refresh the session
            if (typeof window !== 'undefined') {
              try {
                // Try to get a new session from NextAuth
                const { getSession } = await import('next-auth/react');
                await getSession();
                
                // Wait a bit for the session to update
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                
                this.isRefreshing = false;
                this.onRefreshed('refreshed');
                
                // Retry the request
                continue;
              } catch (refreshError) {
                console.error('Failed to refresh session:', refreshError);
                this.isRefreshing = false;
                this.onRefreshed('failed');
                // If refresh fails, reload the page as last resort
                window.location.reload();
                return response;
              }
            }
          }
        }

        // For other error statuses, return the response as-is
        return response;
        
      } catch (error) {
        lastError = error as Error;
        
        // If this is not the last attempt, wait before retrying
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
      }
    }

    // If we get here, all retries failed
    throw lastError || new Error('Request failed after retries');
  }

  /**
   * Convenience method for JSON requests
   */
  async fetchJSON<T>(url: string, options: ApiClientOptions = {}): Promise<T> {
    const response = await this.fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text().catch(() => 'Unknown error');
      throw new Error(`API request failed: ${response.status} - ${error}`);
    }

    return response.json();
  }
}

// Export singleton instance
export const apiClient = ApiClient.getInstance();