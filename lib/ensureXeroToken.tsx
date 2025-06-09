// lib/ensureXeroToken.ts
import { loadToken, saveToken, getEffectiveTenantId, XeroTokenData } from '@/lib/xeroToken';
import qs from 'qs';

export async function ensureValidToken(): Promise<XeroTokenData & { effective_tenant_id: string }> {
    console.log('[ensureValidToken] Attempting to ensure a valid token.');
    const token = await loadToken();
    if (!token) {
        console.error('[ensureValidToken] No token found by loadToken. Throwing error.');
        throw new Error('No token found in storage. Please authenticate.'); // More descriptive error
    }
    console.log('[ensureValidToken] Token loaded from storage:', token);

    // Get the effective tenant ID (selected tenant or fallback)
    const effectiveTenantId = await getEffectiveTenantId();
    if (!effectiveTenantId) {
        console.error('[ensureValidToken] No tenant ID available. Throwing error.');
        throw new Error('No tenant ID available. Please select a tenant.');
    }
    console.log('[ensureValidToken] Using effective tenant ID:', effectiveTenantId);

    const now = Date.now();
    const buffer = 60 * 1000; // 60 seconds buffer
    console.log(`[ensureValidToken] Current time: ${now}, Token expires_at: ${token.expires_at}, Buffer: ${buffer}`);

    if (token.expires_at > now + buffer) {
        console.log('[ensureValidToken] Token is still valid (expires_at > now + buffer). Returning current token.');
        return { ...token, effective_tenant_id: effectiveTenantId };
    }

    console.log('[ensureValidToken] Token has expired or is within buffer. Attempting to refresh.');
    if (!token.refresh_token) {
        console.error('[ensureValidToken] No refresh_token available. Cannot refresh. Throwing error.');
        // Optionally, delete the stale token from Redis here if it has no refresh token
        // await deleteToken(); 
        throw new Error('Token expired and no refresh_token available. Please re-authenticate.');
    }

    const body = qs.stringify({
        grant_type: 'refresh_token',
        refresh_token: token.refresh_token,
    });
    console.log('[ensureValidToken] Refreshing token. Request body:', body);
    console.log('[ensureValidToken] Client ID for refresh:', process.env.CLIENT_ID ? 'Set' : 'NOT SET');

    const res = await fetch('https://identity.xero.com/connect/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(
                `${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`
            ).toString('base64'),
        },
        body,
    });

    const refreshedTokenData = await res.json();
    console.log('[ensureValidToken] Response from token refresh:', refreshedTokenData);

    if (!res.ok || !refreshedTokenData.access_token) {
        console.error('[ensureValidToken] Failed to refresh token. Status:', res.status, 'Response:', refreshedTokenData);
        // Optionally, delete the old token from Redis if refresh fails
        // await deleteToken();
        throw new Error(`Failed to refresh token: ${res.status} - ${refreshedTokenData.error || 'Unknown error'}. Please re-authenticate.`);
    }

    const newExpiresAt = Date.now() + refreshedTokenData.expires_in * 1000;
    console.log(`[ensureValidToken] New token expires_in: ${refreshedTokenData.expires_in}s, New expires_at: ${newExpiresAt}`);

    const updatedToken: XeroTokenData = {
        access_token: refreshedTokenData.access_token,
        // Xero might return a new refresh token, or the old one might persist.
        // It's safer to use the one from the refresh response if provided.
        refresh_token: refreshedTokenData.refresh_token || token.refresh_token, 
        expires_at: newExpiresAt,
        tenant_id: token.tenant_id, // Tenant ID does not change on refresh
        scope: refreshedTokenData.scope || token.scope, // Persist or update scope
        token_type: refreshedTokenData.token_type || token.token_type, // Persist or update token_type
        available_tenants: token.available_tenants // Preserve available tenants
    };
    console.log('[ensureValidToken] New token data constructed after refresh:', updatedToken);

    try {
        await saveToken(updatedToken);
        console.log('[ensureValidToken] Successfully saved refreshed token.');
        return { ...updatedToken, effective_tenant_id: effectiveTenantId };
    } catch (saveError) {
        console.error('[ensureValidToken] Error saving refreshed token:', saveError);
        throw new Error('Failed to save refreshed token after successful refresh. Please try again.');
    }
}
