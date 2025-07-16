/**
 * COMPATIBILITY WRAPPER for XeroTokenManager
 * 
 * This file provides backward compatibility for code that still imports from the old location.
 * The actual implementation has been moved to a serverless-compatible architecture.
 * 
 * All methods now use the new XeroTokenStore which properly handles Redis connections
 * for serverless environments like Vercel.
 * 
 * @deprecated Use `import { XeroTokenStore } from '@/lib/redis/xeroTokenStore'` instead
 */

import { XeroTokenStore } from './redis/xeroTokenStore';
import type { XeroTenant } from '@/types/auth.types';

export interface UserXeroData {
  tenants: XeroTenant[];
  selectedTenant: string | null;
}

export interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  tenants?: XeroTenant[];
}

/**
 * @deprecated This class is maintained for backward compatibility only.
 * Use XeroTokenStore directly for new code.
 */
export class XeroTokenManager {
  private static instance: XeroTokenManager;

  private constructor() {
    console.warn('[XeroTokenManager] Using deprecated singleton pattern. Please migrate to XeroTokenStore.');
  }

  static getInstance(): XeroTokenManager {
    if (!XeroTokenManager.instance) {
      XeroTokenManager.instance = new XeroTokenManager();
    }
    return XeroTokenManager.instance;
  }

  async getUserTenants(userId: string): Promise<XeroTenant[] | null> {
    return XeroTokenStore.getUserTenants(userId);
  }

  async saveUserTenants(userId: string, tenants: XeroTenant[]): Promise<void> {
    return XeroTokenStore.saveUserTenants(userId, tenants);
  }

  async getSelectedTenant(userId: string): Promise<string | null> {
    return XeroTokenStore.getSelectedTenant(userId);
  }

  async saveSelectedTenant(userId: string, tenantId: string): Promise<void> {
    return XeroTokenStore.saveSelectedTenant(userId, tenantId);
  }

  async deleteUserData(userId: string): Promise<void> {
    return XeroTokenStore.deleteUserData(userId);
  }

  async clearUserTokens(userId: string): Promise<void> {
    return XeroTokenStore.clearUserTokens(userId);
  }

  async updateToken(
    userId: string,
    accessToken: string,
    refreshToken: string,
    expiresAt: number,
    tenants: XeroTenant[]
  ): Promise<void> {
    return XeroTokenStore.updateToken(userId, accessToken, refreshToken, expiresAt, tenants);
  }

  async getToken(userId: string): Promise<TokenData | null> {
    return XeroTokenStore.getToken(userId);
  }

  async getOrFetchTenants(session: any): Promise<XeroTenant[] | null> {
    return XeroTokenStore.getOrFetchTenants(session);
  }
}

// Export singleton instance for backward compatibility
export const xeroTokenManager = XeroTokenManager.getInstance();