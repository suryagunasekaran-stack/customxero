import { NextRequest, NextResponse } from 'next/server';
import { ensureValidToken } from '@/lib/ensureXeroToken';
import { trackXeroApiCall } from '@/lib/xeroApiTracker';
import { waitForXeroRateLimit, updateXeroRateLimitFromHeaders } from '@/lib/xeroApiTracker';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId } = body;
    
    if (!projectId) {
      return NextResponse.json({ 
        error: 'Project ID is required' 
      }, { status: 400 });
    }

    console.log('[Debug Sync] Starting debug for project:', projectId);

    const { access_token, effective_tenant_id } = await ensureValidToken();
    
    console.log('[Debug Sync] Using tenant ID:', effective_tenant_id);

    // Fetch tasks directly from Xero
    await waitForXeroRateLimit(effective_tenant_id);
    const url = `https://api.xero.com/projects.xro/2.0/Projects/${projectId}/Tasks`;
    
    console.log('[Debug Sync] Fetching from URL:', url);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Xero-Tenant-Id': effective_tenant_id,
        'Accept': 'application/json',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      cache: 'no-store'
    });

    await trackXeroApiCall(effective_tenant_id);
    await updateXeroRateLimitFromHeaders(response.headers, effective_tenant_id);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch tasks: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    
    console.log('[Debug Sync] Raw response from Xero:');
    console.log(JSON.stringify(data, null, 2));
    
    // Log specific task details
    if (data.items) {
      console.log('[Debug Sync] Task details:');
      data.items.forEach((task: any) => {
        console.log(`  - ${task.name}: rate=${task.rate?.value}, minutes=${task.estimateMinutes}, taskId=${task.taskId}`);
      });
    }

    return NextResponse.json({
      success: true,
      tenantId: effective_tenant_id,
      projectId,
      taskCount: data.items?.length || 0,
      tasks: data.items || [],
      rawResponse: data
    });

  } catch (error) {
    console.error('[Debug Sync] Error:', error);

    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to debug sync'
    }, { status: 500 });
  }
}