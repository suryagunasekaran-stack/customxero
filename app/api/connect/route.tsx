// app/api/connect/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
    const url = new URL('https://login.xero.com/identity/connect/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', process.env.CLIENT_ID!);
    url.searchParams.set('redirect_uri', process.env.REDIRECT_URI!);
    url.searchParams.set('scope', [
        'openid',
        'profile',
        'email',
        'offline_access',
        'accounting.transactions',
        'projects',
    ].join(' '));

    return NextResponse.redirect(url.toString());
}
