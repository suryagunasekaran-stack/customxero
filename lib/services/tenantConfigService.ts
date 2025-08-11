/**
 * Tenant Configuration Service - Manages tenant-specific configurations from MongoDB
 */

import { MongoClient, Db, Collection } from 'mongodb';
import { logger } from '@/lib/logger';

export interface TenantConfiguration {
  _id?: any;
  tenantId: string;
  tenantName: string;
  pipedrive: {
    companyDomain: string;
    pipelineIds: number[];
    pipelineNames: Record<string, string>;
    stageConfiguration: {
      workInProgressStageIds: number[];
      invoiceStageId: number;
      excludedStageIds: number[];
    };
    customFieldMappings: Record<string, string>;
    apiKeyRef: string;
  };
  xero: {
    defaultCurrency: string;
    projectStatuses: string[];
    quoteNumberFormat: string;
  };
  validation: {
    rules: {
      requireVesselName: boolean;
      allowDuplicateTitles: boolean;
      validProjectPrefixes: string[];
      titleFormat: string;
      customRules: Array<{
        ruleId: string;
        description: string;
        severity: 'error' | 'warning' | 'info';
      }>;
    };
    thresholds: {
      maxValueDiscrepancy: number;
      warningDaysOld: number;
      errorDaysOld: number;
    };
  };
  features: Record<string, boolean>;
  metadata: {
    createdAt: string | Date;
    updatedAt: string | Date;
    createdBy: string;
    version: number;
  };
}

export class TenantConfigService {
  private static instance: TenantConfigService;
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private collection: Collection<TenantConfiguration> | null = null;
  
  private constructor() {}
  
  static getInstance(): TenantConfigService {
    if (!TenantConfigService.instance) {
      TenantConfigService.instance = new TenantConfigService();
    }
    return TenantConfigService.instance;
  }
  
  async connect(): Promise<void> {
    if (this.db && this.collection) return;
    
    try {
      // Get MongoDB URI - should point to customxero database
      const uri = process.env.MONGODB_URI;
      if (!uri) {
        throw new Error('MONGODB_URI not configured');
      }
      
      // Parse and update the URI to use customxero database
      const baseUri = uri.split('?')[0];
      const params = uri.split('?')[1];
      const updatedUri = baseUri.replace(/\/[^/]*$/, '/customxero') + '?' + params;
      
      logger.info('Connecting to MongoDB for tenant configuration...');
      
      this.client = new MongoClient(updatedUri);
      await this.client.connect();
      
      // Connect to customxero database and tenant_config collection
      this.db = this.client.db('customxero');
      this.collection = this.db.collection<TenantConfiguration>('tenant_config');
      
      // Verify connection by counting documents
      const count = await this.collection.countDocuments();
      logger.info({ count }, 'Connected to MongoDB tenant_config collection');
      
    } catch (error) {
      logger.error({ error }, 'Failed to connect to MongoDB');
      throw error;
    }
  }
  
  async getTenantConfig(tenantId: string): Promise<TenantConfiguration | null> {
    try {
      await this.connect();
      
      logger.info({ tenantId }, 'Fetching tenant configuration from MongoDB');
      
      const config = await this.collection!.findOne({ tenantId });
      
      if (!config) {
        logger.warn({ tenantId }, 'No configuration found for tenant');
        return null;
      }
      
      logger.info({ 
        tenantId, 
        tenantName: config.tenantName,
        pipelineCount: config.pipedrive.pipelineIds.length 
      }, 'Tenant configuration loaded');
      
      return config;
      
    } catch (error) {
      logger.error({ error, tenantId }, 'Error fetching tenant configuration');
      throw error;
    }
  }
  
  async getApiKey(config: TenantConfiguration): Promise<string> {
    // Get the actual API key from environment based on reference
    const apiKey = process.env[config.pipedrive.apiKeyRef];
    if (!apiKey) {
      throw new Error(`API key not found for reference: ${config.pipedrive.apiKeyRef}`);
    }
    return apiKey;
  }
  
  async updateTenantConfig(
    tenantId: string, 
    updates: Partial<TenantConfiguration>
  ): Promise<boolean> {
    try {
      await this.connect();
      
      const result = await this.collection!.updateOne(
        { tenantId },
        { 
          $set: {
            ...updates,
            'metadata.updatedAt': new Date()
          }
        }
      );
      
      logger.info({ 
        tenantId, 
        modified: result.modifiedCount > 0 
      }, 'Tenant configuration update attempted');
      
      return result.modifiedCount > 0;
      
    } catch (error) {
      logger.error({ error, tenantId }, 'Error updating tenant configuration');
      throw error;
    }
  }
  
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      this.collection = null;
      logger.info('Disconnected from MongoDB');
    }
  }
}

// Export singleton instance
export const tenantConfigService = TenantConfigService.getInstance();