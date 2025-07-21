import { NextRequest, NextResponse } from 'next/server';
import { XeroSyncVerificationService } from '@/app/api/xero/services/XeroSyncVerificationService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenantId, projectId, checkAll = false, limit = 10 } = body;
    
    if (!tenantId) {
      return NextResponse.json({ 
        error: 'Tenant ID is required' 
      }, { status: 400 });
    }

    console.log('[Xero Sync Verification] Starting verification for tenant:', tenantId);

    let result;
    
    if (checkAll) {
      result = await XeroSyncVerificationService.verifyAllProjects(tenantId, limit);
      console.log('[Xero Sync Verification] Checked multiple projects:', {
        projectsChecked: result.projectsChecked,
        projectsWithMismatches: result.projectsWithMismatches,
        totalMismatches: result.totalMismatches
      });
    } else if (projectId) {
      result = await XeroSyncVerificationService.verifyProjectSync(tenantId, projectId);
      console.log('[Xero Sync Verification] Checked single project:', {
        projectId,
        totalMismatches: result.totalMismatches
      });
    } else {
      return NextResponse.json({ 
        error: 'Either projectId or checkAll must be specified' 
      }, { status: 400 });
    }

    // Log detailed mismatches for debugging
    if (result.totalMismatches > 0) {
      console.log('[Xero Sync Verification] Found mismatches:');
      result.mismatches.slice(0, 5).forEach(mismatch => {
        console.log(`  - Project ${mismatch.projectCode}: Task "${mismatch.taskName}" - ${mismatch.field}: stored=${mismatch.storedValue}, xero=${mismatch.xeroValue}`);
      });
      if (result.mismatches.length > 5) {
        console.log(`  ... and ${result.mismatches.length - 5} more mismatches`);
      }
    }

    return NextResponse.json({
      success: true,
      verification: result,
      recommendation: result.totalMismatches > 0 
        ? 'Data is out of sync. Run a fresh sync to update the stored data.'
        : 'Data is in sync with Xero.'
    });

  } catch (error) {
    console.error('[Xero Sync Verification] Error:', error);

    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to verify sync'
    }, { status: 500 });
  }
}