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
    console.log('[ensureValidToken] 🔍 STARTING TENANT RESOLUTION');
    
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
    console.log('[ensureValidToken] 👤 USER:', userId);
    
    // Get available tenants from session or storage
    let availableTenants = session.tenants || [];
    if (!availableTenants || availableTenants.length === 0) {
        availableTenants = await xeroTokenManager.getUserTenants(userId) || [];
    }
    
    console.log('[ensureValidToken] 🏢 AVAILABLE TENANTS:', availableTenants?.map(t => ({ id: t.tenantId, name: t.tenantName })));
    console.log('[ensureValidToken] 📝 SESSION TENANT ID:', session.tenantId);
    
    // ALWAYS check Redis first for the selected tenant to get the latest value
    const redisTenantId = await xeroTokenManager.getSelectedTenant(userId);
    console.log('[ensureValidToken] 🗄️  REDIS TENANT ID:', redisTenantId);
    
    let finalTenantId: string;
    let tenantSource: string;
    
    if (redisTenantId) {
        finalTenantId = redisTenantId;
        tenantSource = 'Redis';
        console.log('[ensureValidToken] ✅ Using tenant ID from Redis storage:', redisTenantId);
    } else if (session.tenantId) {
        finalTenantId = session.tenantId;
        tenantSource = 'Session';
        console.log('[ensureValidToken] ⚠️  No Redis tenant, using session tenant:', session.tenantId);
        // Save it to Redis for consistency
        await xeroTokenManager.saveSelectedTenant(userId, session.tenantId);
    } else if (availableTenants && availableTenants.length > 0) {
        const defaultTenant = availableTenants.find((t: any) => t.tenantType === 'ORGANISATION') || availableTenants[0];
        finalTenantId = defaultTenant.tenantId;
        tenantSource = 'Default';
        console.log('[ensureValidToken] 🎯 Using default tenant:', defaultTenant);
        await xeroTokenManager.saveSelectedTenant(userId, defaultTenant.tenantId);
    } else {
        console.error('[ensureValidToken] ❌ NO TENANT AVAILABLE');
        throw new Error('No tenant ID available. Please select a tenant.');
    }
    
    // Validate the selected tenant exists in available tenants
    const selectedTenantInfo = availableTenants?.find(t => t.tenantId === finalTenantId);
    if (!selectedTenantInfo) {
        console.error('[ensureValidToken] 🚨 CRITICAL: Selected tenant not found in available tenants!');
        console.error('[ensureValidToken] Selected:', finalTenantId);
        console.error('[ensureValidToken] Available:', availableTenants?.map(t => t.tenantId));
        throw new Error(`Selected tenant ${finalTenantId} is not available. Please reselect a tenant.`);
    }
    
    console.log('[ensureValidToken] 🎉 FINAL RESOLUTION:');
    console.log('[ensureValidToken]   Source:', tenantSource);
    console.log('[ensureValidToken]   Tenant ID:', finalTenantId);
    console.log('[ensureValidToken]   Tenant Name:', selectedTenantInfo.tenantName);
    console.log('[ensureValidToken]   User:', userId);
    
    return {
        access_token: session.accessToken,
        effective_tenant_id: finalTenantId,
        user_id: userId,
        available_tenants: availableTenants
    };
}
