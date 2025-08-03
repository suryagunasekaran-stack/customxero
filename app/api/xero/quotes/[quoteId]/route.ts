import { NextRequest, NextResponse } from 'next/server';
import { XeroQuoteService } from '@/lib/services/xeroQuoteService';
import { auth } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ quoteId: string }> }
) {
  try {
    // Check authentication
    const session = await auth();
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const { quoteId } = await params;
    const tenantId = req.headers.get('x-tenant-id');
    
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant ID required' },
        { status: 400 }
      );
    }
    
    const quote = await XeroQuoteService.fetchQuoteById(tenantId, quoteId);
    
    if (!quote) {
      return NextResponse.json(
        { success: false, error: 'Quote not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      quote
    });
    
  } catch (error) {
    console.error('Error fetching quote:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch quote' },
      { status: 500 }
    );
  }
}