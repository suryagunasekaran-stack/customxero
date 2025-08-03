/**
 * Helper function to ensure valid Xero token and get tenant information
 */

import { auth } from '@/lib/auth';
import { XeroTokenStore } from '@/lib/redis/xeroTokenStore';

export async function ensureValidToken() {
  const session = await auth();
  
  if (!session?.user) {
    throw new Error('Unauthorized - no session');
  }

  const userId = session.user.id || session.user.email;
  if (!userId) {
    throw new Error('No user ID available');
  }

  // Get token data
  const tokenData = await XeroTokenStore.getToken(userId);
  if (!tokenData?.access_token) {
    throw new Error('No valid Xero token found');
  }

  // Get available tenants
  const available_tenants = await XeroTokenStore.getUserTenants(userId);
  if (!available_tenants || available_tenants.length === 0) {
    throw new Error('No tenants available');
  }

  // Get selected tenant
  const selectedTenantId = await XeroTokenStore.getSelectedTenant(userId);
  const effective_tenant_id = selectedTenantId || available_tenants[0].tenantId;

  return {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    effective_tenant_id,
    available_tenants,
    expires_at: tokenData.expires_at
  };
}