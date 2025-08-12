import { NextRequest, NextResponse } from 'next/server';
import { XeroProjectsSyncService } from '@/app/api/xero/services/XeroProjectsSyncService';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    // Accept tenant ID from request body
    const body = await request.json();
    const tenantId = body.tenantId;
    
    if (!tenantId) {
      return NextResponse.json({ 
        error: 'Tenant ID is required' 
      }, { status: 400 });
    }

    logger.info({ tenantId }, 'Starting Xero projects sync');

    const result = await XeroProjectsSyncService.syncProjectsForTenant(tenantId);

    logger.info({
      tenantId,
      projectsSynced: result.projectsSynced,
      projectsFailed: result.projectsFailed,
      tasksSynced: result.tasksSynced,
      syncDuration: result.syncDuration
    }, 'Xero projects sync completed');

    return NextResponse.json(result);

  } catch (error) {
    logger.error({ error }, 'Failed to sync Xero projects');

    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to sync projects'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');
    
    if (!tenantId) {
      return NextResponse.json({ 
        error: 'Tenant ID is required' 
      }, { status: 400 });
    }

    const syncInfo = await XeroProjectsSyncService.getLastSyncInfo(tenantId);
    const projects = await XeroProjectsSyncService.getStoredProjects(tenantId);

    return NextResponse.json({
      tenantId,
      lastSyncedAt: syncInfo.lastSyncedAt,
      projectCount: syncInfo.projectCount,
      projects: projects.map(p => ({
        projectId: p.projectId,
        name: p.projectData?.name,
        projectCode: p.projectCode,
        status: p.projectData?.status,
        totalTasks: p.totalTasks,
        totalProjectValue: p.totalProjectValue,
        lastSyncedAt: p.lastSyncedAt
      }))
    });

  } catch (error) {
    logger.error({ error }, 'Failed to fetch Xero projects sync info');
    
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to fetch sync info'
    }, { status: 500 });
  }
}