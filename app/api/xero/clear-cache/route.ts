import { NextRequest, NextResponse } from 'next/server';
import { XeroProjectService } from '@/lib/xeroProjectService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenantId } = body;
    
    if (tenantId) {
      XeroProjectService.clearCache(tenantId);
      return NextResponse.json({ 
        success: true, 
        message: `Cache cleared for tenant: ${tenantId}` 
      });
    } else {
      XeroProjectService.clearCache();
      return NextResponse.json({ 
        success: true, 
        message: 'All cache cleared' 
      });
    }
  } catch (error: any) {
    console.error('[Clear Cache API] Error:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to clear cache'
    }, { status: 500 });
  }
} 