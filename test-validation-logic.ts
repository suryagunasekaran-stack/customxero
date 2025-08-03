/**
 * Direct test of validation logic for deal 558
 */

import { crossReferenceQuotes } from './lib/validation/pipedriveValidationRules';
import { XeroQuoteService } from './lib/services/xeroQuoteService';

async function testValidationLogic() {
  const tenantId = '6dd39ea4-e6a6-4993-a37a-21482ccf8d22';
  const dealId = 558;
  const customFieldId = '0e9dc89b14fb67546540fd3e11a7fe06653d708f';
  const expectedXeroQuoteId = 'f1decff3-ab05-4c0b-a1b6-e419b9c70161';
  
  console.log('=== Testing Validation Logic for Deal 558 ===\n');
  
  // Fetch deal from Pipedrive
  const apiKey = process.env.PIPEDRIVE_KEY_TENANT1 || 'a8b760a714bed5f212c1bd13d0ed3bcb2859d001';
  const domain = 'api';
  
  // Use v2 API to get custom_fields
  const dealUrl = `https://${domain}.pipedrive.com/api/v2/deals/${dealId}?api_token=${apiKey}`;
  const dealResponse = await fetch(dealUrl);
  const dealData = await dealResponse.json();
  const deal = dealData.data;
  
  console.log('Deal 558:');
  console.log(`- Title: ${deal.title || deal.name}`);
  console.log(`- Status: ${deal.status}`);
  console.log(`- Value: ${deal.value}`);
  console.log(`- Custom field ${customFieldId}: "${deal.custom_fields?.[customFieldId]}"`);
  console.log('');
  
  // Create mock data for validation
  const mockDeals = [deal];
  
  // Create mock quotes - include the expected quote
  const mockQuotes = [
    {
      QuoteID: expectedXeroQuoteId,
      QuoteNumber: 'QU-0123',
      Status: 'ACCEPTED',
      Reference: `Pipedrive Deal ID: ${dealId}`,
      Total: deal.value || 31550
    },
    // Add a few more mock quotes
    {
      QuoteID: 'other-quote-1',
      QuoteNumber: 'QU-0124',
      Status: 'DRAFT',
      Reference: 'Some other deal',
      Total: 10000
    }
  ];
  
  // Create validation context
  const context = {
    pipedriveDeals: mockDeals,
    xeroQuotes: mockQuotes,
    xeroProjects: [],
    tenantConfig: {
      tenantId,
      pipedriveApiKey: apiKey,
      companyDomain: domain,
      pipelineIds: [2],
      customFieldKeys: {
        xeroQuoteId: customFieldId,
        invoiceId: 'c599cab3902b6c84c1f9e2689f308a4369fffe7d',
        vesselName: 'bef5a8a5866aec2d7f4db2a5d8964ab04a4dc93d'
      },
      enabled: true
    }
  };
  
  console.log('Running crossReferenceQuotes validation...\n');
  
  // Run validation
  const results = crossReferenceQuotes(context);
  
  // Find result for deal 558
  const deal558Result = results.find(r => r.dealId === dealId);
  
  if (deal558Result) {
    console.log('Validation result for deal 558:');
    console.log(`- Deal ID: ${deal558Result.dealId}`);
    console.log(`- Deal Title: ${deal558Result.dealTitle}`);
    console.log(`- Xero Quote ID: ${deal558Result.xeroQuoteId}`);
    console.log(`- Has Quote: ${deal558Result.hasQuote}`);
    console.log(`- Quote Number: ${deal558Result.quoteNumber}`);
    console.log(`- Quote Status: ${deal558Result.quoteStatus}`);
    console.log(`- Issues: ${deal558Result.issues.length}`);
    
    if (deal558Result.issues.length > 0) {
      console.log('\nValidation issues:');
      deal558Result.issues.forEach(issue => {
        console.log(`  [${issue.severity}] ${issue.code}: ${issue.message}`);
        if (issue.metadata) {
          console.log(`    Metadata:`, issue.metadata);
        }
      });
    }
    
    if (deal558Result.hasQuote) {
      console.log('\n✓ SUCCESS: Deal 558 correctly matched to quote!');
    } else {
      console.log('\n✗ FAILURE: Deal 558 did not match to quote');
      console.log('Debugging info:');
      console.log(`- Field value extracted: "${deal.custom_fields?.[customFieldId] || deal[customFieldId]}"`);
      console.log(`- Expected quote ID: "${expectedXeroQuoteId}"`);
      console.log(`- Available quotes:`, mockQuotes.map(q => q.QuoteID));
    }
  } else {
    console.log('✗ Deal 558 not found in validation results');
  }
  
  // Show debug info entry if present
  const debugInfo = results.find(r => r.dealId === 0);
  if (debugInfo) {
    console.log('\nDebug info from validation:');
    debugInfo.issues.forEach(issue => {
      if (issue.code === 'DEBUG_FIELD_INFO') {
        console.log(issue.message);
        if (issue.metadata) {
          console.log('Metadata:', JSON.stringify(issue.metadata, null, 2));
        }
      }
    });
  }
}

testValidationLogic().catch(console.error);