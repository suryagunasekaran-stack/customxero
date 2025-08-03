/**
 * Simplified test to check deal 558 field values
 */

async function testDealField() {
  const tenantId = '6dd39ea4-e6a6-4993-a37a-21482ccf8d22';
  const dealId = 558;
  const customFieldId = '0e9dc89b14fb67546540fd3e11a7fe06653d708f';
  const expectedXeroQuoteId = 'f1decff3-ab05-4c0b-a1b6-e419b9c70161';
  
  console.log('=== Testing Deal 558 Field Values ===');
  console.log(`Tenant: ${tenantId}`);
  console.log(`Deal ID: ${dealId}`);
  console.log(`Custom Field ID: ${customFieldId}`);
  console.log(`Expected Xero Quote ID: ${expectedXeroQuoteId}`);
  console.log('');
  
  const apiKey = process.env.PIPEDRIVE_KEY_TENANT1 || 'a8b760a714bed5f212c1bd13d0ed3bcb2859d001';
  const domain = 'api';
  
  // Test both v1 and v2 APIs
  console.log('Testing v2 API:');
  const v2Url = `https://${domain}.pipedrive.com/api/v2/deals/${dealId}?api_token=${apiKey}`;
  const v2Response = await fetch(v2Url);
  const v2Data = await v2Response.json();
  const v2Deal = v2Data.data;
  
  console.log(`- custom_fields.${customFieldId}: "${v2Deal.custom_fields?.[customFieldId]}"`);
  console.log(`- Top-level ${customFieldId}: "${v2Deal[customFieldId]}"`);
  console.log(`- Title: ${v2Deal.title || v2Deal.name}`);
  console.log('');
  
  console.log('Testing v1 API:');
  const v1Url = `https://${domain}.pipedrive.com/api/v1/deals/${dealId}?api_token=${apiKey}`;
  const v1Response = await fetch(v1Url);
  const v1Data = await v1Response.json();
  const v1Deal = v1Data.data;
  
  console.log(`- Top-level ${customFieldId}: "${v1Deal[customFieldId]}"`);
  console.log(`- Title: ${v1Deal.title || v1Deal.name}`);
  console.log('');
  
  // Check value extraction logic
  console.log('Value extraction test (mimics validation logic):');
  const extractedValue = v2Deal.custom_fields?.[customFieldId] || v2Deal[customFieldId];
  console.log(`- Extracted value: "${extractedValue}"`);
  console.log(`- Matches expected: ${extractedValue === expectedXeroQuoteId}`);
  
  if (extractedValue === expectedXeroQuoteId) {
    console.log('✓ Deal 558 has the correct Xero Quote ID value!');
    console.log('The validation logic should be finding this quote.');
  } else {
    console.log('✗ Deal 558 does not have the expected value.');
  }
}

testDealField().catch(console.error);