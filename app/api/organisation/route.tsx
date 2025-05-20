import { NextResponse } from 'next/server';
import { ensureValidToken } from '@/lib/ensureXeroToken';

export async function GET() {
    try {
        const { access_token, tenant_id } = await ensureValidToken();

        const res = await fetch('https://api.xero.com/api.xro/2.0/Organisation', {
            headers: {
                Authorization: `Bearer ${access_token}`,
                'Xero-tenant-id': tenant_id,
                Accept: 'application/json',
            },
        });

        const data = await res.json();
        return NextResponse.json(data);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
