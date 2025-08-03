/**
 * Stub implementation for quote validation rules
 */

export interface QuoteValidationContext {
  [key: string]: any;
}

export function validateQuotesAgainstDeals(quotesOrContext: any, deals?: any[], context?: QuoteValidationContext) {
  // Support both calling patterns
  return {
    quotes: [],
    issues: [],
    stats: {}
  };
}

export function findDuplicateQuotes(quotes: any[]) {
  return new Map();
}