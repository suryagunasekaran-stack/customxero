/**
 * Runtime tenant configuration resolution for Pipedrive integrations
 */

export interface CustomFieldMapping {
  xeroQuoteId: string;
  invoiceId: string;
  vesselName: string;
  quoteNumber?: string;
  invoiceNumber?: string;
  status?: string;
  ipc?: string;
  location?: string;
  personInCharge?: string;
  woNumber?: string;
  moNumber?: string;
  department?: string;
  vesselType?: string;
  salesReference?: string;
  wopqNumber?: string;
  refNumber?: string;
  [key: string]: string | undefined;
}

export interface PipedriveConfig {
  apiKey: string;
  companyDomain: string;
  pipelineIds: number[];
  customFieldKeys: CustomFieldMapping;
  enabled: boolean;
  tenantName?: string;
  invoiceStageId?: number; // Stage ID for Invoice stage (e.g., 6 for tenant 6dd39ea4...)
}

/**
 * Resolves Pipedrive configuration for a specific tenant using predefined configurations
 * 
 * @description Retrieves tenant-specific Pipedrive configuration including API credentials,
 * pipeline IDs, and custom field mappings. API keys are sourced from environment variables.
 * Returns null if tenant is not configured, or disabled config if API key is missing.
 * 
 * @param {string} tenantId - The unique identifier for the tenant
 * @returns {Promise<PipedriveConfig | null>} Promise resolving to tenant's Pipedrive config or null
 * 
 * @example
 * ```typescript
 * // Resolve configuration for a known tenant
 * const config = await resolvePipedriveConfig('ea67107e-c352-40a9-a8b8-24d81ae3fc85');
 * if (config && config.enabled) {
 *   console.log(`API Domain: ${config.companyDomain}`);
 *   console.log(`Pipelines: ${config.pipelineIds.join(', ')}`);
 * }
 * 
 * // Handle unknown tenant
 * const unknownConfig = await resolvePipedriveConfig('unknown-id');
 * if (!unknownConfig) {
 *   console.log('Tenant not configured for Pipedrive');
 * }
 * ```
 * 
 * @throws {Error} Does not throw - returns null for invalid tenants
 * @since 1.0.0
 */
export async function resolvePipedriveConfig(tenantId: string): Promise<PipedriveConfig | null> {
  // Configuration based on CUSTOMFIELDS.md (corrected)
  const configs: Record<string, PipedriveConfig> = {
    // Tenant 1 (now correctly mapped to 6dd39ea4-e6a6-4993-a37a-21482ccf8d22)
    '6dd39ea4-e6a6-4993-a37a-21482ccf8d22': {
      apiKey: process.env.PIPEDRIVE_KEY_TENANT1 || process.env.PIPEDRIVE_KEY || '',
      companyDomain: 'api', // Standard API domain
      pipelineIds: [2], // Work In Progress pipeline
      invoiceStageId: 6, // Invoice stage in pipeline 2
      customFieldKeys: {
        quoteNumber: 'a0b59ccf244af998aa57a01f22e2ffd41cf504f9',
        invoiceId: 'c599cab3902b6c84c1f9e2689f308a4369fffe7d',
        invoiceNumber: '77e6c22c25774c19c846dcafc78ab79299f3635c',
        status: '7e3a9d4941be08c210be9294d4503ba781f7d79e',
        ipc: '9b493336b9f01af388a5a50b53a98a57f6df8b9a',
        xeroQuoteId: '0e9dc89b14fb67546540fd3e11a7fe06653d708f',
        refNumber: 'c9c9206bd3ec741541e8a4f9f7395aee69d243df',
        location: 'ab6f8ba40052e512a64b575b592dba4f2dee7a6d',
        personInCharge: 'e112e892add78412634256facf963d04e0488de0',
        moNumber: '176062c9320cc5d330edb205b3378c802c3e27aa',
        woNumber: 'e92f0f8368659e80770910970f19d72ad6e3f284',
        vesselName: 'bef5a8a5866aec2d7f4db2a5d8964ab04a4dc93d',
        department: 'b1ccab4cb2fd2179aaceddf107187b70b48d9cb7'
      },
      enabled: true,
      tenantName: 'Tenant 1'
    },
    // Tenant 2 (now correctly mapped to ea67107e-c352-40a9-a8b8-24d81ae3fc85)
    'ea67107e-c352-40a9-a8b8-24d81ae3fc85': {
      apiKey: process.env.PIPEDRIVE_KEY_TENANT2 || process.env.PIPEDRIVE_KEY_2 || '',
      companyDomain: 'bseni',
      pipelineIds: [3, 4, 5, 6, 7, 8, 9, 16], // All WIP pipelines (removed pipeline 2)
      customFieldKeys: {
        wopqNumber: '8a3fabdbd16595e1dc83d75327312eba71bbb0a4',
        ipc: '0be49a5ee144f20b90168670b3a3f8f9b18977ae',
        vesselName: 'ecb34e26525067dd1a426c0c59909a8797a85e54',
        department: 'baad1beac0e8ba5a000dc82f7f1d2d9fd45b10a7',
        location: 'd5db80cbb7d8612c676482c73a15c43a06b60e09',
        personInCharge: '87813f40f660dde69c31412d52136e16552afeb2',
        xeroQuoteId: '1f21104ccb95f5a4773ef52cd0c2cc1c78203f69',
        quoteNumber: 'a52165a056d57cabba309ec5e53d7a6cd47ea766',
        invoiceId: '8c5c696440f023067a49103a15b60ff6ae6e3243',
        invoiceNumber: 'b0d383d6f828cae7cb5c80b5f3144b3d0e8b9419',
        status: '892488671894031e384be7f94012c12215f60ca8',
        vesselType: '2541f907abda866a9e04ff51004fca9f60c83f03',
        salesReference: '6ec23a25a64aa044f0e57d1180d2ad8b7bdb43b9'
      },
      enabled: true,
      tenantName: 'Tenant 2 (BSENI)'
    }
  };
  
  const config = configs[tenantId];
  
  if (!config) {
    return null;
  }
  
  // Check if API key is available
  if (!config.apiKey) {
    return {
      ...config,
      enabled: false
    };
  }
  
  return config;
}

/**
 * Retrieves human-readable pipeline names mapped to their IDs for a specific tenant
 * 
 * @description Returns a mapping of pipeline IDs to descriptive names for display purposes.
 * Each tenant may have different pipeline configurations and naming conventions.
 * 
 * @param {string} tenantId - The unique identifier for the tenant
 * @returns {Record<number, string>} Object mapping pipeline IDs to their display names
 * 
 * @example
 * ```typescript
 * // Get pipeline names for tenant 1
 * const names = getPipelineNames('ea67107e-c352-40a9-a8b8-24d81ae3fc85');
 * console.log(names[2]); // "Work In Progress"
 * 
 * // Get pipeline names for BSENI tenant
 * const bseniNames = getPipelineNames('6dd39ea4-e6a6-4993-a37a-21482ccf8d22');
 * console.log(bseniNames[3]); // "WIP - Engine Recon"
 * 
 * // Handle unknown tenant
 * const unknown = getPipelineNames('unknown-id');
 * console.log(Object.keys(unknown).length); // 0 (empty object)
 * ```
 * 
 * @since 1.0.0
 */
export function getPipelineNames(tenantId: string): Record<number, string> {
  const pipelineNames: Record<string, Record<number, string>> = {
    // Tenant 1
    '6dd39ea4-e6a6-4993-a37a-21482ccf8d22': {
      2: 'Work In Progress'
    },
    // Tenant 2 (BSENI)
    'ea67107e-c352-40a9-a8b8-24d81ae3fc85': {
      3: 'WIP - Engine Recon',
      4: 'WIP - Machine Shop',
      5: 'WIP - Laser Cladding',
      6: 'WIP - Afloat Repairs',
      7: 'WIP - Engine Overhauling',
      8: 'WIP - Electricals',
      9: 'WIP - Mechanical',
      16: 'WIP - Navy'
    }
  };
  
  return pipelineNames[tenantId] || {};
}