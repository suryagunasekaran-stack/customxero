import { NextRequest, NextResponse } from 'next/server';
import { saveToken } from '@/lib/xeroToken';
import qs from 'qs';

// Extend globalThis to include xeroToken and tenantId
declare global {
    var xeroToken: any;
    var tenantId: string;
}

export async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');

    if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });

    const body = qs.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.REDIRECT_URI,
    });

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
    console.log('🔑 TokenSet:', token);

    const tenantRes = await fetch('https://api.xero.com/connections', {
        headers: {
            Authorization: `Bearer ${token.access_token}`,
        },
    });

    const tenants = await tenantRes.json();
    console.log('🏢 Tenants:', tenants);

    const activeTenant = tenants[0];

    // Store temporarily (replace with DB or cookies in real app)
    globalThis.xeroToken = token;
    globalThis.tenantId = activeTenant.tenantId;

    const now = Date.now();
    const expiresAt = now + token.expires_in * 1000;

    await saveToken({
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at: expiresAt,
        tenant_id: activeTenant.tenantId,
    });

    // ✅ Use absolute URL
    const baseUrl = req.nextUrl.origin; // e.g., http://localhost:3000
    return NextResponse.redirect(`${baseUrl}/organisation`);
}
