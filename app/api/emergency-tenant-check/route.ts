import { NextRequest, NextResponse } from 'next/server';
import { ensureValidToken } from '@/lib/ensureXeroToken';
import { auth } from '@/lib/auth';

/**
 * EMERGENCY TENANT VERIFICATION ENDPOINT
 * Use this to verify which tenant is actually being used
 * GET /api/emergency-tenant-check
 */
export async function GET(request: NextRequest) {
  try {
    console.log('[EMERGENCY] 🚨 EMERGENCY TENANT CHECK STARTING');
    
    const session = await auth();
    const { access_token, effective_tenant_id, available_tenants } = await ensureValidToken();
    const selectedTenant = available_tenants?.find(t => t.tenantId === effective_tenant_id);
    
    // Fetch organization info to verify
    const orgResponse = await fetch('https://api.xero.com/api.xro/2.0/Organisation', {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Xero-Tenant-Id': effective_tenant_id,
        'Accept': 'application/json'
      }
    });
    
    let xeroOrgData = null;
    if (orgResponse.ok) {
      xeroOrgData = await orgResponse.json();
    }
    
    // Check recent projects to identify company
    const projectsResponse = await fetch('https://api.xero.com/projects.xro/2.0/Projects?status=INPROGRESS&page=1&pageSize=20', {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Xero-Tenant-Id': effective_tenant_id,
        'Accept': 'application/json'
      }
    });
    
    let projectsData = null;
    let nyProjects = [];
    if (projectsResponse.ok) {
      projectsData = await projectsResponse.json();
      const projects = projectsData.items || [];
      nyProjects = projects.filter((p: any) => p.name?.startsWith('NY')).slice(0, 10);
    }
    
    // Check for recently modified tasks in NY projects
    const recentlyModifiedTasks = [];
    if (nyProjects.length > 0) {
      for (const project of nyProjects.slice(0, 3)) {
        try {
          const tasksResponse = await fetch(`https://api.xero.com/projects.xro/2.0/projects/${project.projectId}/tasks`, {
            headers: {
              'Authorization': `Bearer ${access_token}`,
              'Xero-Tenant-Id': effective_tenant_id,
              'Accept': 'application/json'
            }
          });
          
          if (tasksResponse.ok) {
            const tasksData = await tasksResponse.json();
            const tasks = tasksData.items || [];
            recentlyModifiedTasks.push({
              projectCode: project.name.split(' - ')[0],
              projectName: project.name,
              tasks: tasks.map((t: any) => ({
                name: t.name,
                estimateMinutes: t.estimateMinutes,
                rate: t.rate,
                chargeType: t.chargeType
              }))
            });
          }
        } catch (error) {
          console.error(`[EMERGENCY] Error fetching tasks for ${project.name}:`, error);
        }
      }
    }
    
    const result = {
      timestamp: new Date().toISOString(),
      emergency: true,
      user: session?.user?.email,
      sessionTenantId: session?.tenantId,
      effectiveTenantId: effective_tenant_id,
      selectedTenantName: selectedTenant?.tenantName,
      xeroOrgName: xeroOrgData?.Organisations?.[0]?.Name,
      xeroOrgDetails: xeroOrgData?.Organisations?.[0],
      allAvailableTenants: available_tenants?.map(t => ({
        id: t.tenantId,
        name: t.tenantName,
        type: t.tenantType,
        isCurrent: t.tenantId === effective_tenant_id
      })),
      projectSample: {
        totalInProgress: projectsData?.items?.length || 0,
        nyProjectCount: nyProjects.length,
        nyProjectSample: nyProjects.slice(0, 5).map((p: any) => p.name),
        isDemoCompany: nyProjects.some((p: any) => p.name?.includes('USS SAVANNAH') || p.name?.includes('Titanic'))
      },
      recentlyModifiedTasks,
      warnings: [
        nyProjects.some((p: any) => p.name?.includes('USS SAVANNAH') || p.name?.includes('Titanic')) ? '🚨 THIS IS DEMO COMPANY (has demo projects)' : nyProjects.length > 0 ? '✅ Real NY projects found (likely naval/military)' : '✅ No NY projects found',
        effective_tenant_id === '6dd39ea4-e6a6-4993-a37a-21482ccf8d22' ? '🚨 Using BS E&I SERVICE tenant ID' : '',
        effective_tenant_id === 'ab4b2a02-e700-4fe8-a32d-5419d4195e1b' ? '🚨 Using Redis tenant ID' : '',
        effective_tenant_id === '017d3bc6-65b9-4588-9746-acb7167a59f1' ? '🚨 Using hardcoded Demo Company ID' : ''
      ].filter(Boolean),
      criticalAlert: nyProjects.some((p: any) => p.name?.includes('USS SAVANNAH') || p.name?.includes('Titanic')) && selectedTenant?.tenantName?.includes('BS E&I') ? 
        '🚨🚨🚨 CRITICAL: UI shows BS E&I but processing Demo Company data!' : null
    };
    
    console.log('[EMERGENCY] 📋 EMERGENCY TENANT CHECK RESULT:', JSON.stringify(result, null, 2));
    
    return NextResponse.json(result);
    
  } catch (error: any) {
    console.error('[EMERGENCY] ❌ Emergency check failed:', error);
    return NextResponse.json({
      emergency: true,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 