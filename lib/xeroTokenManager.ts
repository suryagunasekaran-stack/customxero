import Redis from 'ioredis';
import { auth } from '@/lib/auth';

// Create Redis connection with proper error handling
const createRedisClient = () => {
  const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false,
    connectTimeout: 10000,
    commandTimeout: 5000,
    lazyConnect: true,
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

export class XeroTokenManager {
  private static instance: XeroTokenManager;
  private redis: Redis;

  private constructor() {
    this.redis = createRedisClient();
  }

  static getInstance(): XeroTokenManager {
    if (!XeroTokenManager.instance) {
      XeroTokenManager.instance = new XeroTokenManager();
    }
    return XeroTokenManager.instance;
  }

  private getUserKey(userId: string, suffix: string): string {
    return `user:${userId}:xero:${suffix}`;
  }

  // Helper method to check if Redis is ready
  private async isRedisReady(): Promise<boolean> {
    try {
      return this.redis.status === 'ready' || this.redis.status === 'connect';
    } catch (error) {
      return false;
    }
  }

  // Helper method to safely execute Redis operations
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

  async getUserTenants(userId: string): Promise<XeroTenant[] | null> {
    return await this.safeRedisOperation(async () => {
      const tenantsData = await this.redis.get(this.getUserKey(userId, 'tenants'));
      return tenantsData ? JSON.parse(tenantsData) : null;
    }, null);
  }

  async saveUserTenants(userId: string, tenants: XeroTenant[]): Promise<void> {
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

  async getSelectedTenant(userId: string): Promise<string | null> {
    return await this.safeRedisOperation(async () => {
      return await this.redis.get(this.getUserKey(userId, 'selected_tenant'));
    }, null);
  }

  async saveSelectedTenant(userId: string, tenantId: string): Promise<void> {
    try {
      if (!(await this.isRedisReady())) {
        console.warn('Redis not ready, skipping selected tenant save');
        return;
      }
      
      await this.redis.set(
        this.getUserKey(userId, 'selected_tenant'),
        tenantId,
        'EX',
        7 * 24 * 60 * 60 // 7 days
      );
          } catch (error) {
        console.warn('Error saving selected tenant (non-critical):', (error as Error).message);
        // Don't throw error - this is not critical for app functionality
      }
  }

  async deleteUserData(userId: string): Promise<void> {
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

  // Helper method to get or fetch tenants for authenticated user
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