import { NextResponse } from 'next/server';
import { ensureValidToken } from '@/lib/ensureXeroToken';
import { validateDeal, categorizeIssues, generateValidationStats } from '@/lib/validation/dealValidationRules';

// Tenant-specific Pipedrive configuration
const TENANT_PIPEDRIVE_CONFIG = {
  '6dd39ea4-e6a6-4993-a37a-21482ccf8d22': {
    apiKey: process.env.PIPEDRIVE_KEY,
    enabled: true,
    description: 'BSENI'
  }
};

/**
 * Generate matching key from title
 * Format: jobcode - vessel name
 * Example: "NY25202 - LST 207 RSS ENDURANCE (2)" -> "ny25202-lst207rssendurance"
 */
function generateMatchingKey(title: string): string {
  if (!title) return '';
  
  // Remove (2) or any number in parentheses at the end
  const cleanTitle = title.replace(/\s*\(\d+\)\s*$/, '').trim();
  
  // Match pattern: JOBCODE - VESSEL NAME
  const match = cleanTitle.match(/^([A-Z]+\d+)\s*[-\s]+\s*(.+)$/i);
  
  if (match) {
    const jobCode = match[1].toLowerCase(); // e.g., "ny25202"
    const vesselName = match[2]
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ''); // Remove all non-alphanumeric
    
    return `${jobCode}-${vesselName}`;
  }
  
  // Fallback: normalize entire title
  return cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export async function GET() {
  const encoder = new TextEncoder();
  
  // Create a custom readable stream
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Helper to send progress updates
        const sendProgress = (data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };
        
        // Get the current tenant information
        const { effective_tenant_id, access_token } = await ensureValidToken();
        
        sendProgress({ type: 'log', message: `Starting sync for tenant: ${effective_tenant_id}` });
        
        // Check if this is the BSENI tenant
        if (effective_tenant_id !== '6dd39ea4-e6a6-4993-a37a-21482ccf8d22') {
          sendProgress({ 
            type: 'error', 
            message: 'This endpoint is only for BSENI tenant',
            tenantId: effective_tenant_id 
          });
          controller.close();
          return;
        }
        
        const tenantConfig = TENANT_PIPEDRIVE_CONFIG[effective_tenant_id];
        const apiKey = tenantConfig.apiKey;
        
        if (!apiKey) {
          sendProgress({ 
            type: 'error',
            message: 'Pipedrive API key not configured'
          });
          controller.close();
          return;
        }
        
        // Update progress: Starting fetch
        sendProgress({ 
          type: 'progress', 
          step: 'fetch', 
          status: 'running',
          detail: 'Fetching won deals from Pipedrive'
        });
        
        // Fetch won deals from Pipedrive v2 API
        const companyDomain = 'bseni';
        let allDeals: any[] = [];
        let moreItemsInCollection = true;
        let cursor: string | null = null;
        let pageCount = 0;
        
        while (moreItemsInCollection) {
          const url = new URL(`https://${companyDomain}.pipedrive.com/api/v2/deals`);
          url.searchParams.append('limit', '100');
          url.searchParams.append('status', 'won');
          url.searchParams.append('pipeline_id', '2');
          if (cursor) {
            url.searchParams.append('cursor', cursor);
          }
          
          pageCount++;
          sendProgress({ 
            type: 'progress', 
            step: 'fetch', 
            status: 'running',
            detail: `Fetching page ${pageCount}...`
          });
          
          const response = await fetch(url.toString(), {
            headers: {
              'Accept': 'application/json',
              'x-api-token': apiKey
            }
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            sendProgress({ 
              type: 'error',
              message: 'Pipedrive API authentication failed',
              error: errorText
            });
            controller.close();
            return;
          }
          
          const data = await response.json();
          const pageDeals = data.data || [];
          allDeals = allDeals.concat(pageDeals);
          
          if (data.additional_data?.pagination?.next_cursor) {
            cursor = data.additional_data.pagination.next_cursor;
          } else {
            moreItemsInCollection = false;
          }
        }
        
        const wonDeals = allDeals;
        
        sendProgress({ 
          type: 'progress', 
          step: 'fetch', 
          status: 'completed',
          detail: `Found ${wonDeals.length} won deals`
        });
        
        // Update progress: Starting validation
        sendProgress({ 
          type: 'progress', 
          step: 'validate', 
          status: 'running',
          detail: 'Validating deals and Xero quotes'
        });
        
        // Validate each deal
        const validatedDeals = [];
        const xeroQuoteApiKey = '0e9dc89b14fb67546540fd3e11a7fe06653d708f';
        
        for (let i = 0; i < wonDeals.length; i++) {
          const deal = wonDeals[i];
          
          // Send progress for each deal
          if (i % 5 === 0) { // Update every 5 deals to avoid too many updates
            sendProgress({ 
              type: 'progress', 
              step: 'validate', 
              status: 'running',
              detail: `Validating deal ${i + 1} of ${wonDeals.length}...`
            });
          }
          const validationIssues: string[] = [];
          let dealData: any = {
            id: deal.id,
            title: deal.title,
            matchingKey: generateMatchingKey(deal.title),
            value: deal.value,
            currency: deal.currency,
            org_name: deal.org_name,
            pipeline_id: deal.pipeline_id,
            stage_id: deal.stage_id,
            won_time: deal.won_time,
            xeroQuoteId: null,
            xeroQuoteNumber: null,
            xeroQuoteStatus: null,
            xeroQuoteTotal: null,
            xeroQuote: null,
            productsCount: 0,
            productsTotal: 0,
            dealProducts: [],
            validationIssues: [],
            isFullySynced: false
          };
          
          try {
            // Get full deal details
            const dealDetailsUrl = new URL(`https://${companyDomain}.pipedrive.com/api/v2/deals/${deal.id}`);
            const dealDetailsResponse = await fetch(dealDetailsUrl.toString(), {
              headers: {
                'Accept': 'application/json',
                'x-api-token': apiKey
              }
            });
            
            if (!dealDetailsResponse.ok) {
              console.error('Failed to fetch deal details');
            } else {
              const dealDetails = await dealDetailsResponse.json();
              const fullDeal = dealDetails.data;
              
              // Look for Xero quote ID in custom fields
              const xeroQuoteFieldKey = '0e9dc89b14fb67546540fd3e11a7fe06653d708f';
              const xeroQuoteId = fullDeal.custom_fields?.[xeroQuoteFieldKey] || null;
              dealData.xeroQuoteId = xeroQuoteId;
              
              if (!xeroQuoteId) {
                validationIssues.push('Missing Xero quote ID');
              } else {
                // Get Xero quote details
                try {
                  const xeroQuoteUrl = `https://api.xero.com/api.xro/2.0/Quotes/${xeroQuoteId}`;
                  const xeroResponse = await fetch(xeroQuoteUrl, {
                    headers: {
                      'Accept': 'application/json',
                      'Authorization': `Bearer ${access_token}`,
                      'Xero-tenant-id': effective_tenant_id
                    }
                  });
                  
                  if (!xeroResponse.ok) {
                    const errorText = await xeroResponse.text();
                    console.error(`Xero API error for quote ${xeroQuoteId}:`, errorText);
                    validationIssues.push(`Invalid Xero quote ID (${xeroResponse.status})`);
                  } else {
                    const xeroData = await xeroResponse.json();
                    console.log(`Xero API response status: ${xeroData.Status}`);
                    
                    if (xeroData.Status === 'OK' && xeroData.Quotes && xeroData.Quotes.length > 0) {
                      const xeroQuote = xeroData.Quotes[0];
                      dealData.xeroQuoteNumber = xeroQuote.QuoteNumber;
                      dealData.xeroQuoteStatus = xeroQuote.Status;
                      dealData.xeroQuoteTotal = xeroQuote.Total;
                      
                      console.log(`Quote ${xeroQuote.QuoteNumber}: Status=${xeroQuote.Status}, Total=${xeroQuote.Total}`);
                      
                      if (xeroQuote.Status !== 'ACCEPTED') {
                        validationIssues.push(`Xero quote not accepted (status: ${xeroQuote.Status})`);
                      }
                      
                      // Check currency match
                      if (xeroQuote.CurrencyCode && deal.currency && xeroQuote.CurrencyCode !== deal.currency) {
                        validationIssues.push(`Currency mismatch (Pipedrive: ${deal.currency}, Xero: ${xeroQuote.CurrencyCode})`);
                      }
                      
                      // Log title comparison for debugging
                      if (xeroQuote.Title) {
                        console.log(`Title comparison - Deal: "${deal.title}" vs Quote: "${xeroQuote.Title}"`);
                      }
                    } else {
                      validationIssues.push('Xero quote not found in response');
                    }
                  }
                } catch (xeroError) {
                  console.error('Error fetching Xero quote:', xeroError);
                  validationIssues.push('Failed to fetch Xero quote');
                }
              }
            }
            
            // Get deal products
            try {
              const productsUrl = `https://api.pipedrive.com/v1/deals/${deal.id}/products?api_token=${apiKey}`;
              const productsResponse = await fetch(productsUrl);
              
              if (!productsResponse.ok) {
                validationIssues.push('Failed to fetch deal products');
              } else {
                const productsData = await productsResponse.json();
                const dealProducts = productsData.data || [];
                dealData.productsCount = dealProducts.length;
                
                dealData.productsTotal = dealProducts.reduce((sum: number, product: any) => {
                  return sum + (product.quantity * product.item_price);
                }, 0);
                
                if (dealData.xeroQuoteTotal && Math.abs(dealData.productsTotal - dealData.xeroQuoteTotal) > 0.01) {
                  validationIssues.push(`Product value mismatch (Pipedrive: ${dealData.productsTotal}, Xero: ${dealData.xeroQuoteTotal})`);
                }
              }
            } catch (productsError) {
              console.error('Error fetching products:', productsError);
              validationIssues.push('Failed to fetch products');
            }
            
          } catch (error) {
            console.error(`Error validating deal ${deal.id}:`, error);
            validationIssues.push('Validation error');
          }
          
          dealData.validationIssues = validationIssues;
          dealData.isFullySynced = validationIssues.length === 0;
          validatedDeals.push(dealData);
        }
        
        sendProgress({ 
          type: 'progress', 
          step: 'validate', 
          status: 'completed',
          detail: `Validated ${validatedDeals.length} deals`
        });
        
        // Update progress: Analyzing
        sendProgress({ 
          type: 'progress', 
          step: 'analyze', 
          status: 'running',
          detail: 'Analyzing sync status'
        });
        
        // Calculate validation stats
        const validationStats = {
          totalWonDeals: wonDeals.length,
          processedDeals: validatedDeals.length,
          fullySynced: validatedDeals.filter((d: any) => d.isFullySynced).length,
          withIssues: validatedDeals.filter((d: any) => !d.isFullySynced).length,
          missingXeroQuote: validatedDeals.filter((d: any) => !d.xeroQuoteId).length,
          invalidXeroQuote: validatedDeals.filter((d: any) => d.xeroQuoteId && d.validationIssues.some((i: string) => i.includes('Invalid Xero quote'))).length,
          notAcceptedQuotes: validatedDeals.filter((d: any) => d.xeroQuoteStatus && d.xeroQuoteStatus !== 'ACCEPTED').length,
          valueMismatches: validatedDeals.filter((d: any) => d.validationIssues.some((i: string) => i.includes('value mismatch'))).length,
        };
        
        const issuesCount = validationStats.withIssues;
        sendProgress({ 
          type: 'progress', 
          step: 'analyze', 
          status: 'completed',
          detail: issuesCount > 0 ? `Found ${issuesCount} deals with issues` : 'All deals properly synced'
        });
        
        // Update progress: Generating report
        sendProgress({ 
          type: 'progress', 
          step: 'report', 
          status: 'running',
          detail: 'Generating report'
        });
        
        // Group by job code prefix
        const groupedByPrefix: { [key: string]: number } = {};
        validatedDeals.forEach((deal: any) => {
          const prefix = deal.matchingKey.match(/^([a-z]+)/)?.[1] || 'other';
          groupedByPrefix[prefix] = (groupedByPrefix[prefix] || 0) + 1;
        });
        
        sendProgress({ 
          type: 'progress', 
          step: 'report', 
          status: 'completed',
          detail: 'Report ready for download'
        });
        
        // Send final result
        sendProgress({
          type: 'complete',
          data: {
            success: true,
            tenantId: effective_tenant_id,
            tenantName: 'BSENI',
            totalDeals: validatedDeals.length,
            validationStats,
            groupedByPrefix,
            deals: validatedDeals
          }
        });
        
        controller.close();
      } catch (error) {
        console.error('Error in sync stream:', error);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'error', 
          message: (error as Error).message 
        })}\n\n`));
        controller.close();
      }
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });
}