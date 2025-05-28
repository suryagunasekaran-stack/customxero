import { NextRequest, NextResponse } from 'next/server';
import { saveToken, XeroTokenData } from '@/lib/xeroToken'; // Import XeroTokenData
import qs from 'qs';

// Extend globalThis to include xeroToken and tenantId
// It's generally better to avoid globalThis for such purposes if possible.
// Consider session management or other state persistence mechanisms.
declare global {
    var xeroToken: any; // Keeping for now if other parts of code rely on it, but ideally remove
    var tenantId: string; // Keeping for now
}

export async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    console.log('[Callback Route] Received request. Code:', code);

    if (!code) {
        console.error('[Callback Route] Missing authorization code in request.');
        return NextResponse.json({ error: 'Missing code' }, { status: 400 });
    }

    const body = qs.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.REDIRECT_URI,
    });
    console.log('[Callback Route] Requesting token from Xero. Body:', body);
    console.log('[Callback Route] Client ID:', process.env.CLIENT_ID ? 'Set' : 'NOT SET');
    console.log('[Callback Route] Redirect URI:', process.env.REDIRECT_URI);


    const tokenRes = await fetch('https://identity.xero.com/connect/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(
                `${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`
            ).toString('base64'),
        },
        body,
    });

    const token = await tokenRes.json();
    console.log('[Callback Route] TokenSet received from Xero:', token);

    if (!tokenRes.ok || !token.access_token) {
        console.error('[Callback Route] Failed to fetch token from Xero or token is invalid. Status:', tokenRes.status, 'Response:', token);
        return NextResponse.json({ error: 'Failed to fetch token or token invalid', details: token }, { status: tokenRes.status });
    }

    console.log('[Callback Route] Fetching tenant ID from Xero connections API.');
    const tenantRes = await fetch('https://api.xero.com/connections', {
        headers: {
            Authorization: `Bearer ${token.access_token}`,
            'Content-Type': 'application/json', // Added Content-Type for consistency
        },
    });

    const tenants = await tenantRes.json();
    console.log('[Callback Route] Tenants received from Xero:', tenants);

    if (!tenantRes.ok || !tenants || !Array.isArray(tenants) || tenants.length === 0) {
        console.error('[Callback Route] Failed to fetch tenants or no tenants found. Status:', tenantRes.status, 'Response:', tenants);
        return NextResponse.json({ error: 'Failed to fetch tenants or no tenants found', details: tenants }, { status: tenantRes.status });
    }

    const activeTenant = tenants.find(t => t.tenantType === 'ORGANISATION') || tenants[0]; // Prefer ORGANISATION type
    console.log('[Callback Route] Selected active tenant:', activeTenant);

    // globalThis.xeroToken = token; // Avoid using globalThis for storing tokens
    // globalThis.tenantId = activeTenant.tenantId;

    const now = Date.now();
    const expiresInMs = token.expires_in * 1000;
    const expiresAt = now + expiresInMs;
    console.log(`[Callback Route] Token expires_in: ${token.expires_in}s, Current time: ${now}, Expires at: ${expiresAt}`);

    const tokenDataToSave: XeroTokenData = {
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at: expiresAt,
        tenant_id: activeTenant.tenantId,
        scope: token.scope, // Make sure scope is included
        token_type: token.token_type, // Make sure token_type is included
    };

    console.log('[Callback Route] Preparing to save token data:', tokenDataToSave);
    try {
        await saveToken(tokenDataToSave);
        console.log('[Callback Route] Token saved successfully.');
    } catch (saveError) {
        console.error('[Callback Route] Error saving token:', saveError);
        // Decide if you want to redirect or show an error page
        return NextResponse.json({ error: 'Failed to save token', details: (saveError as Error).message }, { status: 500 });
    }

    const baseUrl = req.nextUrl.origin;
    console.log('[Callback Route] Redirecting to organisation page:', `${baseUrl}/organisation`);
    return NextResponse.redirect(`${baseUrl}/organisation`);
}
