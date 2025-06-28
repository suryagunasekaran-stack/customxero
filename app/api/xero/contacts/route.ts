import { NextRequest, NextResponse } from 'next/server';
import { ensureValidToken } from '@/lib/ensureXeroToken';
import { trackXeroApiCall } from '@/lib/xeroApiTracker';
import { SmartRateLimit } from '@/lib/smartRateLimit';
import { auth } from '@/lib/auth';
import { AuditLogger } from '@/lib/auditLogger';

/**
 * PUT /api/xero/contacts - Update Xero contacts
 */
export async function PUT(request: NextRequest) {
  // Initialize audit logger
  const session = await auth();
  const { access_token, effective_tenant_id, available_tenants } = await ensureValidToken();
  const selectedTenant = available_tenants?.find(t => t.tenantId === effective_tenant_id);
  const auditLogger = new AuditLogger(session, effective_tenant_id, selectedTenant?.tenantName);
  
  let updateLogId: string | null = null;
  
  try {
    const body = await request.json();
    
    if (!body || !body.Contacts || !Array.isArray(body.Contacts)) {
      return NextResponse.json({ 
        error: 'Invalid payload. Expected { "Contacts": [...] }' 
      }, { status: 400 });
    }

    // Log the update attempt
    updateLogId = await auditLogger.startAction('PROJECT_UPDATE', {
      action: 'UPDATE_CONTACTS',
      contactCount: body.Contacts.length
    });
    
    await SmartRateLimit.waitIfNeeded();
    
    const url = 'https://api.xero.com/api.xro/2.0/Contacts';
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Xero-tenant-id': effective_tenant_id,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    await trackXeroApiCall(response.headers, effective_tenant_id);
    SmartRateLimit.updateFromHeaders(response.headers);

    if (!response.ok) {
      const errorText = await response.text();
      
      // Complete audit log with failure
      if (updateLogId) {
        await auditLogger.completeAction(
          updateLogId,
          'FAILURE',
          {
            contactCount: body.Contacts.length,
            httpStatus: response.status,
            error: errorText
          },
          `HTTP ${response.status}: ${errorText}`
        );
      }
      
      return NextResponse.json({ 
        error: `Failed to update contacts: ${response.status} ${errorText}` 
      }, { status: response.status });
    }

    const result = await response.json();

    // Complete audit log with success
    if (updateLogId) {
      await auditLogger.completeAction(
        updateLogId,
        'SUCCESS',
        {
          contactCount: body.Contacts.length,
          updatedContacts: result.Contacts?.length || 0
        }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: `Successfully updated ${result.Contacts?.length || 0} contacts`,
      data: result
    });
    
  } catch (error: any) {
    console.error('[Contacts Update API] Error:', error);
    
    // Complete audit log with failure
    if (updateLogId) {
      await auditLogger.completeAction(
        updateLogId,
        'FAILURE',
        {
          error: error.message
        },
        error.message
      );
    }
    
    return NextResponse.json({ 
      error: error.message || 'An error occurred while updating contacts' 
    }, { status: 500 });
  }
} 