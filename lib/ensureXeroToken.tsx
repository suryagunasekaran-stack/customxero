// lib/ensureXeroToken.ts
import { auth } from '@/lib/auth';
import { xeroTokenManager } from '@/lib/xeroTokenManager';

export interface ValidTokenData {
    access_token: string;
    effective_tenant_id: string;
    user_id: string;
    available_tenants: any[];
}

/**
 * Ensures a valid Xero authentication token and resolves tenant selection
 * Validates session, checks token expiry, and determines effective tenant ID
 * @returns {Promise<ValidTokenData>} Object containing access token, tenant ID, and available tenants
 * @throws {Error} When authentication is invalid, token expired, or no tenant available
 */
export async function ensureValidToken(): Promise<ValidTokenData> {
    console.log('[ensureValidToken] Attempting to ensure a valid token.');
    
    const session = await auth();
    
    if (!session) {
        console.error('[ensureValidToken] No authenticated session found.');
        throw new Error('No authenticated session. Please login.');
    }
    
    if (!session.accessToken) {
        console.error('[ensureValidToken] No access token in session.');
        throw new Error('No access token found. Please re-authenticate.');
    }

    // Check if token has expired
    const now = Date.now() / 1000;
    const buffer = 60; // 60 seconds buffer
    
    if (session.expiresAt && session.expiresAt <= now + buffer) {
        console.log('[ensureValidToken] Token has expired or is about to expire.');
        if (session.error === 'RefreshAccessTokenError') {
            throw new Error('Failed to refresh token. Please re-authenticate.');
        }
        // NextAuth should handle the refresh automatically
        throw new Error('Token expired. Please re-authenticate.');
    }
    
    const userEmail = session.user?.email;
    if (!userEmail || typeof userEmail !== 'string' || !userEmail.trim()) {
        console.error('[ensureValidToken] Invalid user email:', userEmail);
        throw new Error('Invalid user session - no valid email found');
    }
    
    const userId = userEmail.trim();
    
    // Get available tenants from session or storage
    let availableTenants = session.tenants || [];
    if (!availableTenants || availableTenants.length === 0) {
        availableTenants = await xeroTokenManager.getUserTenants(userId) || [];
    }
    
    // ALWAYS check Redis first for the selected tenant to get the latest value
    const effectiveTenantId = await xeroTokenManager.getSelectedTenant(userId);
    if (effectiveTenantId) {
        console.log('[ensureValidToken] Using tenant ID from Redis storage:', effectiveTenantId);
        return {
            access_token: session.accessToken,
            effective_tenant_id: effectiveTenantId,
            user_id: userId,
            available_tenants: availableTenants
        };
    }
    
    // Fall back to session if no Redis value
    if (session.tenantId) {
        console.log('[ensureValidToken] No Redis tenant, using session tenant:', session.tenantId);
        // Save it to Redis for consistency
        await xeroTokenManager.saveSelectedTenant(userId, session.tenantId);
        return {
            access_token: session.accessToken,
            effective_tenant_id: session.tenantId,
            user_id: userId,
            available_tenants: availableTenants
        };
    }
    
    // If we have tenants but no selection, use the first one
    if (availableTenants && availableTenants.length > 0) {
        const defaultTenant = availableTenants.find((t: any) => t.tenantType === 'ORGANISATION') || availableTenants[0];
        await xeroTokenManager.saveSelectedTenant(userId, defaultTenant.tenantId);
        return {
            access_token: session.accessToken,
            effective_tenant_id: defaultTenant.tenantId,
            user_id: userId,
            available_tenants: availableTenants
        };
    }
    
    throw new Error('No tenant ID available. Please select a tenant.');
}
