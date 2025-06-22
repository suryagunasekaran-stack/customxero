import { NextRequest, NextResponse } from 'next/server';
import { ensureValidToken } from '@/lib/ensureXeroToken';
import { trackXeroApiCall } from '@/lib/xeroApiTracker';
import { SmartRateLimit } from '@/lib/smartRateLimit';
import { auth } from '@/lib/auth';
import { AuditLogger } from '@/lib/auditLogger';

/**
 * DELETE /api/xero/project-tasks/[projectId]/[taskId] - Delete a specific task from a project
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; taskId: string }> }
) {
  // Initialize audit logger
  const session = await auth();
  const { access_token, effective_tenant_id, available_tenants } = await ensureValidToken();
  const selectedTenant = available_tenants?.find(t => t.tenantId === effective_tenant_id);
  const auditLogger = new AuditLogger(session, effective_tenant_id, selectedTenant?.tenantName);
  
  let deleteLogId: string | null = null;
  
  try {
    const { projectId, taskId } = await params;
    
    if (!projectId || !taskId) {
      return NextResponse.json({ 
        error: 'Project ID and Task ID are required' 
      }, { status: 400 });
    }

    // Log the deletion attempt
    deleteLogId = await auditLogger.startAction('PROJECT_UPDATE', {
      action: 'DELETE_TASK',
      projectId,
      taskId
    });
    
    await SmartRateLimit.waitIfNeeded();
    
    const url = `https://api.xero.com/projects.xro/2.0/projects/${projectId}/tasks/${taskId}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Xero-Tenant-Id': effective_tenant_id,
        'Accept': 'application/json'
      }
    });

    await trackXeroApiCall(response.headers, effective_tenant_id);
    SmartRateLimit.updateFromHeaders(response.headers);

    if (!response.ok) {
      const errorText = await response.text();
      
      // Complete audit log with failure
      if (deleteLogId) {
        await auditLogger.completeAction(
          deleteLogId,
          'FAILURE',
          {
            projectId,
            taskId,
            httpStatus: response.status,
            error: errorText
          },
          `HTTP ${response.status}: ${errorText}`
        );
      }
      
      return NextResponse.json({ 
        error: `Failed to delete task: ${response.status} ${errorText}` 
      }, { status: response.status });
    }

    // Complete audit log with success
    if (deleteLogId) {
      await auditLogger.completeAction(
        deleteLogId,
        'SUCCESS',
        {
          projectId,
          taskId
        }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: 'Task deleted successfully'
    });
    
  } catch (error: any) {
    console.error('[Delete Task API] Error:', error);
    
    // Complete audit log with error
    if (deleteLogId) {
      await auditLogger.completeAction(
        deleteLogId,
        'FAILURE',
        {
          error: error.message
        },
        error.message
      );
    }
    
    return NextResponse.json({
      error: error.message || 'Failed to delete task'
    }, { status: 500 });
  }
} 