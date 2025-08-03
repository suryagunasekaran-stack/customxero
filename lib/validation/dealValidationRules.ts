/**
 * Stub implementation for deal validation rules
 */

export interface ValidationContext {
  dealId?: string;
  [key: string]: any;
}

export function validateDeal(contextOrDeal: any, context?: ValidationContext) {
  // Support both calling patterns
  return [];
}

export function categorizeIssues(issues: any[]) {
  return {
    errors: [],
    warnings: [],
    suggestions: [],
    fixable: []
  };
}

export function generateValidationStats(deals: any[]) {
  return {
    totalDeals: deals.length,
    dealsWithIssues: 0,
    totalIssues: 0,
    errorCount: 0,
    warningCount: 0,
    suggestionCount: 0,
    withErrors: 0,
    acceptedQuotesTotal: 0,
    dealsTotal: 0,
    totalsMismatch: false
  };
}