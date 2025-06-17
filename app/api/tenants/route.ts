import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { xeroTokenManager } from '@/lib/xeroTokenManager';

// GET - Return available tenants and current selection
export async function GET() {
  try {
    const session = await auth();
    
    if (!session) {
      return NextResponse.json({ 
        error: 'Not authenticated' 
      }, { status: 401 });
    }

    const userId = session.user?.email || 'unknown';
    
    // First check if tenants are in the session
    let tenants = session.tenants;
    let selectedTenant = session.tenantId;
    
    // If not in session, try to get from storage
    if (!tenants || tenants.length === 0) {
      const storedTenants = await xeroTokenManager.getUserTenants(userId);
      if (storedTenants) {
        tenants = storedTenants;
      }
    }
    
    // Always get selected tenant from Redis to ensure latest value
    const storedSelectedTenant = await xeroTokenManager.getSelectedTenant(userId);
    if (storedSelectedTenant) {
      selectedTenant = storedSelectedTenant;
    }
    
    console.log('[Tenants GET] User:', userId, 'Selected tenant from Redis:', storedSelectedTenant, 'Session tenant:', session.tenantId);

    if (!tenants || tenants.length === 0) {
      return NextResponse.json({ 
        error: 'No tenants available. Please re-authenticate with Xero.' 
      }, { status: 404 });
    }

    return NextResponse.json({
      availableTenants: tenants,
      selectedTenant,
      hasMultipleTenants: tenants.length > 1
    });
  } catch (error) {
    console.error('[Tenants API] Error fetching tenants:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch tenants' 
    }, { status: 500 });
  }
}

// POST - Set selected tenant
export async function POST(request: Request) {
  try {
    const session = await auth();
    
    if (!session) {
      return NextResponse.json({ 
        error: 'Not authenticated' 
      }, { status: 401 });
    }

    const userId = session.user?.email || 'unknown';
    const { tenantId } = await request.json();

    console.log('[Tenants POST] User:', userId, 'Switching to tenant:', tenantId);

    if (!tenantId) {
      return NextResponse.json({ 
        error: 'Tenant ID is required' 
      }, { status: 400 });
    }

    // Verify the tenant exists in available tenants
    const availableTenants = session.tenants || await xeroTokenManager.getUserTenants(userId) || [];
    if (!availableTenants.find((t: any) => t.tenantId === tenantId)) {
      console.error('[Tenants POST] Invalid tenant ID:', tenantId, 'Available:', availableTenants.map((t: any) => t.tenantId));
      return NextResponse.json({ 
        error: 'Invalid tenant ID' 
      }, { status: 400 });
    }

    await xeroTokenManager.saveSelectedTenant(userId, tenantId);
    console.log('[Tenants POST] Successfully saved tenant:', tenantId, 'for user:', userId);

    // Verify it was saved
    const verifyTenant = await xeroTokenManager.getSelectedTenant(userId);
    console.log('[Tenants POST] Verification - saved tenant:', verifyTenant);

    return NextResponse.json({ 
      success: true, 
      selectedTenant: tenantId 
    });
  } catch (error) {
    console.error('[Tenants API] Error setting selected tenant:', error);
    return NextResponse.json({ 
      error: 'Failed to set selected tenant' 
    }, { status: 500 });
  }
} 