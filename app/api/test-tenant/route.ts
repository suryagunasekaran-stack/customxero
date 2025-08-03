import { NextRequest, NextResponse } from 'next/server';
import { ensureValidToken } from '@/lib/ensureXeroToken';
import { auth } from '@/lib/auth';

/**
 * Test endpoint to verify which tenant is currently active
 * GET /api/test-tenant
 */
export async function GET(request: NextRequest) {
  try {
    console.log('[Test Tenant API] 🧪 TESTING CURRENT TENANT SELECTION');
    
    const session = await auth();
    const { access_token, effective_tenant_id, available_tenants } = await ensureValidToken();
    const selectedTenant = available_tenants?.find(t => t.tenantId === effective_tenant_id);
    
    // Fetch organization info to verify we're talking to the right tenant
    const orgResponse = await fetch('https://api.xero.com/api.xro/2.0/Organisation', {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Xero-Tenant-Id': effective_tenant_id,
        'Accept': 'application/json'
      }
    });
    
    let xeroOrgName = 'Unknown';
    if (orgResponse.ok) {
      const orgData = await orgResponse.json();
      xeroOrgName = orgData.Organisations?.[0]?.Name || 'Unknown';
    }
    
    const result = {
      success: true,
      user: session?.user?.email,
      sessionTenantId: (session as any)?.tenantId,
      effectiveTenantId: effective_tenant_id,
      selectedTenantName: selectedTenant?.tenantName,
      xeroOrgName: xeroOrgName,
      allAvailableTenants: available_tenants?.map(t => ({
        id: t.tenantId,
        name: t.tenantName,
        type: t.tenantType
      })),
      match: selectedTenant?.tenantName === xeroOrgName
    };
    
    console.log('[Test Tenant API] 📋 CURRENT TENANT STATUS:', result);
    
    return NextResponse.json(result);
    
  } catch (error: any) {
    console.error('[Test Tenant API] ❌ Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
} 