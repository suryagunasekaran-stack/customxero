import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { XeroQuoteService } from '@/lib/services/xeroQuoteService';

export async function GET() {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    
    const tenantId = '6dd39ea4-e6a6-4993-a37a-21482ccf8d22';
    const targetQuoteId = 'f1decff3-ab05-4c0b-a1b6-e419b9c70161';
    
    console.log(`Fetching quotes for tenant: ${tenantId}`);
    console.log(`Looking for quote: ${targetQuoteId}`);
    
    // Fetch all quotes
    const quotes = await XeroQuoteService.fetchAllQuotes(tenantId);
    
    console.log(`Fetched ${quotes.length} quotes from Xero`);
    
    // Find target quote
    const targetQuote = quotes.find(q => q.QuoteID === targetQuoteId);
    
    if (targetQuote) {
      console.log(`✓ Found target quote: ${targetQuote.QuoteNumber}`);
    } else {
      console.log(`✗ Target quote not found`);
      
      // Try to find quotes with reference to deal 558
      const deal558Quotes = quotes.filter(q => 
        q.Reference?.includes('558') || 
        q.Reference?.includes('Deal ID: 558')
      );
      
      if (deal558Quotes.length > 0) {
        console.log(`Found ${deal558Quotes.length} quotes referencing deal 558:`);
        deal558Quotes.forEach(q => {
          console.log(`  - ${q.QuoteID} (${q.QuoteNumber}): ${q.Reference}`);
        });
      }
    }
    
    return NextResponse.json({
      success: true,
      totalQuotes: quotes.length,
      hasTargetQuote: !!targetQuote,
      targetQuote: targetQuote || null,
      quotesReferencingDeal558: quotes.filter(q => 
        q.Reference?.includes('558') || 
        q.Reference?.includes('Deal ID: 558')
      ).map(q => ({
        QuoteID: q.QuoteID,
        QuoteNumber: q.QuoteNumber,
        Status: q.Status,
        Reference: q.Reference,
        Total: q.Total
      })),
      sampleQuotes: quotes.slice(0, 10).map(q => ({
        QuoteID: q.QuoteID,
        QuoteNumber: q.QuoteNumber,
        Status: q.Status,
        Reference: q.Reference
      }))
    });
  } catch (error) {
    console.error('Error fetching quotes:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to fetch quotes' 
    }, { status: 500 });
  }
}