import { NextResponse } from 'next/server';
import { loadTenants, saveSelectedTenant, loadSelectedTenant } from '@/lib/xeroToken';

// GET - Return available tenants and current selection
export async function GET() {
  try {
    const availableTenants = await loadTenants();
    const selectedTenant = await loadSelectedTenant();

    if (!availableTenants || availableTenants.length === 0) {
      return NextResponse.json({ 
        error: 'No tenants available. Please authenticate with Xero first.' 
      }, { status: 404 });
    }

    return NextResponse.json({
      availableTenants,
      selectedTenant,
      hasMultipleTenants: availableTenants.length > 1
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
    const { tenantId } = await request.json();

    if (!tenantId) {
      return NextResponse.json({ 
        error: 'Tenant ID is required' 
      }, { status: 400 });
    }

    // Verify the tenant exists in available tenants
    const availableTenants = await loadTenants();
    if (!availableTenants || !availableTenants.find(t => t.tenantId === tenantId)) {
      return NextResponse.json({ 
        error: 'Invalid tenant ID' 
      }, { status: 400 });
    }

    await saveSelectedTenant(tenantId);

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