import { withRedis, withRedisFallback, withDistributedLockRetry } from './redisClient';
import type { XeroTenant } from '@/types/auth.types';

export interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  tenants?: XeroTenant[];
}

/**
 * Serverless-compatible Xero token storage service
 * Replaces the singleton pattern with request-scoped operations
 * All operations properly manage Redis connections for serverless environments
 */
export class XeroTokenStore {
  /**
   * Generates Redis key for user-specific Xero data
   * @param {string} userId - User identifier (typically email)
   * @param {string} suffix - Data type suffix
   * @returns {string} Formatted Redis key
   */
  private static getUserKey(userId: string, suffix: string): string {
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      throw new Error('Invalid userId provided');
    }
    return `user:${userId.trim()}:xero:${suffix}`;
  }

  /**
   * Retrieves stored tenant data for a user
   * @param {string} userId - User identifier
   * @returns {Promise<XeroTenant[] | null>} Array of tenants or null
   */
  static async getUserTenants(userId: string): Promise<XeroTenant[] | null> {
    if (!userId?.trim()) {
      console.warn('getUserTenants called with invalid userId');
      return null;
    }
    
    return withRedisFallback(async (redis) => {
      const tenantsData = await redis.get(this.getUserKey(userId, 'tenants'));
      return tenantsData ? JSON.parse(tenantsData) : null;
    }, null);
  }

  /**
   * Saves tenant data for a user with 7-day TTL
   * @param {string} userId - User identifier
   * @param {XeroTenant[]} tenants - Array of tenants to save
   */
  static async saveUserTenants(userId: string, tenants: XeroTenant[]): Promise<void> {
    if (!userId?.trim() || !tenants) {
      console.warn('saveUserTenants called with invalid data');
      return;
    }
    
    await withRedisFallback(async (redis) => {
      await redis.set(
        this.getUserKey(userId, 'tenants'),
        JSON.stringify(tenants),
        'EX',
        7 * 24 * 60 * 60 // 7 days
      );
    }, undefined);
  }

  /**
   * Gets the selected tenant ID for a user
   * @param {string} userId - User identifier
   * @returns {Promise<string | null>} Selected tenant ID or null
   */
  static async getSelectedTenant(userId: string): Promise<string | null> {
    if (!userId?.trim()) {
      console.warn('getSelectedTenant called with invalid userId');
      return null;
    }
    
    return withRedisFallback(async (redis) => {
      return await redis.get(this.getUserKey(userId, 'selected_tenant'));
    }, null);
  }

  /**
   * Saves the selected tenant ID for a user
   * @param {string} userId - User identifier
   * @param {string} tenantId - Tenant ID to set as selected
   */
  static async saveSelectedTenant(userId: string, tenantId: string): Promise<void> {
    if (!userId?.trim() || !tenantId?.trim()) {
      console.warn('saveSelectedTenant called with invalid data');
      return;
    }
    
    const cleanTenantId = tenantId.trim();
    
    await withRedisFallback(async (redis) => {
      await redis.set(
        this.getUserKey(userId, 'selected_tenant'),
        cleanTenantId,
        'EX',
        7 * 24 * 60 * 60 // 7 days
      );
      console.log(`[TokenStore] Saved tenant: ${userId} -> ${cleanTenantId}`);
    }, undefined);
  }

  /**
   * Stores user's token data with proper TTL
   * @param {string} userId - User identifier
   * @param {string} accessToken - Access token
   * @param {string} refreshToken - Refresh token
   * @param {number} expiresAt - Token expiration timestamp
   * @param {XeroTenant[]} tenants - Available tenants
   */
  static async updateToken(
    userId: string,
    accessToken: string,
    refreshToken: string,
    expiresAt: number,
    tenants: XeroTenant[]
  ): Promise<void> {
    if (!userId || !accessToken || !refreshToken) {
      console.error('[TokenStore] Invalid token data provided');
      return;
    }

    const tokenData: TokenData = {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      tenants
    };

    const key = `xero:token:${userId}`;
    const ttl = Math.max(0, Math.floor(expiresAt - (Date.now() / 1000)));

    await withRedisFallback(async (redis) => {
      await redis.set(key, JSON.stringify(tokenData), 'EX', ttl);
      console.log(`[TokenStore] Token stored for user ${userId}`);
    }, undefined);
    
    // Also save tenants separately for getUserTenants method
    if (tenants && tenants.length > 0) {
      await this.saveUserTenants(userId, tenants);
      console.log(`[TokenStore] Tenants saved for user ${userId}: ${tenants.length} tenants`);
    }
  }

  /**
   * Gets user's token data
   * @param {string} userId - User identifier
   * @returns {Promise<TokenData | null>} Token data or null
   */
  static async getToken(userId: string): Promise<TokenData | null> {
    if (!userId) {
      return null;
    }

    const key = `xero:token:${userId}`;

    return withRedisFallback(async (redis) => {
      const data = await redis.get(key);
      return data ? JSON.parse(data) as TokenData : null;
    }, null);
  }

  /**
   * Clears all token data for a user
   * @param {string} userId - User identifier
   */
  static async clearUserTokens(userId: string): Promise<void> {
    if (!userId?.trim()) {
      console.warn('clearUserTokens called with invalid userId');
      return;
    }
    
    await withRedisFallback(async (redis) => {
      const keys = [
        this.getUserKey(userId, 'tenants'),
        this.getUserKey(userId, 'selected_tenant'),
        `xero:token:${userId}`
      ];
      
      await redis.del(...keys);
      console.log(`[TokenStore] Cleared all tokens for user ${userId}`);
    }, undefined);
  }

  /**
   * Deletes all user data (for cleanup)
   * @param {string} userId - User identifier
   */
  static async deleteUserData(userId: string): Promise<void> {
    if (!userId?.trim()) {
      console.warn('deleteUserData called with invalid userId');
      return;
    }
    
    await withRedisFallback(async (redis) => {
      await redis.del(
        this.getUserKey(userId, 'tenants'),
        this.getUserKey(userId, 'selected_tenant')
      );
    }, undefined);
  }

  /**
   * Gets tenants from cache or fetches them from Xero API
   * @param {any} session - NextAuth session object
   * @returns {Promise<XeroTenant[] | null>} Array of tenants or null
   */
  static async getOrFetchTenants(session: any): Promise<XeroTenant[] | null> {
    if (!session?.user?.email || !session?.accessToken) {
      return null;
    }

    const userId = session.user.email;
    
    // Check cache first
    let tenants = await this.getUserTenants(userId);
    
    if (!tenants) {
      // Fetch from Xero API with distributed lock to prevent duplicate fetches
      try {
        tenants = await withDistributedLockRetry(
          `fetch-tenants:${userId}`,
          10, // 10 second lock
          async () => {
            // Double-check cache inside lock
            const cachedTenants = await this.getUserTenants(userId);
            if (cachedTenants) {
              return cachedTenants;
            }

            const response = await fetch('https://api.xero.com/connections', {
              headers: {
                Authorization: `Bearer ${session.accessToken}`,
                'Content-Type': 'application/json',
              },
            });

            if (!response.ok) {
              throw new Error('Failed to fetch tenants from Xero');
            }

            const xeroTenants = await response.json();
            
            // Transform and save tenants
            const transformedTenants = xeroTenants.map((tenant: any) => ({
              tenantId: tenant.tenantId,
              tenantName: tenant.tenantName || 'Unknown Organisation',
              tenantType: tenant.tenantType || 'ORGANISATION',
              createdDateUtc: tenant.createdDateUtc || '',
              updatedDateUtc: tenant.updatedDateUtc || ''
            }));

            if (transformedTenants && transformedTenants.length > 0) {
              await this.saveUserTenants(userId, transformedTenants);
              
              // Set default selected tenant if none selected
              const selectedTenant = await this.getSelectedTenant(userId);
              if (!selectedTenant) {
                const defaultTenant = transformedTenants.find((t: XeroTenant) => 
                  t.tenantType === 'ORGANISATION'
                ) || transformedTenants[0];
                await this.saveSelectedTenant(userId, defaultTenant.tenantId);
              }
            }

            return transformedTenants;
          },
          3, // max 3 retries
          1000 // 1 second retry delay
        );
      } catch (error) {
        console.error('Error fetching tenants:', error);
        return null;
      }
    }

    return tenants;
  }
}