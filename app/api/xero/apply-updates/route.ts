import { NextRequest, NextResponse } from 'next/server';
import { XeroUpdateService } from '@/app/api/xero/services/XeroUpdateService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenantId, updates, creates } = body;
    
    if (!tenantId) {
      return NextResponse.json({ 
        error: 'Tenant ID is required' 
      }, { status: 400 });
    }

    if (!updates || !creates) {
      return NextResponse.json({ 
        error: 'Updates and creates arrays are required' 
      }, { status: 400 });
    }

    console.log('[Xero Apply Updates] Starting updates for tenant:', tenantId);
    console.log('[Xero Apply Updates] Updates to apply:', updates.length);
    console.log('[Xero Apply Updates] Creates to apply:', creates.length);

    const result = await XeroUpdateService.applyUpdates(tenantId, updates, creates);

    console.log('[Xero Apply Updates] Update completed:', {
      success: result.success,
      successCount: result.successCount,
      failureCount: result.failureCount,
      duration: result.duration
    });

    return NextResponse.json(result);

  } catch (error) {
    console.error('[Xero Apply Updates] Error:', error);

    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to apply updates'
    }, { status: 500 });
  }
}