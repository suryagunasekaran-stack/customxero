import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware/withAuth';

// Import tenant-specific validation handlers
import { bseniValidation } from './tenants/bseni';
import { newTenantValidation } from './tenants/newTenant';
import { tenantEA67107EValidation } from './tenants/tenantEA67107E';

// Map tenant IDs to their validation handlers
const tenantHandlers: Record<string, typeof bseniValidation> = {
  '6dd39ea4-e6a6-4993-a37a-21482ccf8d22': bseniValidation,
  'ea67107e-c352-40a9-a8b8-24d81ae3fc85': tenantEA67107EValidation,
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