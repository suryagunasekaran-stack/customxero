import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { xeroTokenManager } from '@/lib/xeroTokenManager';

/**
 * GET /api/tenants - Returns available Xero tenants and current selection
 * Retrieves tenant data from session and Redis storage with fallback handling
 * @returns {Promise<Response>} JSON response with tenant data or error
 */
export async function GET() {
  try {
    const session = await auth();
    
    if (!session) {
      return NextResponse.json({ 
        error: 'Not authenticated' 
      }, { status: 401 });
    }

    const userEmail = session.user?.email;
    if (!userEmail || typeof userEmail !== 'string' || !userEmail.trim()) {
      console.error('[Tenants GET] Invalid user email:', userEmail);
      return NextResponse.json({ 
        error: 'Invalid user session - no valid email found' 
      }, { status: 400 });
    }

    const userId = userEmail.trim();
    
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

/**
 * POST /api/tenants - Sets the selected tenant for the current user
 * Validates tenant ID and saves selection to Redis storage
 * @param {Request} request - HTTP request with tenantId in JSON body
 * @returns {Promise<Response>} JSON response with success status or error
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    
    if (!session) {
      return NextResponse.json({ 
        error: 'Not authenticated' 
      }, { status: 401 });
    }

    const userEmail = session.user?.email;
    if (!userEmail || typeof userEmail !== 'string' || !userEmail.trim()) {
      console.error('[Tenants POST] Invalid user email:', userEmail);
      return NextResponse.json({ 
        error: 'Invalid user session - no valid email found' 
      }, { status: 400 });
    }

    const userId = userEmail.trim();
    const { tenantId } = await request.json();

    console.log('[Tenants POST] User:', userId, 'Switching to tenant:', tenantId);

    if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
      return NextResponse.json({ 
        error: 'Tenant ID is required and must be a valid string' 
      }, { status: 400 });
    }

    const cleanTenantId = tenantId.trim();

    // Verify the tenant exists in available tenants
    const availableTenants = session.tenants || await xeroTokenManager.getUserTenants(userId) || [];
    if (!availableTenants.find((t: any) => t.tenantId === cleanTenantId)) {
      console.error('[Tenants POST] Invalid tenant ID:', cleanTenantId, 'Available:', availableTenants.map((t: any) => t.tenantId));
      return NextResponse.json({ 
        error: 'Invalid tenant ID' 
      }, { status: 400 });
    }

    console.log('[Tenants POST] 🔄 SWITCHING TENANT:');
    console.log('[Tenants POST]   User:', userId);
    console.log('[Tenants POST]   From tenant:', session.tenantId);
    console.log('[Tenants POST]   To tenant:', cleanTenantId);
    console.log('[Tenants POST]   Tenant name:', availableTenants.find((t: any) => t.tenantId === cleanTenantId)?.tenantName);
    
    await xeroTokenManager.saveSelectedTenant(userId, cleanTenantId);
    console.log('[Tenants POST] ✅ Successfully saved tenant:', cleanTenantId, 'for user:', userId);

    // Verify it was saved
    const verifyTenant = await xeroTokenManager.getSelectedTenant(userId);
    console.log('[Tenants POST] 🔍 Verification - saved tenant:', verifyTenant);
    
    if (verifyTenant !== cleanTenantId) {
        console.error('[Tenants POST] 🚨 CRITICAL: Tenant save verification failed!');
        console.error('[Tenants POST]   Expected:', cleanTenantId);
        console.error('[Tenants POST]   Actual:', verifyTenant);
        return NextResponse.json({ 
          error: 'Failed to save tenant selection' 
        }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      selectedTenant: cleanTenantId 
    });
  } catch (error) {
    console.error('[Tenants API] Error setting selected tenant:', error);
    return NextResponse.json({ 
      error: 'Failed to set selected tenant' 
    }, { status: 500 });
  }
} 