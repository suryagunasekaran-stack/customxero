import { NextRequest, NextResponse } from 'next/server';
import { ensureValidToken } from '@/lib/ensureXeroToken';
import { syncProductsToXeroQuote, acceptXeroQuote, fixQuoteNumber } from '@/lib/fixes/xeroQuoteFixesV2';
import { syncProductsToPipedrive } from '@/lib/fixes/pipedriveFixes';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { dealId, issueCode, dealData } = body;
    
    if (!dealId || !issueCode) {
      return NextResponse.json({ 
        error: 'Missing required parameters' 
      }, { status: 400 });
    }
    
    const { effective_tenant_id } = await ensureValidToken();
    
    console.log(`Fixing issue ${issueCode} for deal ${dealId}`);
    
    switch (issueCode) {
      case 'DEAL_PRODUCTS_VALUE_MISMATCH':
        // Check if Pipedrive has no products but Xero does
        const pipedriveProductCount = dealData?.dealProducts?.length || 0;
        const xeroLineItemCount = dealData?.xeroQuote?.LineItems?.length || 0;
        
        if (pipedriveProductCount === 0 && xeroLineItemCount > 0) {
          // Sync from Xero to Pipedrive when Pipedrive is empty
          const pipedriveResult = await syncProductsToPipedrive({
            dealId: dealId,
            xeroLineItems: dealData.xeroQuote.LineItems,
            apiKey: process.env.PIPEDRIVE_KEY!,
            companyDomain: 'bseni'
          });
          
          if (pipedriveResult.success) {
            return NextResponse.json({ 
              success: true,
              message: 'Products synced from Xero to Pipedrive successfully'
            });
          } else {
            return NextResponse.json({ 
              error: pipedriveResult.error || 'Failed to sync products' 
            }, { status: 500 });
          }
        } else {
          // Otherwise sync from Pipedrive to Xero
          if (!dealData?.xeroQuoteId || !dealData?.dealProducts) {
            return NextResponse.json({ 
              error: 'Missing quote ID or products data' 
            }, { status: 400 });
          }
          
          const syncResult = await syncProductsToXeroQuote({
            xeroQuoteId: dealData.xeroQuoteId,
            pipedriveProducts: dealData.dealProducts,
            tenantId: effective_tenant_id
          });
          
          if (syncResult.success) {
            return NextResponse.json({ 
              success: true,
              message: 'Products synced successfully',
              updatedQuote: syncResult.updatedQuote
            });
          } else {
            return NextResponse.json({ 
              error: syncResult.error || 'Failed to sync products' 
            }, { status: 500 });
          }
        }
        
      case 'PRODUCT_COUNT_MISMATCH':
      case 'XERO_QUOTE_VALUE_MISMATCH':
        // Sync products from Pipedrive to Xero
        if (!dealData?.xeroQuoteId || !dealData?.dealProducts) {
          return NextResponse.json({ 
            error: 'Missing quote ID or products data' 
          }, { status: 400 });
        }
        
        const syncResult = await syncProductsToXeroQuote({
          xeroQuoteId: dealData.xeroQuoteId,
          pipedriveProducts: dealData.dealProducts,
          tenantId: effective_tenant_id
        });
        
        if (syncResult.success) {
          return NextResponse.json({ 
            success: true,
            message: 'Products synced successfully',
            updatedQuote: syncResult.updatedQuote
          });
        } else {
          return NextResponse.json({ 
            error: syncResult.error || 'Failed to sync products' 
          }, { status: 500 });
        }
        
      case 'XERO_QUOTE_NOT_ACCEPTED':
        // Accept the quote in Xero
        if (!dealData?.xeroQuoteId) {
          return NextResponse.json({ 
            error: 'Missing quote ID' 
          }, { status: 400 });
        }
        
        const acceptResult = await acceptXeroQuote({
          xeroQuoteId: dealData.xeroQuoteId,
          tenantId: effective_tenant_id
        });
        
        if (acceptResult.success) {
          return NextResponse.json({ 
            success: true,
            message: 'Quote accepted successfully'
          });
        } else {
          return NextResponse.json({ 
            error: acceptResult.error || 'Failed to accept quote' 
          }, { status: 500 });
        }
        
      case 'XERO_QUOTE_NUMBER_NO_PROJECT':
        // Fix quote number format
        if (!dealData?.xeroQuoteId || !dealData?.expectedQuoteNumber) {
          return NextResponse.json({ 
            error: 'Missing quote ID or expected quote number' 
          }, { status: 400 });
        }
        
        const fixNumberResult = await fixQuoteNumber({
          xeroQuoteId: dealData.xeroQuoteId,
          newQuoteNumber: dealData.expectedQuoteNumber,
          tenantId: effective_tenant_id
        });
        
        if (fixNumberResult.success) {
          return NextResponse.json({ 
            success: true,
            message: 'Quote number updated successfully'
          });
        } else {
          return NextResponse.json({ 
            error: fixNumberResult.error || 'Failed to update quote number' 
          }, { status: 500 });
        }
        
      // These require manual intervention
      case 'TITLE_INCOMPLETE':
      case 'VESSEL_NAME_INVALID':
      case 'DEAL_ORG_MISSING':
      case 'CURRENCY_MISMATCH':
      case 'NO_PRODUCTS':
      case 'CUSTOMER_NAME_MISMATCH':
        return NextResponse.json({ 
          error: `${issueCode} requires manual intervention` 
        }, { status: 501 });
        
      default:
        return NextResponse.json({ 
          error: `Unknown issue code: ${issueCode}` 
        }, { status: 400 });
    }
    
  } catch (error) {
    console.error('Error fixing issue:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, { status: 500 });
  }
}