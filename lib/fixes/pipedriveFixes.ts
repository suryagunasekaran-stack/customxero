/**
 * Stub implementation for Pipedrive fixes
 * These functions are not actively used but needed for compilation
 */

export async function syncProductsToPipedrive(params: {
  dealId: string;
  xeroLineItems: any[];
  apiKey: string;
  companyDomain: string;
}) {
  console.warn('syncProductsToPipedrive is not implemented - Pipedrive integration has been removed');
  return {
    success: false,
    error: 'Pipedrive integration has been removed from this application'
  };
}