import { NextRequest, NextResponse } from 'next/server';
import { XeroProjectService } from '@/lib/xeroProjectService';

export async function GET(request: NextRequest) {
  console.log('[Xero API Route] Received GET request for projects.');

  try {
    // Check if force refresh is requested
    const forceRefresh = request.headers.get('X-Force-Refresh') === 'true';
    console.log('[Xero API Route] Force refresh requested:', forceRefresh);

    // Use the XeroProjectService to get cached/fresh data
    const projectData = await XeroProjectService.getProjectData(forceRefresh);
    
    console.log(`[Xero API Route] Returning ${projectData.projects.length} projects from service`);
    
    return NextResponse.json({ 
      projects: projectData.projects,
      metadata: {
        lastUpdated: projectData.lastUpdated,
        expiresAt: projectData.expiresAt,
        tenantId: projectData.tenantId,
        tenantName: projectData.tenantName,
        cached: !forceRefresh
      }
    });

  } catch (error) {
    console.error('[Xero API Route] Overall error in GET projects:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ 
      message: 'Failed to fetch Xero projects', 
      error: errorMessage 
    }, { status: 500 });
  }
}
