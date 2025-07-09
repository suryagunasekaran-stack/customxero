import { NextResponse, NextRequest } from 'next/server';
import { AuditLogger } from '@/lib/auditLogger';
import { auth } from '@/lib/auth';
import { ensureValidToken } from '@/lib/ensureXeroToken';

/**
 * Extracts comparison key from Xero project name
 * For patterns like "ED255007 - Viking Passero", returns "ed255007-vikingpassero"
 * @param {string | undefined | null} name - Xero project name
 * @returns {string} Normalized comparison key (lowercase, with hyphen-separated parts)
 */
const getXeroComparisonKey = (name: string | undefined | null): string => {
  if (!name) return 'UNKNOWN_PROJECT_NAME';
  
  // Split by " - " to handle "ED255007 - Viking Passero" pattern
  const parts = name.split(' - ');
  if (parts.length > 1) {
    // Take the first part (e.g., "ED255007") and the rest joined together
    const projectCode = parts[0].replace(/\s+/g, '').toLowerCase();
    const projectName = parts.slice(1).join(' ').replace(/\s+/g, '').toLowerCase();
    return projectCode + (projectName ? '-' + projectName : '');
  }
  
  // Fallback: if no " - " is present, use the whole name
  return name.replace(/\s+/g, '').toLowerCase();
};

/**
 * Extracts comparison key from Pipedrive project name
 * For patterns like "ED242263-PC2-Ithaki", returns "ed242263-ithaki"
 * Removes middle segments like "PC2" that are common in ED components
 * @param {string | undefined | null} name - Pipedrive project name
 * @returns {string} Normalized comparison key (lowercase, with specific parts)
 */
const getPipedriveComparisonKey = (name: string | undefined | null): string => {
  if (!name) return 'UNKNOWN_PROJECT_NAME';
  
  // First check if it has the " - " pattern (similar to Xero)
  if (name.includes(' - ')) {
    const parts = name.split(' - ');
    const projectCode = parts[0].replace(/\s+/g, '').toLowerCase();
    const projectName = parts.slice(1).join(' ').replace(/\s+/g, '').toLowerCase();
    return projectCode + (projectName ? '-' + projectName : '');
  }
  
  // Handle patterns like "ED242263-PC2-Ithaki" for ED components
  if (name.toUpperCase().startsWith('ED')) {
    const segments = name.split('-');
    if (segments.length >= 3) {
      // For ED projects, typically keep first segment (ED number) and last segment (vessel name)
      // Remove middle segments like "PC2", "PC1", etc.
      const edNumber = segments[0].replace(/\s+/g, '').toLowerCase();
      const vesselName = segments[segments.length - 1].replace(/\s+/g, '').toLowerCase();
      return `${edNumber}-${vesselName}`;
    }
  }
  
  // Handle other hyphenated patterns
  const segments = name.split('-');
  if (segments.length > 1) {
    // Keep all segments but remove spaces
    return segments.map(s => s.replace(/\s+/g, '').toLowerCase()).join('-');
  }
  
  // Fallback: use the whole name
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
      pipedriveProjects.map((p: any) => [getPipedriveComparisonKey(p.name || p.title), p]) // p.title for Pipedrive deals
    );
    const xeroProjectMap = new Map(
      xeroProjects.map((x: any) => [getXeroComparisonKey(x.name), x])
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
      projectsOnlyInPipedrive: onlyInPipedrive.map(p => ({ name: p.name || p.title, key: getPipedriveComparisonKey(p.name || p.title) })),
      projectsOnlyInXero: onlyInXero.map(x => ({ name: x.name, key: getXeroComparisonKey(x.name) })),
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
