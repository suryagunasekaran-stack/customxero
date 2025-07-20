import { NextRequest, NextResponse } from 'next/server';
import { XeroProjectsSyncService } from '@/app/api/xero/services/XeroProjectsSyncService';

export async function POST(request: NextRequest) {
  const tenantId = '6dd39ea4-e6a6-4993-a37a-21482ccf8d22';
  
  try {
    const { searchParams } = new URL(request.url);
    const requestedTenantId = searchParams.get('tenantId');
    
    if (requestedTenantId && requestedTenantId !== tenantId) {
      return NextResponse.json({ 
        error: 'This endpoint is configured for a specific tenant only' 
      }, { status: 403 });
    }

    console.log('[Xero Projects Sync] Starting sync for tenant:', tenantId);

    const result = await XeroProjectsSyncService.syncProjectsForTenant(tenantId);

    console.log('[Xero Projects Sync] Sync completed:', {
      projectsSynced: result.projectsSynced,
      projectsFailed: result.projectsFailed,
      tasksSynced: result.tasksSynced,
      syncDuration: result.syncDuration
    });

    return NextResponse.json(result);

  } catch (error) {
    console.error('[Xero Projects Sync] Error:', error);

    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to sync projects',
      tenantId
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const tenantId = '6dd39ea4-e6a6-4993-a37a-21482ccf8d22';
  
  try {
    const { searchParams } = new URL(request.url);
    const requestedTenantId = searchParams.get('tenantId');
    
    if (requestedTenantId && requestedTenantId !== tenantId) {
      return NextResponse.json({ 
        error: 'This endpoint is configured for a specific tenant only' 
      }, { status: 403 });
    }

    const syncInfo = await XeroProjectsSyncService.getLastSyncInfo(tenantId);
    const projects = await XeroProjectsSyncService.getStoredProjects(tenantId);

    return NextResponse.json({
      tenantId,
      lastSyncedAt: syncInfo.lastSyncedAt,
      projectCount: syncInfo.projectCount,
      projects: projects.map(p => ({
        projectId: p.projectId,
        name: p.projectData.name,
        projectCode: p.projectCode,
        status: p.projectData.status,
        totalTasks: p.totalTasks,
        totalProjectValue: p.totalProjectValue,
        lastSyncedAt: p.lastSyncedAt
      }))
    });

  } catch (error) {
    console.error('[Xero Projects Sync] Error fetching sync info:', error);
    
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to fetch sync info',
      tenantId
    }, { status: 500 });
  }
}