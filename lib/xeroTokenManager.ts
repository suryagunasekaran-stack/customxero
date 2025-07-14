import Redis from 'ioredis';
import { auth } from '@/lib/auth';

// Create Redis connection with proper error handling
const createRedisClient = () => {
  const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false,
    connectTimeout: 10000,
    commandTimeout: 5000,
    lazyConnect: false,
  });

  redis.on('error', (err) => {
    console.error('Redis connection error:', err.message);
  });

  redis.on('connect', () => {
    console.log('Redis connected successfully');
  });

  redis.on('reconnecting', () => {
    console.log('Redis reconnecting...');
  });

  redis.on('close', () => {
    console.log('Redis connection closed');
  });

  redis.on('ready', () => {
    console.log('Redis is ready to accept commands');
  });

  return redis;
};

export interface XeroTenant {
  tenantId: string;
  tenantName: string;
  tenantType: string;
  createdDateUtc: string;
  updatedDateUtc: string;
}

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

export class XeroTokenManager {
  private static instance: XeroTokenManager;
  private redis: Redis;
  // In-memory fallback for tenant selection when Redis is down
  private memoryTenantStore: Map<string, string> = new Map();

  private constructor() {
    this.redis = createRedisClient();
  }

  /**
   * Gets the singleton instance of XeroTokenManager
   * @returns {XeroTokenManager} The singleton instance
   */
  static getInstance(): XeroTokenManager {
    if (!XeroTokenManager.instance) {
      XeroTokenManager.instance = new XeroTokenManager();
    }
    return XeroTokenManager.instance;
  }

  /**
   * Generates Redis key for user-specific Xero data
   * @param {string} userId - User identifier (typically email)
   * @param {string} suffix - Data type suffix (e.g., 'tenants', 'selected_tenant')
   * @returns {string} Formatted Redis key
   * @throws {Error} When userId is invalid
   */
  private getUserKey(userId: string, suffix: string): string {
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      throw new Error('Invalid userId provided to getUserKey');
    }
    return `user:${userId.trim()}:xero:${suffix}`;
  }

  /**
   * Checks if Redis connection is ready for operations
   * @returns {Promise<boolean>} True if Redis is ready, false otherwise
   */
  private async isRedisReady(): Promise<boolean> {
    try {
      await this.redis.ping();
      return this.redis.status === 'ready' || this.redis.status === 'connect';
    } catch (error) {
      return false;
    }
  }

  /**
   * Safely executes Redis operations with fallback handling
   * @template T
   * @param {() => Promise<T>} operation - The Redis operation to execute
   * @param {T} fallback - Fallback value if Redis operation fails
   * @returns {Promise<T>} Operation result or fallback value
   */
  private async safeRedisOperation<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
    try {
      if (!(await this.isRedisReady())) {
        console.warn('Redis not ready, using fallback value');
        return fallback;
      }
      return await operation();
         } catch (error) {
       console.warn('Redis operation failed, using fallback:', (error as Error).message);
       return fallback;
     }
  }

  /**
   * Retrieves stored tenant data for a user from Redis
   * @param {string} userId - User identifier (typically email)
   * @returns {Promise<XeroTenant[] | null>} Array of user's Xero tenants or null if not found
   */
  async getUserTenants(userId: string): Promise<XeroTenant[] | null> {
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      console.warn('getUserTenants called with invalid userId:', userId);
      return null;
    }
    
    return await this.safeRedisOperation(async () => {
      const tenantsData = await this.redis.get(this.getUserKey(userId, 'tenants'));
      return tenantsData ? JSON.parse(tenantsData) : null;
    }, null);
  }

  /**
   * Saves tenant data for a user to Redis with 7-day TTL
   * @param {string} userId - User identifier (typically email)
   * @param {XeroTenant[]} tenants - Array of Xero tenant objects to save
   * @returns {Promise<void>} Promise that resolves when save is complete
   */
  async saveUserTenants(userId: string, tenants: XeroTenant[]): Promise<void> {
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      console.warn('saveUserTenants called with invalid userId:', userId);
      return;
    }
    
    try {
      if (!(await this.isRedisReady())) {
        console.warn('Redis not ready, skipping tenant save');
        return;
      }
      
      await this.redis.set(
        this.getUserKey(userId, 'tenants'),
        JSON.stringify(tenants),
        'EX',
        7 * 24 * 60 * 60 // 7 days
      );
          } catch (error) {
        console.warn('Error saving user tenants (non-critical):', (error as Error).message);
        // Don't throw error - this is not critical for app functionality
      }
  }

  /**
   * Gets the selected tenant ID for a user with Redis-first, memory fallback strategy
   * @param {string} userId - User identifier (typically email)
   * @returns {Promise<string | null>} Selected tenant ID or null if not found
   */
  async getSelectedTenant(userId: string): Promise<string | null> {
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      console.warn('getSelectedTenant called with invalid userId:', userId);
      return null;
    }
    
    // Try Redis first, then fallback to memory
    const redisResult = await this.safeRedisOperation(async () => {
      return await this.redis.get(this.getUserKey(userId, 'selected_tenant'));
    }, null);
    
    if (redisResult) {
      return redisResult;
    }
    
    // Fallback to in-memory store
    const memoryResult = this.memoryTenantStore.get(userId);
    console.log(`[XeroTokenManager] Using memory fallback for user ${userId}: ${memoryResult}`);
    return memoryResult || null;
  }

  /**
   * Saves the selected tenant ID for a user to both Redis and memory
   * Uses dual storage strategy for maximum reliability
   * @param {string} userId - User identifier (typically email)
   * @param {string} tenantId - Xero tenant ID to set as selected
   * @returns {Promise<void>} Promise that resolves when save is complete
   */
  async saveSelectedTenant(userId: string, tenantId: string): Promise<void> {
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      console.warn('saveSelectedTenant called with invalid userId:', userId);
      return;
    }
    
    if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
      console.warn('saveSelectedTenant called with invalid tenantId:', tenantId);
      return;
    }
    
    const cleanTenantId = tenantId.trim();
    
    // Always save to memory first (immediate fallback)
    this.memoryTenantStore.set(userId, cleanTenantId);
    console.log(`[XeroTokenManager] Saved tenant to memory: ${userId} -> ${cleanTenantId}`);
    
    // Try to save to Redis as well
    try {
      if (await this.isRedisReady()) {
        await this.redis.set(
          this.getUserKey(userId, 'selected_tenant'),
          cleanTenantId,
          'EX',
          7 * 24 * 60 * 60 // 7 days
        );
        console.log(`[XeroTokenManager] Saved tenant to Redis: ${userId} -> ${cleanTenantId}`);
      } else {
        console.warn(`[XeroTokenManager] Redis not ready, tenant saved to memory only: ${userId} -> ${cleanTenantId}`);
      }
    } catch (error) {
      console.warn('Error saving selected tenant to Redis (non-critical):', (error as Error).message);
      console.log(`[XeroTokenManager] Tenant saved to memory fallback: ${userId} -> ${cleanTenantId}`);
    }
  }

  async deleteUserData(userId: string): Promise<void> {
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      console.warn('deleteUserData called with invalid userId:', userId);
      return;
    }
    
    try {
      if (!(await this.isRedisReady())) {
        console.warn('Redis not ready, skipping user data deletion');
        return;
      }
      
      await this.redis.del(
        this.getUserKey(userId, 'tenants'),
        this.getUserKey(userId, 'selected_tenant')
      );
          } catch (error) {
        console.warn('Error deleting user data (non-critical):', (error as Error).message);
      }
  }

  /**
   * Store user's token data
   * @param {string} userId - User identifier
   * @param {string} accessToken - Access token
   * @param {string} refreshToken - Refresh token
   * @param {number} expiresAt - Token expiration timestamp
   * @param {XeroTenant[]} tenants - Available tenants
   * @returns {Promise<void>}
   */
  async updateToken(
    userId: string,
    accessToken: string,
    refreshToken: string,
    expiresAt: number,
    tenants: XeroTenant[]
  ): Promise<void> {
    if (!userId || !accessToken || !refreshToken) {
      console.error('[XeroTokenManager] Invalid token data provided');
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

    await this.safeRedisOperation(async () => {
      if (await this.isRedisReady()) {
        await this.redis.set(key, JSON.stringify(tokenData), 'EX', ttl);
        console.log(`[XeroTokenManager] Token stored for user ${userId}`);
      }
    }, undefined);
  }

  /**
   * Get user's token data
   * @param {string} userId - User identifier
   * @returns {Promise<TokenData | null>} Token data or null if not found
   */
  async getToken(userId: string): Promise<TokenData | null> {
    if (!userId) {
      return null;
    }

    const key = `xero:token:${userId}`;

    return await this.safeRedisOperation(async () => {
      if (await this.isRedisReady()) {
        const data = await this.redis.get(key);
        if (data) {
          return JSON.parse(data) as TokenData;
        }
      }
      return null;
    }, null);
  }

  /**
   * Gets tenants from cache or fetches them from Xero API with automatic default selection
   * Implements cache-first strategy with API fallback and smart default tenant selection
   * @param {any} session - NextAuth session object containing user email and access token
   * @returns {Promise<XeroTenant[] | null>} Array of Xero tenants or null if unavailable
   */
  async getOrFetchTenants(session: any): Promise<XeroTenant[] | null> {
    if (!session?.user?.email || !session?.accessToken) {
      return null;
    }

    const userId = session.user.email;
    
    // Check if we already have tenants stored
    let tenants = await this.getUserTenants(userId);
    
    if (!tenants) {
      // Fetch tenants from Xero API
      try {
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
        tenants = xeroTenants.map((tenant: any) => ({
          tenantId: tenant.tenantId,
          tenantName: tenant.tenantName || 'Unknown Organisation',
          tenantType: tenant.tenantType || 'ORGANISATION',
          createdDateUtc: tenant.createdDateUtc || '',
          updatedDateUtc: tenant.updatedDateUtc || ''
        }));

        if (tenants && tenants.length > 0) {
          await this.saveUserTenants(userId, tenants);
          
          // Set default selected tenant if none selected
          const selectedTenant = await this.getSelectedTenant(userId);
          if (!selectedTenant) {
            const defaultTenant = tenants.find(t => t.tenantType === 'ORGANISATION') || tenants[0];
            await this.saveSelectedTenant(userId, defaultTenant.tenantId);
          }
        }
      } catch (error) {
        console.error('Error fetching tenants:', error);
        return null;
      }
    }

    return tenants;
  }
}

// Export singleton instance
export const xeroTokenManager = XeroTokenManager.getInstance(); 