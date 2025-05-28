// lib/ensureXeroToken.ts
import { loadToken, saveToken, XeroTokenData } from '@/lib/xeroToken';
import qs from 'qs';

export async function ensureValidToken(): Promise<XeroTokenData> {
    const token = await loadToken();
    if (!token) throw new Error('No token found');

    const now = Date.now();
    const buffer = 60 * 1000; // 60 seconds buffer

    if (token.expires_at > now + buffer) { // Added buffer here
        // ✅ Still valid
        return token;
    }

    // 🔄 Refresh
    const body = qs.stringify({
        grant_type: 'refresh_token',
        refresh_token: token.refresh_token,
    });

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

    const newToken = await res.json();

    const expiresAt = Date.now() + newToken.expires_in * 1000;

    const updated: XeroTokenData = {
        access_token: newToken.access_token,
        refresh_token: newToken.refresh_token,
        expires_at: expiresAt,
        tenant_id: token.tenant_id,
        scope: '',
        token_type: ''
    };

    await saveToken(updated);
    return updated;
}
