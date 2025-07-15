import { ValidationIssue } from './dealValidationRules';

export interface XeroQuote {
  QuoteID: string;
  QuoteNumber: string;
  Reference?: string;
  Status: string;
  Total: number;
  CurrencyCode: string;
  Contact?: {
    ContactID: string;
    Name: string;
  };
}

export interface QuoteValidationContext {
  xeroQuotes: XeroQuote[];
  pipedriveDeals: any[];
  tenantId: string;
}

export interface QuoteValidationResult {
  quoteId: string;
  quoteNumber: string;
  status: string;
  total: number;
  currency: string;
  reference?: string;
  associatedDealId?: string;
  validationIssues: ValidationIssue[];
}

export interface Phase2ValidationStats {
  totalAcceptedQuotes: number;
  totalAcceptedQuotesValue: number;
  totalWonDeals: number;
  totalWonDealsValue: number;
  quotesWithDeals: number;
  orphanedQuotes: number;
  dealsWithoutQuotes: number;
  valueMismatch: boolean;
  valueDifference: number;
  // Detailed breakdown
  valueBreakdown?: {
    orphanedQuotesValue: number;
    duplicateQuotesValue: number;
    matchedQuotesValue: number;
    dealsWithQuotesValue: number;
    dealsWithoutQuotesValue: number;
    quotesWithValueMismatch: number;
    totalValueMismatchAmount: number;
  };
}

/**
 * Extract Pipedrive Deal ID from Xero Quote Reference
 */
function extractDealIdFromReference(reference?: string): string | null {
  if (!reference) return null;
  
  // Match patterns like "Pipedrive Deal Id: 201", "Pipedrive Deal ID: 474", or "Pipedrive Deal Id:252" (without space)
  const match = reference.match(/Pipedrive Deal I[Dd]:\s*(\d+)/);
  return match ? match[1] : null;
}

/**
 * Validate individual Xero quote
 */
export function validateQuote(quote: XeroQuote, deals: any[]): QuoteValidationResult {
  const issues: ValidationIssue[] = [];
  const dealId = extractDealIdFromReference(quote.Reference);
  
  const result: QuoteValidationResult = {
    quoteId: quote.QuoteID,
    quoteNumber: quote.QuoteNumber,
    status: quote.Status,
    total: quote.Total,
    currency: quote.CurrencyCode,
    reference: quote.Reference,
    associatedDealId: dealId || undefined,
    validationIssues: issues
  };
  
  // Check if quote is accepted
  if (quote.Status !== 'ACCEPTED' && quote.Status !== 'INVOICED') {
    issues.push({
      code: 'QUOTE_NOT_ACCEPTED',
      severity: 'info',
      message: `Quote is in ${quote.Status} status, not ACCEPTED`,
      field: 'status',
      currentValue: quote.Status,
      expectedValue: 'ACCEPTED',
      fixable: false
    });
    return result;
  }
  
  // Check if quote has deal reference
  if (!dealId) {
    issues.push({
      code: 'QUOTE_NO_DEAL_REFERENCE',
      severity: 'error',
      message: 'Accepted quote has no Pipedrive deal reference',
      field: 'reference',
      currentValue: quote.Reference || 'None',
      fixable: false
    });
    return result;
  }
  
  // Find associated deal
  const associatedDeal = deals.find(d => d.id.toString() === dealId);
  
  if (!associatedDeal) {
    issues.push({
      code: 'QUOTE_ORPHANED',
      severity: 'error',
      message: `No matching Pipedrive deal found for ID: ${dealId}`,
      field: 'reference',
      currentValue: dealId,
      fixable: false
    });
    return result;
  }
  
  // Check if deal is won
  if (associatedDeal.status !== 'won') {
    issues.push({
      code: 'QUOTE_DEAL_NOT_WON',
      severity: 'warning',
      message: `Associated deal ${dealId} is not in won status`,
      field: 'dealStatus',
      currentValue: associatedDeal.status,
      expectedValue: 'won',
      fixable: false
    });
  }
  
  // Check if deal already has a different Xero quote
  if (associatedDeal.xeroQuoteId && associatedDeal.xeroQuoteId !== quote.QuoteID) {
    issues.push({
      code: 'QUOTE_DEAL_MISMATCH',
      severity: 'error',
      message: `Deal ${dealId} is linked to a different quote: ${associatedDeal.xeroQuoteNumber}`,
      field: 'quoteId',
      currentValue: quote.QuoteID,
      expectedValue: associatedDeal.xeroQuoteId,
      fixable: false
    });
  }
  
  // Check value match - use productsTotal if available, otherwise use deal value
  const quoteTotalRounded = Math.round(quote.Total * 100) / 100;
  const dealValueToCompare = associatedDeal.productsTotal > 0 ? associatedDeal.productsTotal : associatedDeal.value;
  const dealValueRounded = Math.round(dealValueToCompare * 100) / 100;
  
  if (Math.abs(quoteTotalRounded - dealValueRounded) > 0.01) {
    issues.push({
      code: 'QUOTE_VALUE_MISMATCH',
      severity: 'error',
      message: `Quote value (${quote.CurrencyCode} ${quoteTotalRounded}) doesn't match deal value (${associatedDeal.currency} ${dealValueRounded})`,
      field: 'value',
      currentValue: quoteTotalRounded.toString(),
      expectedValue: dealValueRounded.toString(),
      fixable: false
    });
  }
  
  // Check currency match
  if (quote.CurrencyCode !== associatedDeal.currency) {
    issues.push({
      code: 'QUOTE_CURRENCY_MISMATCH',
      severity: 'error',
      message: `Quote currency (${quote.CurrencyCode}) doesn't match deal currency (${associatedDeal.currency})`,
      field: 'currency',
      currentValue: quote.CurrencyCode,
      expectedValue: associatedDeal.currency,
      fixable: false
    });
  }
  
  // Additional validations using Phase 1 data
  
  // Check if quote number matches expected format
  if (associatedDeal.matchingKey && !quote.QuoteNumber.toLowerCase().includes(associatedDeal.matchingKey.split('-')[0])) {
    issues.push({
      code: 'QUOTE_NUMBER_MISMATCH',
      severity: 'warning',
      message: `Quote number doesn't contain expected project code from deal`,
      field: 'quoteNumber',
      currentValue: quote.QuoteNumber,
      fixable: false
    });
  }
  
  // Check if deal has validation issues from Phase 1
  if (associatedDeal.validationIssues && associatedDeal.validationIssues.length > 0) {
    const criticalIssues = associatedDeal.validationIssues.filter((issue: any) => issue.severity === 'error');
    if (criticalIssues.length > 0) {
      issues.push({
        code: 'QUOTE_DEAL_HAS_ERRORS',
        severity: 'warning',
        message: `Associated deal has ${criticalIssues.length} validation errors from Phase 1`,
        field: 'dealValidation',
        currentValue: criticalIssues.map((i: any) => i.code).join(', '),
        fixable: false
      });
    }
  }
  
  return result;
}

/**
 * Perform Phase 2 validation - compare all Xero accepted quotes with Pipedrive deals
 */
export function validateQuotesAgainstDeals(context: QuoteValidationContext): {
  quotes: QuoteValidationResult[];
  stats: Phase2ValidationStats;
} {
  const { xeroQuotes, pipedriveDeals } = context;
  
  // Filter only accepted quotes
  const acceptedQuotes = xeroQuotes.filter(q => 
    q.Status === 'ACCEPTED' || q.Status === 'INVOICED'
  );
  
  // Validate each quote
  const validatedQuotes = acceptedQuotes.map(quote => 
    validateQuote(quote, pipedriveDeals)
  );
  
  // Calculate statistics
  const totalAcceptedQuotesValue = acceptedQuotes.reduce((sum, q) => sum + q.Total, 0);
  
  // For deals, use productsTotal if available (from Phase 1), otherwise use deal value
  const totalWonDealsValue = pipedriveDeals
    .filter(d => d.status === 'won' || !d.status) // Some validated deals might not have status
    .reduce((sum, d) => {
      const valueToUse = d.productsTotal > 0 ? d.productsTotal : d.value;
      return sum + valueToUse;
    }, 0);
  
  const quotesWithDeals = validatedQuotes.filter(q => 
    q.associatedDealId && !q.validationIssues.some(i => i.code === 'QUOTE_ORPHANED')
  ).length;
  
  const orphanedQuotes = validatedQuotes.filter(q => 
    q.validationIssues.some(i => i.code === 'QUOTE_ORPHANED')
  ).length;
  
  // Find deals without quotes
  const dealsWithQuotes = new Set(
    validatedQuotes
      .filter(q => q.associatedDealId)
      .map(q => q.associatedDealId)
  );
  
  // Also include deals that have xeroQuoteId from Phase 1
  const dealsWithXeroQuote = pipedriveDeals.filter(d => d.xeroQuoteId).map(d => d.id.toString());
  dealsWithXeroQuote.forEach(dealId => dealsWithQuotes.add(dealId));
  
  const dealsWithoutQuotes = pipedriveDeals.filter(d => 
    (d.status === 'won' || !d.status) && !dealsWithQuotes.has(d.id.toString())
  ).length;
  
  // Calculate detailed value breakdown
  const orphanedQuotesValue = validatedQuotes
    .filter(q => q.validationIssues.some(i => i.code === 'QUOTE_ORPHANED'))
    .reduce((sum, q) => sum + q.total, 0);
  
  // Find duplicate quotes value
  const duplicates = findDuplicateQuotes(validatedQuotes);
  let duplicateQuotesValue = 0;
  duplicates.forEach(quotes => {
    // Sum all but the first quote (considering first as the "primary")
    const sortedQuotes = quotes.sort((a, b) => b.total - a.total);
    for (let i = 1; i < sortedQuotes.length; i++) {
      duplicateQuotesValue += sortedQuotes[i].total;
    }
  });
  
  const matchedQuotesValue = validatedQuotes
    .filter(q => q.associatedDealId && !q.validationIssues.some(i => i.code === 'QUOTE_ORPHANED'))
    .reduce((sum, q) => sum + q.total, 0);
  
  // Calculate deals with quotes value
  const dealsWithQuotesSet = new Set(
    validatedQuotes
      .filter(q => q.associatedDealId && !q.validationIssues.some(i => i.code === 'QUOTE_ORPHANED'))
      .map(q => q.associatedDealId)
  );
  
  const dealsWithQuotesValue = pipedriveDeals
    .filter(d => dealsWithQuotesSet.has(d.id.toString()) || d.xeroQuoteId)
    .reduce((sum, d) => sum + (d.productsTotal > 0 ? d.productsTotal : d.value), 0);
  
  const dealsWithoutQuotesValue = pipedriveDeals
    .filter(d => !dealsWithQuotesSet.has(d.id.toString()) && !d.xeroQuoteId)
    .reduce((sum, d) => sum + (d.productsTotal > 0 ? d.productsTotal : d.value), 0);
  
  // Calculate quotes with value mismatch
  const quotesWithValueMismatch = validatedQuotes.filter(q => 
    q.validationIssues.some(i => i.code === 'QUOTE_VALUE_MISMATCH')
  );
  
  const totalValueMismatchAmount = quotesWithValueMismatch.reduce((sum, q) => {
    const dealId = q.associatedDealId;
    if (dealId) {
      const deal = pipedriveDeals.find(d => d.id.toString() === dealId);
      if (deal) {
        const dealValue = deal.productsTotal > 0 ? deal.productsTotal : deal.value;
        return sum + Math.abs(q.total - dealValue);
      }
    }
    return sum;
  }, 0);

  const stats: Phase2ValidationStats = {
    totalAcceptedQuotes: acceptedQuotes.length,
    totalAcceptedQuotesValue: Math.round(totalAcceptedQuotesValue * 100) / 100,
    totalWonDeals: pipedriveDeals.length, // All deals in Phase 1 are already filtered for won status
    totalWonDealsValue: Math.round(totalWonDealsValue * 100) / 100,
    quotesWithDeals,
    orphanedQuotes,
    dealsWithoutQuotes,
    valueMismatch: Math.abs(totalAcceptedQuotesValue - totalWonDealsValue) > 0.01,
    valueDifference: Math.round((totalAcceptedQuotesValue - totalWonDealsValue) * 100) / 100,
    valueBreakdown: {
      orphanedQuotesValue: Math.round(orphanedQuotesValue * 100) / 100,
      duplicateQuotesValue: Math.round(duplicateQuotesValue * 100) / 100,
      matchedQuotesValue: Math.round(matchedQuotesValue * 100) / 100,
      dealsWithQuotesValue: Math.round(dealsWithQuotesValue * 100) / 100,
      dealsWithoutQuotesValue: Math.round(dealsWithoutQuotesValue * 100) / 100,
      quotesWithValueMismatch: quotesWithValueMismatch.length,
      totalValueMismatchAmount: Math.round(totalValueMismatchAmount * 100) / 100
    }
  };
  
  return {
    quotes: validatedQuotes,
    stats
  };
}

/**
 * Check for duplicate quotes (multiple accepted quotes for same deal)
 */
export function findDuplicateQuotes(quotes: QuoteValidationResult[]): Map<string, QuoteValidationResult[]> {
  const dealQuotesMap = new Map<string, QuoteValidationResult[]>();
  
  quotes.forEach(quote => {
    if (quote.associatedDealId) {
      const existing = dealQuotesMap.get(quote.associatedDealId) || [];
      existing.push(quote);
      dealQuotesMap.set(quote.associatedDealId, existing);
    }
  });
  
  // Filter to only keep deals with multiple quotes
  const duplicates = new Map<string, QuoteValidationResult[]>();
  dealQuotesMap.forEach((quotes, dealId) => {
    if (quotes.length > 1) {
      duplicates.set(dealId, quotes);
    }
  });
  
  return duplicates;
}