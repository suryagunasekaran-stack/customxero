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
  let available_tenants = await XeroTokenStore.getUserTenants(userId);
  
  // If no tenants are stored, try to get them from the token data
  if (!available_tenants || available_tenants.length === 0) {
    if (tokenData.tenants && tokenData.tenants.length > 0) {
      // Save the tenants that were in the token data
      await XeroTokenStore.saveUserTenants(userId, tokenData.tenants);
      available_tenants = tokenData.tenants;
    } else {
      throw new Error('No tenants available. Please reconnect to Xero.');
    }
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