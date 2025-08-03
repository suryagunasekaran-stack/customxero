/**
 * Test script to debug deal 558 validation via API routes
 */

async function testDealValidation() {
  const tenantId = '6dd39ea4-e6a6-4993-a37a-21482ccf8d22';
  const dealId = 558;
  const customFieldId = '0e9dc89b14fb67546540fd3e11a7fe06653d708f';
  const expectedXeroQuoteId = 'f1decff3-ab05-4c0b-a1b6-e419b9c70161';
  
  console.log('=== Testing Deal 558 Validation via API ===');
  console.log(`Tenant: ${tenantId}`);
  console.log(`Deal ID: ${dealId}`);
  console.log(`Custom Field ID: ${customFieldId}`);
  console.log(`Expected Xero Quote ID: ${expectedXeroQuoteId}`);
  console.log('');
  
  try {
    // Step 1: Check if the Xero quote exists via API
    console.log('Step 1: Fetching Xero quote via API...');
    
    const quoteResponse = await fetch(`http://localhost:3000/api/xero/quotes/${expectedXeroQuoteId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': tenantId
      }
    });
    
    if (quoteResponse.ok) {
      const quoteData = await quoteResponse.json();
      console.log('✓ Quote found in Xero:');
      console.log(`  - Quote ID: ${quoteData.quote?.QuoteID}`);
      console.log(`  - Quote Number: ${quoteData.quote?.QuoteNumber}`);
      console.log(`  - Status: ${quoteData.quote?.Status}`);
      console.log(`  - Reference: ${quoteData.quote?.Reference}`);
      console.log(`  - Total: ${quoteData.quote?.Total}`);
      
      // Check if reference matches
      const expectedReference = `Pipedrive Deal ID: ${dealId}`;
      if (quoteData.quote?.Reference === expectedReference) {
        console.log(`  ✓ Reference matches expected: "${expectedReference}"`);
      } else {
        console.log(`  ✗ Reference mismatch!`);
        console.log(`    Expected: "${expectedReference}"`);
        console.log(`    Actual: "${quoteData.quote?.Reference}"`);
      }
    } else if (quoteResponse.status === 404) {
      console.log(`✗ Quote ${expectedXeroQuoteId} NOT found in Xero (404)`);
    } else {
      console.log(`✗ Failed to fetch quote: ${quoteResponse.status}`);
      const error = await quoteResponse.text();
      console.log(`  Error: ${error}`);
    }
    
    // Step 2: Run validation for this specific deal
    console.log('');
    console.log('Step 2: Running validation check...');
    
    const validationResponse = await fetch('http://localhost:3000/api/pipedrive/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tenantId,
        dealId // Optional: filter to specific deal
      })
    });
    
    if (validationResponse.ok) {
      const validationData = await validationResponse.json();
      
      // Find deal 558 in results
      const deal558 = validationData.validationResults?.deals?.find((d: any) => d.id === dealId);
      
      if (deal558) {
        console.log('✓ Deal 558 found in validation results:');
        console.log(`  - Title: ${deal558.title}`);
        console.log(`  - Xero Quote ID: ${deal558.xeroQuoteId}`);
        console.log(`  - Has matched quote: ${!!deal558.matchedQuote}`);
        console.log(`  - Validation issues: ${deal558.validationIssues?.length || 0}`);
        
        if (deal558.validationIssues?.length > 0) {
          console.log('  Issues:');
          deal558.validationIssues.forEach((issue: any) => {
            console.log(`    - [${issue.severity}] ${issue.code}: ${issue.message}`);
          });
        }
        
        if (deal558.matchedQuote) {
          console.log('  Matched Quote:');
          console.log(`    - Quote ID: ${deal558.matchedQuote.QuoteID}`);
          console.log(`    - Quote Number: ${deal558.matchedQuote.QuoteNumber}`);
        }
      } else {
        console.log('✗ Deal 558 not found in validation results');
      }
      
      // Check quote matching statistics
      const summary = validationData.validationResults?.summary;
      if (summary) {
        console.log('');
        console.log('Validation Summary:');
        console.log(`  - Total deals: ${summary.totalDeals}`);
        console.log(`  - Total quotes: ${summary.totalQuotes}`);
        console.log(`  - Matched deals to quotes: ${summary.matchedDealsToQuotes}`);
        console.log(`  - Unmatched deals: ${summary.unmatchedDeals}`);
      }
    } else {
      console.log(`✗ Validation request failed: ${validationResponse.status}`);
      const error = await validationResponse.text();
      console.log(`  Error: ${error}`);
    }
    
  } catch (error) {
    console.error('Error during test:', error);
  }
}

// Run the test
testDealValidation().catch(console.error);