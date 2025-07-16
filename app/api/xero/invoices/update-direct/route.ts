import { NextRequest, NextResponse } from 'next/server';
import { ensureValidToken } from '@/lib/ensureXeroToken';
import { trackXeroApiCall } from '@/lib/xeroApiTracker';
import { SmartRateLimit } from '@/lib/smartRateLimit';

export async function POST(request: NextRequest) {
  try {
    console.log('[Invoice Update Direct] Starting direct invoice update');
    
    // Get the Xero-formatted payload
    const xeroPayload = await request.json();
    
    // Validate payload structure
    if (!xeroPayload.Invoices || !Array.isArray(xeroPayload.Invoices)) {
      return NextResponse.json(
        { error: 'Invalid payload. Expected { Invoices: [...] }' },
        { status: 400 }
      );
    }
    
    console.log(`[Invoice Update Direct] Processing ${xeroPayload.Invoices.length} invoices`);
    
    // Get authenticated token
    const tokenData = await ensureValidToken();
    if (!tokenData) {
      return NextResponse.json(
        { error: 'No authenticated session. Please login.' },
        { status: 401 }
      );
    }
    
    // Apply rate limiting
    await SmartRateLimit.waitIfNeeded();
    
    // Send directly to Xero API
    const updateRes = await fetch('https://api.xero.com/api.xro/2.0/Invoices?SummarizeErrors=false', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'Xero-tenant-id': tokenData.effective_tenant_id,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(xeroPayload)
    });
    
    // Track API usage
    await trackXeroApiCall(tokenData.effective_tenant_id);
    
    const responseData = await updateRes.json();
    
    if (!updateRes.ok) {
      console.error('[Invoice Update Direct] Xero API error:', responseData);
      return NextResponse.json(
        { 
          error: 'Xero API error',
          details: responseData
        },
        { status: updateRes.status }
      );
    }
    
    // Process response with SummarizeErrors=false format
    const results = responseData.Invoices.map((invoice: any) => ({
      invoiceNumber: invoice.InvoiceNumber,
      invoiceId: invoice.InvoiceID,
      status: invoice.StatusAttributeString === 'ERROR' ? 'failed' : 'success',
      errors: invoice.ValidationErrors || [],
      hasValidationErrors: invoice.HasValidationErrors || false
    }));
    
    const successCount = results.filter((r: any) => r.status === 'success').length;
    const failureCount = results.filter((r: any) => r.status === 'failed').length;
    
    console.log(`[Invoice Update Direct] Completed: ${successCount} success, ${failureCount} failed`);
    
    return NextResponse.json({
      success: true,
      summary: {
        total: xeroPayload.Invoices.length,
        successful: successCount,
        failed: failureCount
      },
      results,
      rawResponse: responseData
    });
    
  } catch (error) {
    console.error('[Invoice Update Direct] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
} 