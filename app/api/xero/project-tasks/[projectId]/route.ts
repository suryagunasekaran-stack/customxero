import { NextRequest, NextResponse } from 'next/server';
import { ensureValidToken } from '@/lib/ensureXeroToken';
import { trackXeroApiCall } from '@/lib/xeroApiTracker';
import { SmartRateLimit } from '@/lib/smartRateLimit';

/**
 * GET /api/xero/project-tasks/[projectId] - Fetch tasks for a specific project
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    
    if (!projectId) {
      return NextResponse.json({ 
        error: 'Project ID is required' 
      }, { status: 400 });
    }

    const { access_token, effective_tenant_id } = await ensureValidToken();
    
    await SmartRateLimit.waitIfNeeded();
    
    const url = `https://api.xero.com/projects.xro/2.0/Projects/${projectId}/Tasks`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Xero-Tenant-Id': effective_tenant_id,
        'Accept': 'application/json'
      }
    });

    await trackXeroApiCall(response.headers, effective_tenant_id);
    SmartRateLimit.updateFromHeaders(response.headers);

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({ 
          tasks: [] 
        });
      }
      
      const errorText = await response.text();
      return NextResponse.json({ 
        error: `Failed to fetch tasks: ${response.status} ${errorText}` 
      }, { status: response.status });
    }

    const data = await response.json();
    
    return NextResponse.json({
      tasks: data.items || []
    });
    
  } catch (error: any) {
    console.error('[Project Tasks API] Error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to fetch project tasks'
    }, { status: 500 });
  }
} 