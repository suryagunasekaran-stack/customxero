/**
 * Test script to debug Pipedrive deal 558 validation
 * 
 * Tenant: 6dd39ea4-e6a6-4993-a37a-21482ccf8d22
 * Deal ID: 558
 * Custom Field ID: 0e9dc89b14fb67546540fd3e11a7fe06653d708f
 * Expected Xero Quote ID: f1decff3-ab05-4c0b-a1b6-e419b9c70161
 */

import { logger } from '@/lib/logger';

async function testDealValidation() {
  const tenantId = '6dd39ea4-e6a6-4993-a37a-21482ccf8d22';
  const dealId = 558;
  const customFieldId = '0e9dc89b14fb67546540fd3e11a7fe06653d708f';
  const expectedXeroQuoteId = 'f1decff3-ab05-4c0b-a1b6-e419b9c70161';
  
  console.log('=== Testing Deal 558 Validation ===');
  console.log(`Tenant: ${tenantId}`);
  console.log(`Deal ID: ${dealId}`);
  console.log(`Custom Field ID: ${customFieldId}`);
  console.log(`Expected Xero Quote ID: ${expectedXeroQuoteId}`);
  console.log('');
  
  try {
    // Step 1: Fetch the specific deal from Pipedrive
    console.log('Step 1: Fetching deal from Pipedrive...');
    
    const apiKey = process.env.PIPEDRIVE_KEY_TENANT1 || process.env.PIPEDRIVE_KEY || 'a8b760a714bed5f212c1bd13d0ed3bcb2859d001';
    const domain = 'api';
    
    // Fetch using v2 API to get custom_fields
    const dealUrl = `https://${domain}.pipedrive.com/api/v2/deals/${dealId}?api_token=${apiKey}`;
    
    const dealResponse = await fetch(dealUrl);
    if (!dealResponse.ok) {
      throw new Error(`Failed to fetch deal: ${dealResponse.status} ${dealResponse.statusText}`);
    }
    
    const dealData = await dealResponse.json();
    const deal = dealData.data;
    
    console.log('Deal fetched successfully:');
    console.log(`- Title: ${deal.title || deal.name}`);
    console.log(`- Status: ${deal.status}`);
    console.log(`- Pipeline ID: ${deal.pipeline_id}`);
    console.log(`- Value: ${deal.value}`);
    console.log('');
    
    // Step 2: Check custom fields
    console.log('Step 2: Checking custom fields...');
    
    // Check if custom_fields object exists
    if (deal.custom_fields) {
      console.log('custom_fields object found');
      console.log(`Number of custom fields: ${Object.keys(deal.custom_fields).length}`);
      
      // Check if our field exists
      if (customFieldId in deal.custom_fields) {
        const fieldValue = deal.custom_fields[customFieldId];
        console.log(`✓ Field ${customFieldId} found in custom_fields`);
        console.log(`  Value: "${fieldValue}"`);
        console.log(`  Type: ${typeof fieldValue}`);
        console.log(`  Matches expected: ${fieldValue === expectedXeroQuoteId}`);
      } else {
        console.log(`✗ Field ${customFieldId} NOT found in custom_fields`);
        console.log('Available custom field keys:');
        Object.keys(deal.custom_fields).forEach(key => {
          console.log(`  - ${key}: ${deal.custom_fields[key]}`);
        });
      }
    } else {
      console.log('No custom_fields object found');
    }
    
    // Also check top-level (v1 API style)
    console.log('');
    console.log('Checking top-level fields (v1 style)...');
    if (customFieldId in deal) {
      const fieldValue = deal[customFieldId];
      console.log(`✓ Field ${customFieldId} found at top level`);
      console.log(`  Value: "${fieldValue}"`);
      console.log(`  Type: ${typeof fieldValue}`);
      console.log(`  Matches expected: ${fieldValue === expectedXeroQuoteId}`);
    } else {
      console.log(`✗ Field ${customFieldId} NOT found at top level`);
      
      // Show all fields that look like custom fields (40-char hex)
      const customFieldPattern = /^[a-f0-9]{40}$/;
      const topLevelCustomFields = Object.keys(deal).filter(key => customFieldPattern.test(key));
      if (topLevelCustomFields.length > 0) {
        console.log('Top-level custom field keys found:');
        topLevelCustomFields.forEach(key => {
          console.log(`  - ${key}: ${deal[key]}`);
        });
      }
    }
    
    // Step 3: Try v1 API as well
    console.log('');
    console.log('Step 3: Trying v1 API for comparison...');
    
    const dealUrlV1 = `https://${domain}.pipedrive.com/api/v1/deals/${dealId}?api_token=${apiKey}`;
    
    const dealResponseV1 = await fetch(dealUrlV1);
    if (dealResponseV1.ok) {
      const dealDataV1 = await dealResponseV1.json();
      const dealV1 = dealDataV1.data;
      
      console.log('v1 API Response:');
      if (customFieldId in dealV1) {
        const fieldValue = dealV1[customFieldId];
        console.log(`✓ Field ${customFieldId} found in v1 response`);
        console.log(`  Value: "${fieldValue}"`);
        console.log(`  Type: ${typeof fieldValue}`);
        console.log(`  Matches expected: ${fieldValue === expectedXeroQuoteId}`);
      } else {
        console.log(`✗ Field ${customFieldId} NOT found in v1 response`);
      }
    }
    
    // Step 4: Fetch Xero quote to verify it exists
    console.log('');
    console.log('Step 4: Checking if Xero quote exists...');
    
    // Import and use ensureValidToken
    const { ensureValidToken } = await import('@/lib/ensureXeroToken');
    const { access_token } = await ensureValidToken();
    
    const quoteUrl = `https://api.xero.com/api.xro/2.0/Quotes/${expectedXeroQuoteId}`;
    
    const quoteResponse = await fetch(quoteUrl, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${access_token}`,
        'xero-tenant-id': tenantId
      }
    });
    
    if (quoteResponse.ok) {
      const quoteData = await quoteResponse.json();
      const quote = quoteData.Quotes?.[0];
      if (quote) {
        console.log(`✓ Xero quote ${expectedXeroQuoteId} found`);
        console.log(`  Quote Number: ${quote.QuoteNumber}`);
        console.log(`  Status: ${quote.Status}`);
        console.log(`  Reference: ${quote.Reference}`);
        console.log(`  Total: ${quote.Total}`);
        
        // Check if reference matches
        const expectedReference = `Pipedrive Deal ID: ${dealId}`;
        if (quote.Reference === expectedReference) {
          console.log(`  ✓ Reference matches expected: "${expectedReference}"`);
        } else {
          console.log(`  ✗ Reference mismatch!`);
          console.log(`    Expected: "${expectedReference}"`);
          console.log(`    Actual: "${quote.Reference}"`);
        }
      }
    } else if (quoteResponse.status === 404) {
      console.log(`✗ Xero quote ${expectedXeroQuoteId} NOT found (404)`);
    } else {
      console.log(`✗ Failed to fetch Xero quote: ${quoteResponse.status}`);
    }
    
    // Summary
    console.log('');
    console.log('=== SUMMARY ===');
    
    const xeroQuoteIdValue = deal.custom_fields?.[customFieldId] || deal[customFieldId];
    
    if (xeroQuoteIdValue) {
      console.log(`✓ Xero Quote ID field found with value: "${xeroQuoteIdValue}"`);
      if (xeroQuoteIdValue === expectedXeroQuoteId) {
        console.log('✓ Value matches expected Xero Quote ID');
        console.log('→ Validation should work correctly');
      } else {
        console.log('✗ Value does NOT match expected Xero Quote ID');
        console.log(`  Expected: "${expectedXeroQuoteId}"`);
        console.log(`  Actual: "${xeroQuoteIdValue}"`);
        console.log('→ This is why validation is failing!');
      }
    } else {
      console.log('✗ Xero Quote ID field not found in deal');
      console.log('→ Need to check field mapping or data entry');
    }
    
  } catch (error) {
    console.error('Error during test:', error);
  }
}

// Run the test
testDealValidation().catch(console.error);