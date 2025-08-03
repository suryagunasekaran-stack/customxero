/**
 * Stub implementation for tenant EA67107E validation
 */

export interface TenantValidationConfig {
  tenantId: string;
  accessToken?: string;
  tenantName?: string;
  pipedriveApiKey?: string;
  pipedriveCompanyDomain?: string;
  quoteIdFieldKey?: string;
  quoteNumberFieldKey?: string;
  xeroAccessToken?: string;
  xeroTenantId?: string;
  [key: string]: any; // Allow additional properties
}

export interface ValidationProgress {
  type: string;
  message?: string;
  data?: any;
}

export async function validateTenantEA67107EV3(
  config: TenantValidationConfig,
  onProgress: (progress: ValidationProgress) => void
) {
  onProgress({ 
    type: 'log', 
    message: 'Validation stub - full implementation has been removed' 
  });
  
  return {
    success: false,
    error: 'Pipedrive validation has been removed from this application'
  };
}