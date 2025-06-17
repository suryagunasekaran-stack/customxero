// lib/ensureXeroToken.ts
import { auth } from '@/lib/auth';
import { xeroTokenManager } from '@/lib/xeroTokenManager';

export interface ValidTokenData {
    access_token: string;
    effective_tenant_id: string;
    user_id: string;
}

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
    
    const userId = session.user?.email || 'unknown';
    
    // First check if there's a tenant in the session
    if (session.tenantId) {
        console.log('[ensureValidToken] Using tenant ID from session:', session.tenantId);
        return {
            access_token: session.accessToken,
            effective_tenant_id: session.tenantId,
            user_id: userId
        };
    }
    
    // Otherwise try to get from our storage
    const effectiveTenantId = await xeroTokenManager.getSelectedTenant(userId);
    if (effectiveTenantId) {
        console.log('[ensureValidToken] Using tenant ID from storage:', effectiveTenantId);
        return {
            access_token: session.accessToken,
            effective_tenant_id: effectiveTenantId,
            user_id: userId
        };
    }
    
    // If we have tenants in session, use the first one
    if (session.tenants && session.tenants.length > 0) {
        const defaultTenant = session.tenants.find((t: any) => t.tenantType === 'ORGANISATION') || session.tenants[0];
        await xeroTokenManager.saveSelectedTenant(userId, defaultTenant.tenantId);
        return {
            access_token: session.accessToken,
            effective_tenant_id: defaultTenant.tenantId,
            user_id: userId
        };
    }
    
    throw new Error('No tenant ID available. Please select a tenant.');
}
