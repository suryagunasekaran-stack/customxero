import { NextResponse, NextRequest } from 'next/server';
import { AuditLogger } from '@/lib/auditLogger';
import { auth } from '@/lib/auth';
import { ensureValidToken } from '@/lib/ensureXeroToken';

/**
 * Extracts comparison key from project name for matching logic
 * Matches patterns like "ED25002 - Project Name" and extracts "ed25002"
 * @param {string | undefined | null} name - Project name to extract key from
 * @returns {string} Normalized comparison key (lowercase, no spaces)
 */
const getComparisonKey = (name: string | undefined | null): string => {
  if (!name) return 'UNKNOWN_PROJECT_NAME';
  const parts = name.split(' - ');
  if (parts.length > 1) {
    return parts[0].replace(/\s+/g, '').toLowerCase(); // Remove spaces and lowercase
  }
  // Fallback: if " - " is not present, use the whole name, remove spaces, and lowercase
  return name.replace(/\s+/g, '').toLowerCase(); 
};

/**
 * POST /api/compare/projects - Compares projects between Pipedrive and Xero systems
 * Uses intelligent matching logic based on project name patterns
 * @param {NextRequest} request - HTTP request with pipedriveProjects and xeroProjects arrays
 * @returns {Promise<NextResponse>} JSON response with detailed comparison results
 */
export async function POST(request: NextRequest) {
  console.log('[Compare API Route] Received POST request for project comparison.');
  
  // Initialize audit logger
  const session = await auth();
  const { effective_tenant_id, available_tenants } = await ensureValidToken();
  const selectedTenant = available_tenants?.find(t => t.tenantId === effective_tenant_id);
  const auditLogger = new AuditLogger(session, effective_tenant_id, selectedTenant?.tenantName);
  
  let syncLogId: string | null = null;
  
  try {
    const { pipedriveProjects, xeroProjects } = await request.json();

    if (!Array.isArray(pipedriveProjects) || !Array.isArray(xeroProjects)) {
      console.error('[Compare API Route] Invalid or missing Pipedrive or Xero projects data in the request.');
      await auditLogger.logFailure('PROJECT_SYNC', 'Invalid project data', { error: 'Expected arrays' }, request);
      return NextResponse.json({ message: 'Invalid or missing project data. Expected arrays.' }, { status: 400 });
    }

    console.log(`[Compare API Route] Comparing ${pipedriveProjects.length} Pipedrive projects with ${xeroProjects.length} Xero projects.`);
    
    // Start sync logging
    syncLogId = await auditLogger.startAction('PROJECT_SYNC', {
      pipedriveProjectCount: pipedriveProjects.length,
      xeroProjectCount: xeroProjects.length,
      action: 'comparison'
    }, request);

    const pipedriveProjectMap = new Map(
      pipedriveProjects.map((p: any) => [getComparisonKey(p.name || p.title), p]) // p.title for Pipedrive deals
    );
    const xeroProjectMap = new Map(
      xeroProjects.map((x: any) => [getComparisonKey(x.name), x])
    );

    const matchedProjects: { pipedrive: any, xero: any }[] = [];
    const onlyInPipedrive: any[] = [];
    const onlyInXero: any[] = [];

    // Check projects in Pipedrive
    for (const [pdKey, pdProject] of pipedriveProjectMap.entries()) {
      if (xeroProjectMap.has(pdKey)) {
        matchedProjects.push({ pipedrive: pdProject, xero: xeroProjectMap.get(pdKey) });
      } else {
        onlyInPipedrive.push(pdProject);
      }
    }

    // Check projects in Xero that were not matched
    for (const [xKey, xProject] of xeroProjectMap.entries()) {
      if (!pipedriveProjectMap.has(xKey)) {
        onlyInXero.push(xProject);
      }
    }
    
    const comparisonResult = {
      matchedCount: matchedProjects.length,
      onlyInPipedriveCount: onlyInPipedrive.length,
      onlyInXeroCount: onlyInXero.length,
      // Include names for reporting
      projectsOnlyInPipedrive: onlyInPipedrive.map(p => ({ name: p.name || p.title, key: getComparisonKey(p.name || p.title) })),
      projectsOnlyInXero: onlyInXero.map(x => ({ name: x.name, key: getComparisonKey(x.name) })),
      // matchedProjectDetails: matchedProjects.map(m => ({ pdName: m.pipedrive.name || m.pipedrive.title, xeroName: m.xero.name, key: getComparisonKey(m.pipedrive.name || m.pipedrive.title) })),
      summary: `Matched: ${matchedProjects.length}, Pipedrive only: ${onlyInPipedrive.length}, Xero only: ${onlyInXero.length}`
    };

    console.log('[Compare API Route] Comparison complete. Result:', comparisonResult.summary);
    
    // Complete sync log
    if (syncLogId) {
      await auditLogger.completeAction(syncLogId, 'SUCCESS', {
        comparisonResult,
        matchedProjects: matchedProjects.length,
        unmatchedPipedrive: onlyInPipedrive.length,
        unmatchedXero: onlyInXero.length,
        syncPercentage: pipedriveProjects.length > 0 ? 
          ((matchedProjects.length / pipedriveProjects.length) * 100).toFixed(1) : 0
      });
    }

    // Also log as PROJECT_SYNC_COMPLETE for reporting
    await auditLogger.logSuccess('PROJECT_SYNC_COMPLETE', {
      ...comparisonResult,
      totalProjectsAnalyzed: pipedriveProjects.length + xeroProjects.length
    }, request);

    return NextResponse.json({ comparisonResult });

  } catch (error) {
    console.error('[Compare API Route] Error during project comparison:', error);
    
    // Log the failure
    await auditLogger.logFailure('PROJECT_SYNC', error as Error, {
      step: 'comparison_error'
    }, request);
    
    // Complete any in-progress log
    if (syncLogId) {
      await auditLogger.completeAction(syncLogId, 'FAILURE', {
        error: (error as Error).message
      }, (error as Error).message);
    }
    
    return NextResponse.json({ message: 'Error comparing projects', error: (error as Error).message }, { status: 500 });
  }
}
