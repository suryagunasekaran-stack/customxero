import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { XeroQuoteService } from '@/lib/services/xeroQuoteService';
import { crossReferenceQuotes } from '@/lib/validation/pipedriveValidationRules';

export async function GET() {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    
    const tenantId = '6dd39ea4-e6a6-4993-a37a-21482ccf8d22';
    const dealId = 558;
    const customFieldId = '0e9dc89b14fb67546540fd3e11a7fe06653d708f';
    
    console.log('=== Test Validation for Deal 558 ===');
    
    // Step 1: Fetch deal from Pipedrive
    const apiKey = process.env.PIPEDRIVE_KEY_TENANT1 || 'a8b760a714bed5f212c1bd13d0ed3bcb2859d001';
    const domain = 'api';
    
    const dealUrl = `https://${domain}.pipedrive.com/api/v2/deals/${dealId}?api_token=${apiKey}`;
    const dealResponse = await fetch(dealUrl);
    const dealData = await dealResponse.json();
    const deal = dealData.data;
    
    console.log('Deal 558:', {
      title: deal.title,
      status: deal.status,
      value: deal.value,
      customFieldValue: deal.custom_fields?.[customFieldId]
    });
    
    // Step 2: Fetch quotes from Xero
    console.log('Fetching Xero quotes...');
    const quotes = await XeroQuoteService.fetchAllQuotes(tenantId);
    console.log(`Fetched ${quotes.length} quotes from Xero`);
    
    // Find the specific quote
    const targetQuote = quotes.find(q => q.QuoteID === 'f1decff3-ab05-4c0b-a1b6-e419b9c70161');
    console.log('Target quote found:', !!targetQuote);
    
    // Step 3: Run validation
    const context = {
      pipedriveDeals: [deal],
      xeroQuotes: quotes,
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
    
    console.log('Running validation...');
    const validationResults = crossReferenceQuotes(context);
    
    // Find result for deal 558 (skip debug entry)
    const deal558Result = validationResults.find(r => r.dealId === dealId);
    
    console.log('Validation result for deal 558:', {
      dealId: deal558Result?.dealId,
      hasQuote: deal558Result?.hasQuote,
      xeroQuoteId: deal558Result?.xeroQuoteId,
      quoteNumber: deal558Result?.quoteNumber,
      issues: deal558Result?.issues
    });
    
    // Additional debugging
    const debugInfo = {
      deal: {
        id: deal.id,
        title: deal.title,
        status: deal.status,
        value: deal.value,
        hasCustomFields: !!deal.custom_fields,
        customFieldCount: Object.keys(deal.custom_fields || {}).length,
        xeroQuoteIdField: {
          fieldId: customFieldId,
          valueInCustomFields: deal.custom_fields?.[customFieldId],
          valueAtTopLevel: deal[customFieldId],
          extractedValue: deal.custom_fields?.[customFieldId] || deal[customFieldId]
        }
      },
      xeroQuote: targetQuote ? {
        QuoteID: targetQuote.QuoteID,
        QuoteNumber: targetQuote.QuoteNumber,
        Status: targetQuote.Status,
        Reference: targetQuote.Reference,
        Total: targetQuote.Total
      } : null,
      validation: deal558Result ? {
        dealId: deal558Result.dealId,
        dealTitle: deal558Result.dealTitle,
        hasQuote: deal558Result.hasQuote,
        xeroQuoteId: deal558Result.xeroQuoteId,
        quoteNumber: deal558Result.quoteNumber,
        quoteStatus: deal558Result.quoteStatus,
        issueCount: deal558Result.issues.length,
        issues: deal558Result.issues
      } : null,
      matchTest: {
        dealQuoteIdValue: deal.custom_fields?.[customFieldId] || deal[customFieldId],
        targetQuoteId: 'f1decff3-ab05-4c0b-a1b6-e419b9c70161',
        valuesMatch: (deal.custom_fields?.[customFieldId] || deal[customFieldId]) === 'f1decff3-ab05-4c0b-a1b6-e419b9c70161',
        quoteExists: !!targetQuote,
        quoteFoundInList: quotes.some(q => q.QuoteID === 'f1decff3-ab05-4c0b-a1b6-e419b9c70161')
      }
    };
    
    return NextResponse.json({
      success: true,
      summary: {
        dealHasCorrectQuoteId: debugInfo.matchTest.valuesMatch,
        quoteExistsInXero: debugInfo.matchTest.quoteExists,
        validationPassed: deal558Result?.hasQuote || false,
        issuesFound: deal558Result?.issues.length || 0
      },
      debugInfo
    });
    
  } catch (error) {
    console.error('Test validation error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Test failed' 
    }, { status: 500 });
  }
}