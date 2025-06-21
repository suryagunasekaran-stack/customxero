import { NextRequest, NextResponse } from 'next/server';
import { XeroProjectService } from '@/lib/xeroProjectService';

/**
 * GET /api/xero/projects - Fetches Xero project data directly from API
 * Uses XeroProjectService for consistent data management and rate limiting
 * @param {NextRequest} request - HTTP request object
 * @returns {Promise<NextResponse>} JSON response with projects and metadata or error
 */
export async function GET(request: NextRequest) {
  console.log('[Xero API Route] Received GET request for projects.');

  try {
    // Use the XeroProjectService to get fresh data (no caching)
    const projectData = await XeroProjectService.getProjectData();
    
    console.log(`[Xero API Route] Returning ${projectData.projects.length} projects from service`);
    
    return NextResponse.json({ 
      projects: projectData.projects,
      metadata: {
        tenantId: projectData.tenantId,
        tenantName: projectData.tenantName,
        cached: false
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
