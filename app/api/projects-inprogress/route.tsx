import { NextResponse } from 'next/server';
import { ensureValidToken } from '@/lib/ensureXeroToken';

export async function GET() {
    try {
        const tokenData = await ensureValidToken();

        const res = await fetch('https://api.xero.com/projects.xro/2.0/Projects', {
            headers: {
                Authorization: `Bearer ${tokenData.access_token}`,
                'Xero-tenant-id': tokenData.effective_tenant_id,
                Accept: 'application/json',
            },
        });

        if (!res.ok) {
            const errorData = await res.json();
            return NextResponse.json({ error: `Failed to fetch projects: ${res.status}`, details: errorData }, { status: res.status });
        }

        const data = await res.json();

        const inProgress = data.items?.filter(
            (p: any) => p.status === 'INPROGRESS'
        );

        return NextResponse.json(inProgress ?? []);
    } catch (err: any) {
        if (err.message.includes('No authenticated session') || err.message.includes('Please login') || err.message.includes('re-authenticate')) {
            return NextResponse.json({ error: err.message }, { status: 401 });
        }
        return NextResponse.json({ error: `Internal Server Error: ${err.message}` }, { status: 500 });
    }
}
