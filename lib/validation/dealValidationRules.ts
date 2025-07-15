/**
 * Deal Validation Rules System
 * Designed to be extensible for future automated fixes
 */

export interface ValidationIssue {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  field?: string;
  currentValue?: any;
  expectedValue?: any;
  fixable?: boolean; // For future auto-fix functionality
  fixAction?: string; // Description of how to fix
}

export interface ValidationContext {
  deal: any;
  xeroQuote?: any;
  dealProducts?: any[];
  tenantId: string;
}

export interface ValidationRule {
  id: string;
  name: string;
  description: string;
  validate: (context: ValidationContext) => ValidationIssue[];
}

/**
 * Deal Title Validation Rules
 */
export const titleValidationRule: ValidationRule = {
  id: 'TITLE_FORMAT',
  name: 'Deal Title Format',
  description: 'Validates deal title follows "PROJECT_CODE - VESSEL_NAME" format',
  validate: (context) => {
    const issues: ValidationIssue[] = [];
    const { deal } = context;
    
    if (!deal.title) {
      issues.push({
        code: 'TITLE_MISSING',
        severity: 'error',
        message: 'Deal title is missing',
        field: 'title',
        fixable: false
      });
      return issues;
    }
    
    // Check format: "PROJECT_CODE - VESSEL_NAME"
    const titlePattern = /^([A-Z]+\d+)\s*-\s*(.+)$/;
    const match = deal.title.match(titlePattern);
    
    if (!match) {
      issues.push({
        code: 'TITLE_FORMAT_INVALID',
        severity: 'error',
        message: 'Title must follow format: "PROJECT_CODE - VESSEL_NAME"',
        field: 'title',
        currentValue: deal.title,
        expectedValue: 'e.g., "NY25618 - CCL1"',
        fixable: false
      });
      return issues;
    }
    
    const [, projectCode, vesselName] = match;
    
    // Check if vessel name is valid (allowing 'NA' as a valid vessel name)
    if (!vesselName || vesselName.trim() === '') {
      issues.push({
        code: 'VESSEL_NAME_INVALID',
        severity: 'error',
        message: 'Vessel name is missing or invalid',
        field: 'title',
        currentValue: vesselName,
        fixable: false,
        fixAction: 'Update deal title with correct vessel name'
      });
    }
    
    // Check if title ends with incomplete pattern like "NY250319-"
    if (deal.title.endsWith('-')) {
      issues.push({
        code: 'TITLE_INCOMPLETE',
        severity: 'error',
        message: 'Deal title is incomplete (ends with "-")',
        field: 'title',
        currentValue: deal.title,
        fixable: true,
        fixAction: 'Add vessel name to complete the title'
      });
    }
    
    return issues;
  }
};

/**
 * Xero Quote Validation Rules
 */
export const xeroQuoteValidationRule: ValidationRule = {
  id: 'XERO_QUOTE',
  name: 'Xero Quote Validation',
  description: 'Validates Xero quote existence, status, and format',
  validate: (context) => {
    const issues: ValidationIssue[] = [];
    const { deal, xeroQuote } = context;
    
    // Check if Xero quote exists
    if (!deal.xeroQuoteId) {
      issues.push({
        code: 'XERO_QUOTE_MISSING',
        severity: 'error',
        message: 'No Xero quote linked to this deal',
        field: 'xeroQuoteId',
        fixable: true,
        fixAction: 'Create and link Xero quote'
      });
      return issues;
    }
    
    // If quote doesn't exist in Xero
    if (!xeroQuote) {
      issues.push({
        code: 'XERO_QUOTE_NOT_FOUND',
        severity: 'error',
        message: `Xero quote ${deal.xeroQuoteId} not found in Xero`,
        field: 'xeroQuoteId',
        currentValue: deal.xeroQuoteId,
        fixable: false
      });
      return issues;
    }
    
    // Check quote status - but don't flag INVOICED quotes
    if (xeroQuote.Status !== 'ACCEPTED' && xeroQuote.Status !== 'INVOICED') {
      issues.push({
        code: 'XERO_QUOTE_NOT_ACCEPTED',
        severity: 'error',
        message: `Xero quote status is ${xeroQuote.Status}, should be ACCEPTED`,
        field: 'xeroQuoteStatus',
        currentValue: xeroQuote.Status,
        expectedValue: 'ACCEPTED',
        fixable: true,
        fixAction: 'Update quote status in Xero to ACCEPTED'
      });
    }
    
    // Flag INVOICED quotes as info only - no action needed
    if (xeroQuote.Status === 'INVOICED') {
      issues.push({
        code: 'XERO_QUOTE_INVOICED',
        severity: 'info',
        message: 'Xero quote has been invoiced',
        field: 'xeroQuoteStatus',
        currentValue: xeroQuote.Status,
        fixable: false
      });
    }
    
    // Check if it's just QU#### format without project code (this is the only invalid format)
    if (xeroQuote.QuoteNumber && /^QU\d+$/.test(xeroQuote.QuoteNumber)) {
      const titleMatch = deal.title?.match(/^([A-Z]+\d+)/);
      const projectCode = titleMatch?.[1];
      
      issues.push({
        code: 'XERO_QUOTE_NUMBER_NO_PROJECT',
        severity: 'error',
        message: 'Quote number missing project code prefix',
        field: 'xeroQuoteNumber',
        currentValue: xeroQuote.QuoteNumber,
        expectedValue: projectCode ? `${projectCode}-${xeroQuote.QuoteNumber}-1` : 'PROJECT-' + xeroQuote.QuoteNumber,
        fixable: true,
        fixAction: 'Update quote number to include project code'
      });
    }
    
    return issues;
  }
};

/**
 * Value and Currency Validation
 */
export const valueValidationRule: ValidationRule = {
  id: 'VALUE_MATCH',
  name: 'Value and Currency Validation',
  description: 'Validates deal value matches Xero quote and products',
  validate: (context) => {
    const issues: ValidationIssue[] = [];
    const { deal, xeroQuote, dealProducts } = context;
    
    // Check currency match
    if (xeroQuote && deal.currency && xeroQuote.CurrencyCode) {
      if (deal.currency !== xeroQuote.CurrencyCode) {
        issues.push({
          code: 'CURRENCY_MISMATCH',
          severity: 'error',
          message: 'Currency mismatch between Pipedrive and Xero',
          field: 'currency',
          currentValue: deal.currency,
          expectedValue: xeroQuote.CurrencyCode,
          fixable: true,
          fixAction: 'Update deal currency to match Xero quote'
        });
      }
    }
    
    // Calculate products total
    const productsTotal = dealProducts?.reduce((sum, product) => {
      return sum + (product.quantity * product.item_price);
    }, 0) || 0;
    
    // Check if deal value matches products total
    if (Math.abs(deal.value - productsTotal) > 0.01) {
      issues.push({
        code: 'DEAL_PRODUCTS_VALUE_MISMATCH',
        severity: 'error',
        message: 'Deal value does not match products total',
        field: 'value',
        currentValue: deal.value,
        expectedValue: productsTotal,
        fixable: true,
        fixAction: 'Sync products from Xero to Pipedrive'
      });
    }
    
    // Check if Xero quote total matches
    if (xeroQuote && xeroQuote.Total) {
      if (Math.abs(productsTotal - xeroQuote.Total) > 0.01) {
        issues.push({
          code: 'XERO_QUOTE_VALUE_MISMATCH',
          severity: 'error',
          message: 'Products total does not match Xero quote total',
          field: 'productsTotal',
          currentValue: productsTotal,
          expectedValue: xeroQuote.Total,
          fixable: true,
          fixAction: 'Sync products between Pipedrive and Xero'
        });
      }
    }
    
    return issues;
  }
};

/**
 * Customer Validation
 */
export const customerValidationRule: ValidationRule = {
  id: 'CUSTOMER_MATCH',
  name: 'Customer Validation',
  description: 'Validates customer/contact matches between systems',
  validate: (context) => {
    const issues: ValidationIssue[] = [];
    const { deal, xeroQuote } = context;
    
    if (!deal.org_name || deal.org_name === 'Unknown') {
      issues.push({
        code: 'DEAL_ORG_MISSING',
        severity: 'error',
        message: 'Deal has no organization assigned',
        field: 'org_name',
        currentValue: deal.org_id,
        fixable: false
      });
      return issues;
    }
    
    if (xeroQuote && xeroQuote.Contact) {
      // Simple name comparison - could be enhanced with fuzzy matching
      const dealOrgName = deal.org_name.toLowerCase().trim();
      const xeroContactName = xeroQuote.Contact.Name?.toLowerCase().trim() || '';
      
      if (!dealOrgName.includes(xeroContactName) && !xeroContactName.includes(dealOrgName)) {
        issues.push({
          code: 'CUSTOMER_NAME_MISMATCH',
          severity: 'warning',
          message: 'Organization name might not match Xero contact',
          field: 'org_name',
          currentValue: deal.org_name,
          expectedValue: xeroQuote.Contact.Name,
          fixable: false,
          fixAction: 'Verify organization names match between systems'
        });
      }
    }
    
    return issues;
  }
};

/**
 * Products Validation
 */
export const productsValidationRule: ValidationRule = {
  id: 'PRODUCTS_SYNC',
  name: 'Products Synchronization',
  description: 'Validates products are synchronized between systems',
  validate: (context) => {
    const issues: ValidationIssue[] = [];
    const { dealProducts, xeroQuote } = context;
    
    const dealProductCount = dealProducts?.length || 0;
    const xeroLineItemCount = xeroQuote?.LineItems?.length || 0;
    
    if (dealProductCount === 0) {
      issues.push({
        code: 'NO_PRODUCTS',
        severity: 'warning',
        message: 'Deal has no products attached',
        field: 'products',
        fixable: false,
        fixAction: 'Manually add products to the deal in Pipedrive'
      });
    } else if (xeroQuote && dealProductCount !== xeroLineItemCount) {
      issues.push({
        code: 'PRODUCT_COUNT_MISMATCH',
        severity: 'error',
        message: `Product count mismatch: ${dealProductCount} in Pipedrive vs ${xeroLineItemCount} in Xero`,
        field: 'products',
        currentValue: dealProductCount,
        expectedValue: xeroLineItemCount,
        fixable: true,
        fixAction: 'Sync products between Pipedrive and Xero'
      });
    }
    
    return issues;
  }
};

/**
 * Main validation runner
 */
export const ALL_VALIDATION_RULES: ValidationRule[] = [
  titleValidationRule,
  xeroQuoteValidationRule,
  valueValidationRule,
  customerValidationRule,
  productsValidationRule
];

export function validateDeal(context: ValidationContext): ValidationIssue[] {
  const allIssues: ValidationIssue[] = [];
  
  for (const rule of ALL_VALIDATION_RULES) {
    const issues = rule.validate(context);
    allIssues.push(...issues);
  }
  
  return allIssues;
}

/**
 * Helper to categorize issues by severity
 */
export function categorizeIssues(issues: ValidationIssue[]) {
  return {
    errors: issues.filter(i => i.severity === 'error'),
    warnings: issues.filter(i => i.severity === 'warning'),
    info: issues.filter(i => i.severity === 'info'),
    fixable: issues.filter(i => i.fixable === true)
  };
}

/**
 * Helper to generate summary statistics
 */
export function generateValidationStats(validatedDeals: any[]) {
  const stats = {
    totalDeals: validatedDeals.length,
    fullySynced: 0,
    withErrors: 0,
    withWarnings: 0,
    fixableIssues: 0,
    issueBreakdown: {} as Record<string, number>
  };
  
  for (const deal of validatedDeals) {
    const categorized = categorizeIssues(deal.validationIssues || []);
    
    if (categorized.errors.length === 0 && categorized.warnings.length === 0) {
      stats.fullySynced++;
    }
    if (categorized.errors.length > 0) {
      stats.withErrors++;
    }
    if (categorized.warnings.length > 0) {
      stats.withWarnings++;
    }
    stats.fixableIssues += categorized.fixable.length;
    
    // Count issue types
    for (const issue of deal.validationIssues || []) {
      stats.issueBreakdown[issue.code] = (stats.issueBreakdown[issue.code] || 0) + 1;
    }
  }
  
  return stats;
}