import { NextResponse } from 'next/server';

export async function GET() {
    const token = globalThis.xeroToken?.access_token;
    const tenantId = globalThis.tenantId;

    if (!token || !tenantId) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const res = await fetch('https://api.xero.com/projects.xro/2.0/Projects', {
        headers: {
            Authorization: `Bearer ${token}`,
            'Xero-tenant-id': tenantId,
            Accept: 'application/json',
        },
    });

    const data = await res.json();

    const inProgress = data.items?.filter(
        (p: any) => p.status === 'INPROGRESS'
    );

    return NextResponse.json(inProgress ?? []);
}
