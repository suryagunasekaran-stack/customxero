import Redis from 'ioredis';
import { auth } from '@/lib/auth';

// Create Redis connection with proper error handling
const createRedisClient = () => {
  const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false,
  });

  redis.on('error', (err) => {
    console.error('Redis connection error:', err);
  });

  redis.on('connect', () => {
    console.log('Redis connected successfully');
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

  async getUserTenants(userId: string): Promise<XeroTenant[] | null> {
    try {
      const tenantsData = await this.redis.get(this.getUserKey(userId, 'tenants'));
      return tenantsData ? JSON.parse(tenantsData) : null;
    } catch (error) {
      console.error('Error loading user tenants:', error);
      return null;
    }
  }

  async saveUserTenants(userId: string, tenants: XeroTenant[]): Promise<void> {
    try {
      await this.redis.set(
        this.getUserKey(userId, 'tenants'),
        JSON.stringify(tenants),
        'EX',
        7 * 24 * 60 * 60 // 7 days
      );
    } catch (error) {
      console.error('Error saving user tenants:', error);
      throw new Error('Failed to save user tenants');
    }
  }

  async getSelectedTenant(userId: string): Promise<string | null> {
    try {
      return await this.redis.get(this.getUserKey(userId, 'selected_tenant'));
    } catch (error) {
      console.error('Error loading selected tenant:', error);
      return null;
    }
  }

  async saveSelectedTenant(userId: string, tenantId: string): Promise<void> {
    try {
      await this.redis.set(
        this.getUserKey(userId, 'selected_tenant'),
        tenantId,
        'EX',
        7 * 24 * 60 * 60 // 7 days
      );
    } catch (error) {
      console.error('Error saving selected tenant:', error);
      throw new Error('Failed to save selected tenant');
    }
  }

  async deleteUserData(userId: string): Promise<void> {
    try {
      await this.redis.del(
        this.getUserKey(userId, 'tenants'),
        this.getUserKey(userId, 'selected_tenant')
      );
    } catch (error) {
      console.error('Error deleting user data:', error);
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