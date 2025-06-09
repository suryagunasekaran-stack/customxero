import { NextResponse } from 'next/server';
import { ensureValidToken } from '@/lib/ensureXeroToken';

export async function GET() {
    try {
        const { access_token, effective_tenant_id } = await ensureValidToken();

        if (!access_token || !effective_tenant_id) {
            return NextResponse.json({ error: 'Not authenticated or tenant ID missing' }, { status: 401 });
        }

        const res = await fetch('https://api.xero.com/projects.xro/2.0/Projects', {
            headers: {
                Authorization: `Bearer ${access_token}`,
                'Xero-tenant-id': effective_tenant_id,
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
        if (err.message.includes('No token found') || err.message.includes('Token refresh logic not yet implemented')) {
            return NextResponse.json({ error: err.message }, { status: 401 });
        }
        return NextResponse.json({ error: `Internal Server Error: ${err.message}` }, { status: 500 });
    }
}
