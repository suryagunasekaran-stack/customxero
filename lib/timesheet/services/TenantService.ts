// TenantService.ts  
// Service for fetching and managing Xero tenant information

import { TenantInfo } from '../types';

export class TenantService {
  async fetchTenantInfo(): Promise<TenantInfo | null> {
    try {
      const response = await fetch('/api/xero/projects');
      
      if (!response.ok) {
        throw new Error('Failed to fetch tenant info');
      }
      
      const data = await response.json();
      
      return {
        tenantId: data.metadata.tenantId,
        tenantName: data.metadata.tenantName
      };
    } catch (error) {
      console.error('Failed to fetch tenant information:', error);
      throw new Error('Unable to verify Xero company. Please check your connection.');
    }
  }
} 