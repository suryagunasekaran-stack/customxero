/**
 * Test to fetch Xero quotes using the server's authenticated session
 * This will use the existing login session from the main app
 */

async function testXeroQuoteFetch() {
  const tenantId = '6dd39ea4-e6a6-4993-a37a-21482ccf8d22';
  const targetQuoteId = 'f1decff3-ab05-4c0b-a1b6-e419b9c70161';
  
  console.log('=== Testing Xero Quote Fetch via Server ===');
  console.log(`Tenant: ${tenantId}`);
  console.log(`Looking for Quote ID: ${targetQuoteId}`);
  console.log('');
  
  try {
    // First, let's create a simple API endpoint to fetch all quotes
    console.log('Creating API endpoint to fetch quotes...');
    
    // We'll call the validate-deals endpoint and parse the SSE stream
    console.log('Calling validation endpoint to fetch quotes...\n');
    
    const response = await fetch('http://localhost:3000/api/xero/validate-deals', {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        // Include cookies from your browser session
        'Cookie': process.env.SESSION_COOKIE || ''
      },
      credentials: 'include'
    });
    
    if (!response.ok) {
      console.log(`Failed to call validation endpoint: ${response.status}`);
      console.log('Note: You need to be logged in to the main app at http://localhost:3000');
      console.log('');
      console.log('Alternative: Let\'s create a test endpoint that uses the server session...');
      return;
    }
    
    // Parse SSE stream
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    
    if (reader) {
      let buffer = '';
      let foundQuotes = false;
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              // Look for the fetch_xero_quotes step
              if (data.type === 'progress' && data.step?.id === 'fetch_xero_quotes') {
                console.log(`Step: ${data.step.name}`);
                console.log(`Status: ${data.step.status}`);
                
                if (data.step.result) {
                  console.log(`Result: ${JSON.stringify(data.step.result, null, 2)}`);
                }
              }
              
              // Look for completion with results
              if (data.type === 'complete' && data.data?.results) {
                const results = data.data.results;
                foundQuotes = true;
                
                console.log('\n=== Validation Results ===');
                console.log(`Total Quotes fetched: ${results.summary?.totalQuotes || 0}`);
                
                // Check if our target quote exists
                const targetQuote = results.quotes?.find((q: any) => q.QuoteID === targetQuoteId);
                
                if (targetQuote) {
                  console.log(`\n✓ Found target quote ${targetQuoteId}!`);
                  console.log(`  Quote Number: ${targetQuote.QuoteNumber}`);
                  console.log(`  Status: ${targetQuote.Status}`);
                  console.log(`  Total: ${targetQuote.Total}`);
                  console.log(`  Matched Deal ID: ${targetQuote.matchedDealId || 'none'}`);
                } else {
                  console.log(`\n✗ Target quote ${targetQuoteId} NOT found in Xero`);
                  
                  // Show sample of quotes that were found
                  if (results.quotes && results.quotes.length > 0) {
                    console.log('\nSample of quotes found:');
                    results.quotes.slice(0, 5).forEach((q: any) => {
                      console.log(`  - ${q.QuoteID} (${q.QuoteNumber}) - Status: ${q.Status}`);
                    });
                  }
                }
                
                // Check deal 558 validation
                const deal558 = results.deals?.find((d: any) => d.id === 558);
                if (deal558) {
                  console.log('\n=== Deal 558 Validation ===');
                  console.log(`Title: ${deal558.title}`);
                  console.log(`Xero Quote ID field: ${deal558.xeroQuoteId}`);
                  console.log(`Has matched quote: ${!!deal558.matchedQuote}`);
                  console.log(`Validation issues: ${deal558.validationIssues?.length || 0}`);
                  
                  if (deal558.validationIssues?.length > 0) {
                    console.log('\nIssues:');
                    deal558.validationIssues.forEach((issue: any) => {
                      console.log(`  [${issue.severity}] ${issue.code}: ${issue.message}`);
                    });
                  }
                }
              }
            } catch (e) {
              // Ignore parsing errors for incomplete JSON
            }
          }
        }
      }
      
      if (!foundQuotes) {
        console.log('No quotes data found in response. The validation may have failed.');
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
    console.log('\nNote: Make sure you are logged in to the app at http://localhost:3000');
  }
}

// Alternative: Create a simple test endpoint
async function createTestEndpoint() {
  console.log('\n=== Alternative: Creating test endpoint ===');
  
  const testEndpointCode = `
// Add this to a new file: app/api/test-quotes/route.ts

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
    
    // Fetch all quotes
    const quotes = await XeroQuoteService.fetchAllQuotes(tenantId);
    
    // Find target quote
    const targetQuote = quotes.find(q => q.QuoteID === targetQuoteId);
    
    return NextResponse.json({
      success: true,
      totalQuotes: quotes.length,
      hasTargetQuote: !!targetQuote,
      targetQuote: targetQuote || null,
      sampleQuotes: quotes.slice(0, 5).map(q => ({
        QuoteID: q.QuoteID,
        QuoteNumber: q.QuoteNumber,
        Status: q.Status,
        Reference: q.Reference
      }))
    });
  } catch (error) {
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to fetch quotes' 
    }, { status: 500 });
  }
}
`;

  console.log('Create this endpoint and then access it at:');
  console.log('http://localhost:3000/api/test-quotes');
  console.log('\nEndpoint code:');
  console.log(testEndpointCode);
}

// Run the test
console.log('Attempting to use existing validation endpoint...\n');
testXeroQuoteFetch().then(() => {
  console.log('\n---\n');
  createTestEndpoint();
}).catch(console.error);