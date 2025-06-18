import { NextRequest, NextResponse } from 'next/server';
import { XeroProjectService } from '@/lib/xeroProjectService';
import { ensureValidToken } from '@/lib/ensureXeroToken';

export async function GET(request: NextRequest) {
  try {
    const { effective_tenant_id } = await ensureValidToken();
    console.log('[Cache Status API] Checking cache for tenant:', effective_tenant_id);
    
    // Add a small delay to see if timing is the issue
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Get cache status without forcing refresh
    const cacheData = await XeroProjectService.getCacheStatus(effective_tenant_id);
    console.log('[Cache Status API] Cache data exists:', !!cacheData);
    
    if (!cacheData) {
      console.log('[Cache Status API] No cache found, returning empty state');
      return NextResponse.json({
        projects: [],
        lastUpdated: null,
        expiresAt: null,
        tenantId: effective_tenant_id,
        tenantName: 'Unknown',
        projectCount: 0,
        isExpired: true
      });
    }

    console.log('[Cache Status API] Cache found with', cacheData.projects.length, 'projects');
    const isExpired = new Date() > cacheData.expiresAt;
    
    const response = {
      projects: cacheData.projects.map((p: any) => ({ 
        name: p.name, 
        projectId: p.projectId,
        projectCode: p.projectCode 
      })),
      lastUpdated: cacheData.lastUpdated.toISOString(),
      expiresAt: cacheData.expiresAt.toISOString(),
      tenantId: cacheData.tenantId,
      tenantName: cacheData.tenantName,
      projectCount: cacheData.projects.length,
      isExpired
    };
    
    console.log('[Cache Status API] Returning response with projectCount:', response.projectCount);
    return NextResponse.json(response);

  } catch (error: any) {
    console.error('[Cache Status API] Error:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to get cache status'
    }, { status: 500 });
  }
} 