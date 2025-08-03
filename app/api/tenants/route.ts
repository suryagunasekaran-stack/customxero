import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { XeroTokenStore } from '@/lib/redis/xeroTokenStore';

/**
 * GET /api/tenants - Retrieves user's available Xero tenants and current selection
 * Used by TenantSelector component to populate the tenant dropdown
 * @returns {NextResponse} JSON response with tenants array and selected tenant ID
 */
export async function GET() {
  console.log('[Tenants GET] Fetching tenants list');
  
  try {
    const session = await auth();
    
    if (!session || !session.user?.email) {
      console.error('[Tenants GET] No authenticated session found');
      return NextResponse.json({ 
        error: 'Unauthorized', 
        message: 'No authenticated session found' 
      }, { status: 401 });
    }
    
    const userId = session.user.email.trim();
    console.log('[Tenants GET] User:', userId);
    
    // Get tenants from session or storage
    let tenants = (session as any).tenants || [];
    
    // If not in session, try to get from storage
    if (!tenants || tenants.length === 0) {
      const storedTenants = await XeroTokenStore.getUserTenants(userId);
      if (storedTenants) {
        tenants = storedTenants;
      }
    }
    
    // Always get selected tenant from Redis to ensure latest value
    const storedSelectedTenant = await XeroTokenStore.getSelectedTenant(userId);
    let selectedTenant = storedSelectedTenant;
    
    console.log('[Tenants GET] Found tenants:', tenants.length);
    console.log('[Tenants GET] Selected tenant from storage:', storedSelectedTenant);
    
    // If no selected tenant but tenants available, select default
    if (!selectedTenant && tenants.length > 0) {
      const defaultTenant = tenants.find((t: any) => t.tenantType === 'ORGANISATION') || tenants[0];
      selectedTenant = defaultTenant.tenantId;
      console.log('[Tenants GET] No selected tenant, using default:', selectedTenant);
      await XeroTokenStore.saveSelectedTenant(userId, defaultTenant.tenantId);
    }
    
    return NextResponse.json({
      availableTenants: tenants,
      selectedTenant,
      hasMultipleTenants: tenants.length > 1,
      // Keep 'tenants' for backward compatibility
      tenants,
    });
  } catch (error) {
    console.error('[Tenants GET] Error:', error);
    return NextResponse.json({ 
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 });
  }
}

/**
 * POST /api/tenants - Updates the user's selected Xero tenant
 * Stores the selection in Redis for persistence across sessions
 * @param {Request} request - Contains tenantId in JSON body
 * @returns {NextResponse} Confirmation of tenant selection
 */
export async function POST(request: Request) {
  console.log('[Tenants POST] ===== TENANT SELECTION REQUEST =====');
  
  try {
    const session = await auth();
    
    if (!session || !session.user?.email) {
      console.error('[Tenants POST] No authenticated session found');
      return NextResponse.json({ 
        error: 'Unauthorized',
        message: 'No authenticated session found'
      }, { status: 401 });
    }
    
    const userId = session.user.email.trim();
    console.log('[Tenants POST] User:', userId);
    
    const body = await request.json();
    const { tenantId } = body;
    
    if (!tenantId || typeof tenantId !== 'string') {
      console.error('[Tenants POST] Invalid tenant ID provided:', tenantId);
      return NextResponse.json({ 
        error: 'Bad Request',
        message: 'Invalid tenant ID provided'
      }, { status: 400 });
    }
    
    const cleanTenantId = tenantId.trim();
    console.log('[Tenants POST] Requested tenant ID:', cleanTenantId);
    
    // Verify the tenant exists in available tenants
    const availableTenants = (session as any).tenants || await XeroTokenStore.getUserTenants(userId) || [];
    if (!availableTenants.find((t: any) => t.tenantId === cleanTenantId)) {
      console.error('[Tenants POST] Invalid tenant ID:', cleanTenantId, 'Available:', availableTenants.map((t: any) => t.tenantId));
      return NextResponse.json({ 
        error: 'Bad Request',
        message: 'Invalid tenant ID - tenant not found in available tenants'
      }, { status: 400 });
    }
    
    // Save to Redis (serverless-compatible)
    console.log('[Tenants POST] 🔄 Attempting to save tenant:', cleanTenantId);
    console.log('[Tenants POST]   User:', userId);
    console.log('[Tenants POST]   Tenant name:', availableTenants.find((t: any) => t.tenantId === cleanTenantId)?.tenantName);
    
    await XeroTokenStore.saveSelectedTenant(userId, cleanTenantId);
    console.log('[Tenants POST] ✅ Successfully saved tenant:', cleanTenantId, 'for user:', userId);

    // Verify it was saved
    const verifyTenant = await XeroTokenStore.getSelectedTenant(userId);
    console.log('[Tenants POST] 🔍 Verification - saved tenant:', verifyTenant);
    
    if (verifyTenant !== cleanTenantId) {
      console.error('[Tenants POST] ❌ Verification failed! Expected:', cleanTenantId, 'Got:', verifyTenant);
      return NextResponse.json({ 
        error: 'Internal Server Error',
        message: 'Failed to verify tenant selection'
      }, { status: 500 });
    }
    
    console.log('[Tenants POST] ===== TENANT SELECTION COMPLETE =====');
    return NextResponse.json({ 
      success: true, 
      tenantId: cleanTenantId,
      message: 'Tenant selection saved successfully'
    });
  } catch (error) {
    console.error('[Tenants POST] Error saving tenant selection:', error);
    return NextResponse.json({ 
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to save tenant selection'
    }, { status: 500 });
  }
}