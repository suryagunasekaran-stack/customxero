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
    const session = await auth();
    
    if (!session) {
        throw new Error('No authenticated session. Please login.');
    }
    
    if (!session.accessToken) {
        throw new Error('No access token found. Please re-authenticate.');
    }

    // Check if token has expired
    const now = Date.now() / 1000;
    const buffer = 60; // 60 seconds buffer
    
    if (session.expiresAt && session.expiresAt <= now + buffer) {
        if (session.error === 'RefreshAccessTokenError') {
            throw new Error('Failed to refresh token. Please re-authenticate.');
        }
        // NextAuth should handle the refresh automatically
        throw new Error('Token expired. Please re-authenticate.');
    }
    
    const userEmail = session.user?.email;
    if (!userEmail || typeof userEmail !== 'string' || !userEmail.trim()) {
        throw new Error('Invalid user session - no valid email found');
    }
    
    const userId = userEmail.trim();
    
    // Get available tenants from session or storage
    let availableTenants = session.tenants || [];
    if (!availableTenants || availableTenants.length === 0) {
        availableTenants = await xeroTokenManager.getUserTenants(userId) || [];
    }
    
    // ALWAYS check Redis first for the selected tenant to get the latest value
    const redisTenantId = await xeroTokenManager.getSelectedTenant(userId);
    
    let finalTenantId: string;
    
    if (redisTenantId) {
        finalTenantId = redisTenantId;
    } else if (session.tenantId) {
        finalTenantId = session.tenantId;
        // Save it to Redis for consistency
        await xeroTokenManager.saveSelectedTenant(userId, session.tenantId);
    } else if (availableTenants && availableTenants.length > 0) {
        const defaultTenant = availableTenants.find((t: any) => t.tenantType === 'ORGANISATION') || availableTenants[0];
        finalTenantId = defaultTenant.tenantId;
        await xeroTokenManager.saveSelectedTenant(userId, defaultTenant.tenantId);
    } else {
        throw new Error('No tenant ID available. Please select a tenant.');
    }
    
    // Validate the selected tenant exists in available tenants
    const selectedTenantInfo = availableTenants?.find(t => t.tenantId === finalTenantId);
    if (!selectedTenantInfo) {
        throw new Error(`Selected tenant ${finalTenantId} is not available. Please reselect a tenant.`);
    }
    
    return {
        access_token: session.accessToken,
        effective_tenant_id: finalTenantId,
        user_id: userId,
        available_tenants: availableTenants
    };
}
