import { NextRequest, NextResponse } from 'next/server';
import { XeroProjectService } from '@/lib/xeroProjectService';
import { ensureValidToken } from '@/lib/ensureXeroToken';

export async function GET(request: NextRequest) {
  try {
    const { effective_tenant_id } = await ensureValidToken();
    
    // Get cache status without forcing refresh
    const cacheData = await XeroProjectService.getCacheStatus(effective_tenant_id);
    
    if (!cacheData) {
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
    
    return NextResponse.json(response);

  } catch (error: any) {
    console.error('[Cache Status API] Error:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to get cache status'
    }, { status: 500 });
  }
} 