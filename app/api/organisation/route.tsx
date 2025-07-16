import { NextResponse } from 'next/server';
import { ensureValidToken } from '@/lib/ensureXeroToken';
import { trackXeroApiCall } from '@/lib/xeroApiTracker';

export async function GET() {
    try {
        const { access_token, effective_tenant_id } = await ensureValidToken();

        const res = await fetch('https://api.xero.com/api.xro/2.0/Organisation', {
            headers: {
                Authorization: `Bearer ${access_token}`,
                'Xero-tenant-id': effective_tenant_id,
                Accept: 'application/json',
            },
        });

        // Debug: Log all headers to see what Xero is actually sending
        console.log('[Organisation API] All Xero response headers:');
        for (const [key, value] of res.headers.entries()) {
            console.log(`  ${key}: ${value}`);
        }
        
        // Track API call with actual rate limit data from Xero response headers
        await trackXeroApiCall(effective_tenant_id);

        const data = await res.json();
        return NextResponse.json(data);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
