import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware/withAuth';

// Import tenant-specific validation handlers
import { bseniValidation } from './tenants/bseni';
import { newTenantValidation } from './tenants/newTenant';

// Map tenant IDs to their validation handlers
const tenantHandlers = {
  '6dd39ea4-e6a6-4993-a37a-21482ccf8d22': bseniValidation,
  'new-tenant-id': newTenantValidation,
  // Add more tenants here
};

async function handler(req: NextRequest) {
  const { tenantId } = await req.json();
  
  const validationHandler = tenantHandlers[tenantId];
  
  if (!validationHandler) {
    return NextResponse.json(
      { error: 'Validation not available for this tenant' },
      { status: 404 }
    );
  }
  
  try {
    const result = await validationHandler(req);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Validation error:', error);
    return NextResponse.json(
      { error: 'Validation failed' },
      { status: 500 }
    );
  }
}

export const POST = withAuth(handler);