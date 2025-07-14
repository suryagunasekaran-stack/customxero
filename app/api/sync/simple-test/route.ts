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
    
    // Process deals and generate matching keys
    const processedDeals = wonDeals.map((deal: any) => {
      const matchingKey = generateMatchingKey(deal.title);
      return {
        id: deal.id,
        title: deal.title,
        matchingKey: matchingKey,
        value: deal.value,
        currency: deal.currency,
        org_name: deal.org_name,
        pipeline_id: deal.pipeline_id,
        stage_id: deal.stage_id,
        won_time: deal.won_time
      };
    });
    
    // Log all processed deals to server console
    console.log('\n=== PROCESSED DEALS ===');
    processedDeals.forEach((deal: any, index: number) => {
      console.log(`${index + 1}. "${deal.title}"`);
      console.log(`   Key: ${deal.matchingKey}`);
      console.log(`   Value: ${deal.value} ${deal.currency}`);
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
    
    return NextResponse.json({
      success: true,
      tenantId: effective_tenant_id,
      tenantName: 'BSENI',
      totalDeals: processedDeals.length,
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