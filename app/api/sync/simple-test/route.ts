import { NextResponse } from 'next/server';
import { ensureValidToken } from '@/lib/ensureXeroToken';

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
  try {
    // Get the current tenant information
    const { effective_tenant_id } = await ensureValidToken();
    
    console.log(`\n=== SIMPLE SYNC TEST FOR TENANT: ${effective_tenant_id} ===`);
    
    // Check if this is the BSENI tenant
    if (effective_tenant_id !== '6dd39ea4-e6a6-4993-a37a-21482ccf8d22') {
      return NextResponse.json({ 
        message: 'This endpoint is only for BSENI tenant',
        tenantId: effective_tenant_id 
      }, { status: 403 });
    }
    
    const tenantConfig = TENANT_PIPEDRIVE_CONFIG[effective_tenant_id];
    const apiKey = tenantConfig.apiKey;
    
    console.log('Environment check:');
    console.log('PIPEDRIVE_KEY from env:', process.env.PIPEDRIVE_KEY ? 'Set' : 'Not set');
    console.log('API Key being used:', apiKey ? `${apiKey.substring(0, 10)}...` : 'Not set');
    
    if (!apiKey) {
      return NextResponse.json({ 
        message: 'Pipedrive API key not configured',
        debug: {
          envKeyExists: !!process.env.PIPEDRIVE_KEY,
          configKeyExists: !!tenantConfig.apiKey
        }
      }, { status: 500 });
    }
    
    // Test the API key first with a simple request
    console.log('Testing API key with Pipedrive...');
    const testUrl = 'https://api.pipedrive.com/v1/users/me?api_token=' + apiKey;
    const testResponse = await fetch(testUrl);
    
    if (!testResponse.ok) {
      const errorText = await testResponse.text();
      console.error('API key test failed:', errorText);
      return NextResponse.json({ 
        message: 'Invalid Pipedrive API key',
        error: errorText
      }, { status: 401 });
    }
    
    const testData = await testResponse.json();
    console.log('API key valid, user:', testData.data?.name || 'Unknown');
    
    // Fetch won deals from Pipedrive v2 API with x-api-token header
    console.log('Fetching won deals from Pipedrive v2 API...');
    
    // Get company domain (you may need to configure this per tenant)
    const companyDomain = 'bseni'; // or get from config
    
    // First, we need to get all deals with pagination
    let allDeals: any[] = [];
    let moreItemsInCollection = true;
    let cursor: string | null = null;
    
    while (moreItemsInCollection) {
      const url = new URL(`https://${companyDomain}.pipedrive.com/api/v2/deals`);
      url.searchParams.append('limit', '100');
      url.searchParams.append('status', 'won'); // Filter for won deals only
      url.searchParams.append('pipeline_id', '2'); // Filter by pipeline ID 2
      if (cursor) {
        url.searchParams.append('cursor', cursor);
      }
      
      console.log(`Fetching deals page... ${cursor ? `cursor: ${cursor}` : 'first page'}`);
      
      const response = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
          'x-api-token': apiKey
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Pipedrive v2 API error:');
        console.error('Status:', response.status);
        console.error('Response:', errorText);
        console.error('Headers used:', {
          'Accept': 'application/json',
          'x-api-token': `${apiKey.substring(0, 10)}...`
        });
        
        return NextResponse.json({ 
          message: 'Pipedrive v2 API authentication failed',
          error: errorText,
          status: response.status,
          hint: 'v2 API requires OAuth2 or personal API tokens with proper scopes'
        }, { status: 401 });
      }
      
      const data = await response.json();
      
      // v2 API already filters by status=won, so no need to filter again
      const pageDeals = data.data || [];
      allDeals = allDeals.concat(pageDeals);
      
      // Check for more pages using v2 pagination structure
      if (data.additional_data?.pagination?.next_cursor) {
        cursor = data.additional_data.pagination.next_cursor;
      } else {
        moreItemsInCollection = false;
      }
      
      console.log(`Fetched ${pageDeals.length} won deals on this page, total so far: ${allDeals.length}`);
    }
    
    const wonDeals = allDeals;
    
    console.log(`Total won deals: ${wonDeals.length}`);
    
    // Validate each deal and check Xero quote
    console.log('\n=== VALIDATING DEALS ===');
    const validatedDeals = [];
    
    for (const deal of wonDeals) {
      console.log(`\nValidating deal: ${deal.title} (ID: ${deal.id})`);
      
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
        productsCount: 0,
        productsTotal: 0,
        validationIssues: [],
        isFullySynced: false
      };
      
      try {
        // Step 1: Get full deal details to find Xero quote ID
        const dealDetailsUrl = new URL(`https://${companyDomain}.pipedrive.com/api/v2/deals/${deal.id}`);
        const dealDetailsResponse = await fetch(dealDetailsUrl.toString(), {
          headers: {
            'Accept': 'application/json',
            'x-api-token': apiKey
          }
        });
        
        if (!dealDetailsResponse.ok) {
          validationIssues.push('Failed to fetch deal details');
        } else {
          const dealDetails = await dealDetailsResponse.json();
          const fullDeal = dealDetails.data;
          
          // Look for Xero quote ID in custom fields using the API key
          const xeroQuoteFieldKey = '0e9dc89b14fb67546540fd3e11a7fe06653d708f';
          console.log('Deal custom fields:', JSON.stringify(fullDeal.custom_fields || {}, null, 2));
          
          // Extract Xero quote ID from custom fields using the field key
          const xeroQuoteId = fullDeal.custom_fields?.[xeroQuoteFieldKey] || null;
          dealData.xeroQuoteId = xeroQuoteId;
          
          if (!xeroQuoteId) {
            validationIssues.push('Missing Xero quote ID');
          } else {
            console.log(`Found Xero quote ID: ${xeroQuoteId}`);
            
            // Step 2: Get Xero quote details
            try {
              // Get the access token from ensureValidToken
              const { access_token } = await ensureValidToken();
              
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
                  
                  // Check if quote is accepted
                  if (xeroQuote.Status !== 'ACCEPTED') {
                    validationIssues.push(`Xero quote not accepted (status: ${xeroQuote.Status})`);
                  }
                  
                  // Check currency match
                  if (xeroQuote.CurrencyCode && deal.currency && xeroQuote.CurrencyCode !== deal.currency) {
                    validationIssues.push(`Currency mismatch (Pipedrive: ${deal.currency}, Xero: ${xeroQuote.CurrencyCode})`);
                  }
                  
                  // Log for debugging
                  console.log(`Deal "${deal.title}" - Quote Title: "${xeroQuote.Title || 'N/A'}"`);
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
        
        // Step 3: Get deal products
        try {
          const productsUrl = `https://api.pipedrive.com/v1/deals/${deal.id}/products?api_token=${apiKey}`;
          const productsResponse = await fetch(productsUrl);
          
          if (!productsResponse.ok) {
            validationIssues.push('Failed to fetch deal products');
          } else {
            const productsData = await productsResponse.json();
            const dealProducts = productsData.data || [];
            dealData.productsCount = dealProducts.length;
            
            // Calculate total value from products
            dealData.productsTotal = dealProducts.reduce((sum: number, product: any) => {
              return sum + (product.quantity * product.item_price);
            }, 0);
            
            console.log(`Found ${dealProducts.length} products, total: ${dealData.productsTotal}`);
            
            // Compare with Xero quote total if available
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
      
      // Set final validation status
      dealData.validationIssues = validationIssues;
      dealData.isFullySynced = validationIssues.length === 0;
      
      validatedDeals.push(dealData);
    }
    
    console.log(`\nValidation complete: ${validatedDeals.length} valid deals out of ${wonDeals.length} total`);
    
    // Process deals and generate matching keys
    const processedDeals = validatedDeals;
    
    // Log all processed deals to server console
    console.log('\n=== PROCESSED DEALS ===');
    processedDeals.forEach((deal: any, index: number) => {
      console.log(`${index + 1}. "${deal.title}"`);
      console.log(`   Key: ${deal.matchingKey}`);
      console.log(`   Value: ${deal.value} ${deal.currency}`);
      console.log(`   Xero Quote ID: ${deal.xeroQuoteId || 'MISSING'}`);
      console.log(`   Xero Quote Status: ${deal.xeroQuoteStatus || 'N/A'}`);
      console.log(`   Products: ${deal.productsCount} items, Total: ${deal.productsTotal}`);
      console.log(`   Sync Status: ${deal.isFullySynced ? '✅ FULLY SYNCED' : '❌ ISSUES FOUND'}`);
      if (deal.validationIssues.length > 0) {
        console.log(`   Issues:`);
        deal.validationIssues.forEach((issue: string) => {
          console.log(`     - ${issue}`);
        });
      }
      console.log('');
    });
    
    // Group by job code prefix
    const groupedByPrefix: { [key: string]: number } = {};
    processedDeals.forEach((deal: any) => {
      const prefix = deal.matchingKey.match(/^([a-z]+)/)?.[1] || 'other';
      groupedByPrefix[prefix] = (groupedByPrefix[prefix] || 0) + 1;
    });
    
    console.log('\nDeals grouped by prefix:');
    Object.entries(groupedByPrefix).forEach(([prefix, count]) => {
      console.log(`  ${prefix.toUpperCase()}: ${count} deals`);
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
    
    console.log('\n=== VALIDATION SUMMARY ===');
    console.log(`Total Won Deals: ${validationStats.totalWonDeals}`);
    console.log(`Fully Synced: ${validationStats.fullySynced} ✅`);
    console.log(`With Issues: ${validationStats.withIssues} ❌`);
    console.log(`  - Missing Xero Quote: ${validationStats.missingXeroQuote}`);
    console.log(`  - Invalid Xero Quote: ${validationStats.invalidXeroQuote}`);
    console.log(`  - Quote Not Accepted: ${validationStats.notAcceptedQuotes}`);
    console.log(`  - Value Mismatches: ${validationStats.valueMismatches}`);
    
    return NextResponse.json({
      success: true,
      tenantId: effective_tenant_id,
      tenantName: 'BSENI',
      totalDeals: processedDeals.length,
      validationStats,
      groupedByPrefix,
      deals: processedDeals
    });
    
  } catch (error) {
    console.error('Error in simple sync test:', error);
    return NextResponse.json({ 
      error: (error as Error).message 
    }, { status: 500 });
  }
}