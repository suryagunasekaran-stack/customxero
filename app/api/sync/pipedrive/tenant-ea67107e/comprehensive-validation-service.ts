import { ValidationIssue, ValidationContext } from '@/lib/validation/dealValidationRules';
import { SmartRateLimit } from '@/lib/smartRateLimit';

interface DealValidationResult {
  dealId: number;
  dealTitle: string;
  pipelineName: string;
  dealValue: number;
  currency: string;
  wonTime: string;
  validationIssues: ValidationIssue[];
  
  // Quote related fields
  hasQuoteId: boolean;
  quoteId?: string;
  quoteNumber?: string;
  xeroQuote?: any;
  
  // Additional fields for comprehensive validation
  projectCode?: string;
  vesselName?: string;
  orgName?: string;
  productsTotal?: number;
  isFullySynced: boolean;
}

interface ComprehensiveValidationSummary {
  totalWonDeals: number;
  dealsWithQuoteId: number;
  dealsWithoutQuoteId: number;
  fullySyncedDeals: number;
  dealsWithErrors: number;
  dealsWithWarnings: number;
  totalValue: number;
  currency: string;
  pipelineBreakdown: {
    [pipelineName: string]: {
      total: number;
      withQuoteId: number;
      withoutQuoteId: number;
      fullySynced: number;
      withErrors: number;
      totalValue: number;
    };
  };
  issueBreakdown: {
    [issueCode: string]: number;
  };
  results: DealValidationResult[];
}

export class ComprehensiveValidationService {
  private quoteIdFieldKey: string;
  private quoteNumberFieldKey: string;
  private xeroAccessToken?: string;
  private xeroTenantId?: string;

  constructor(
    quoteIdFieldKey: string, 
    quoteNumberFieldKey: string,
    xeroAccessToken?: string,
    xeroTenantId?: string
  ) {
    this.quoteIdFieldKey = quoteIdFieldKey;
    this.quoteNumberFieldKey = quoteNumberFieldKey;
    this.xeroAccessToken = xeroAccessToken;
    this.xeroTenantId = xeroTenantId;
  }

  /**
   * Fetch Xero quote details
   */
  async fetchXeroQuote(quoteId: string): Promise<{ quote: any; error?: string }> {
    if (!this.xeroAccessToken || !this.xeroTenantId || !quoteId) {
      return { quote: null, error: 'Missing Xero credentials' };
    }

    try {
      // Apply rate limiting before making the API call
      await SmartRateLimit.waitIfNeeded();
      
      const response = await fetch(
        `https://api.xero.com/api.xro/2.0/Quotes/${quoteId}`,
        {
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${this.xeroAccessToken}`,
            'Xero-tenant-id': this.xeroTenantId
          }
        }
      );

      // Update rate limit counters from response headers
      SmartRateLimit.updateFromHeaders(response.headers);

      if (!response.ok) {
        console.error(`Failed to fetch Xero quote ${quoteId}: ${response.status}`);
        if (response.status === 404) {
          return { quote: null, error: 'not_found' };
        } else if (response.status === 401 || response.status === 403) {
          return { quote: null, error: 'access_denied' };
        } else if (response.status === 429) {
          return { quote: null, error: 'rate_limited' };
        }
        return { quote: null, error: `http_${response.status}` };
      }

      const data = await response.json();
      return { quote: data.Quotes?.[0] || null };
    } catch (error) {
      console.error(`Error fetching Xero quote ${quoteId}:`, error);
      return { quote: null, error: 'network_error' };
    }
  }

  /**
   * Validate deal title format
   */
  validateDealTitle(deal: any): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    
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
    
    // Check if vessel name is valid
    if (!vesselName || vesselName.trim() === '') {
      issues.push({
        code: 'VESSEL_NAME_INVALID',
        severity: 'error',
        message: 'Vessel name is missing or invalid',
        field: 'title',
        currentValue: vesselName,
        fixable: false
      });
    }
    
    // Check if title ends with incomplete pattern
    if (deal.title.endsWith('-')) {
      issues.push({
        code: 'TITLE_INCOMPLETE',
        severity: 'error',
        message: 'Deal title is incomplete (ends with "-")',
        field: 'title',
        currentValue: deal.title,
        fixable: true
      });
    }
    
    return issues;
  }

  /**
   * Validate Xero quote
   */
  validateXeroQuote(deal: any, xeroQuote: any): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const quoteId = deal.custom_fields?.[this.quoteIdFieldKey] || null;
    
    // Check if Xero quote exists
    if (!quoteId) {
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
        severity: 'warning',
        message: `Xero quote ${quoteId} could not be retrieved - it may exist but access is restricted`,
        field: 'xeroQuoteId',
        currentValue: quoteId,
        fixable: false
      });
      // Don't return early - continue with other validations
    }
    
    // Only validate quote details if we have the quote
    if (xeroQuote) {
      // Check quote status
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
      
      // Flag INVOICED quotes as info
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
      
      // Check quote number format
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
    }
    
    return issues;
  }

  /**
   * Validate value and currency
   */
  validateValueAndCurrency(deal: any, xeroQuote: any): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    
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
    
    // Check if Xero quote total matches deal value
    if (xeroQuote && xeroQuote.Total !== undefined) {
      const dealValue = deal.value || 0;
      const difference = Math.abs(dealValue - xeroQuote.Total);
      
      // Only flag as error if difference is 1 dollar or more
      if (difference >= 1.00) {
        issues.push({
          code: 'XERO_QUOTE_VALUE_MISMATCH',
          severity: 'error',
          message: 'Deal value does not match Xero quote total',
          field: 'value',
          currentValue: dealValue,
          expectedValue: xeroQuote.Total,
          fixable: true,
          fixAction: 'Update deal value to match Xero quote'
        });
      } else if (difference > 0.01 && difference < 1.00) {
        // Flag small differences as info only
        issues.push({
          code: 'XERO_QUOTE_VALUE_MINOR_DIFF',
          severity: 'info',
          message: `Minor value difference of ${deal.currency || 'SGD'} ${difference.toFixed(2)}`,
          field: 'value',
          currentValue: dealValue,
          expectedValue: xeroQuote.Total,
          fixable: false
        });
      }
    }
    
    return issues;
  }

  /**
   * Validate a single deal comprehensively
   */
  async validateDealComprehensively(deal: any, pipelineName: string): Promise<DealValidationResult> {
    const validationIssues: ValidationIssue[] = [];
    
    // Extract basic info
    const quoteId = deal.custom_fields?.[this.quoteIdFieldKey] || null;
    const quoteNumber = deal.custom_fields?.[this.quoteNumberFieldKey] || null;
    const hasQuoteId = !!quoteId;
    
    // Extract project code and vessel name
    const titleMatch = deal.title?.match(/^([A-Z]+\d+)\s*-\s*(.+)$/);
    const projectCode = titleMatch?.[1] || undefined;
    const vesselName = titleMatch?.[2]?.trim() || undefined;
    
    // Validate title format
    validationIssues.push(...this.validateDealTitle(deal));
    
    // Fetch and validate Xero quote if available
    let xeroQuote = null;
    let xeroFetchError = null;
    if (quoteId && this.xeroAccessToken) {
      const result = await this.fetchXeroQuote(quoteId);
      xeroQuote = result.quote;
      xeroFetchError = result.error;
    }
    
    // Validate Xero quote
    validationIssues.push(...this.validateXeroQuote(deal, xeroQuote));
    
    // Validate value and currency
    validationIssues.push(...this.validateValueAndCurrency(deal, xeroQuote));
    
    // Additional validations
    if (deal.value === 0 || !deal.value) {
      validationIssues.push({
        code: 'DEAL_VALUE_ZERO',
        severity: 'warning',
        message: 'Deal has zero or no value',
        field: 'value',
        currentValue: deal.value || 0,
        fixable: false
      });
    }
    
    // Check if deal is fully synced (no errors)
    const errors = validationIssues.filter(i => i.severity === 'error');
    const isFullySynced = errors.length === 0;
    
    return {
      dealId: deal.id,
      dealTitle: deal.title,
      pipelineName,
      dealValue: deal.value || 0,
      currency: deal.currency || 'SGD',
      wonTime: deal.won_time,
      validationIssues,
      hasQuoteId,
      quoteId,
      quoteNumber,
      xeroQuote,
      projectCode,
      vesselName,
      orgName: deal.org_name || 'Unknown',
      isFullySynced
    };
  }

  /**
   * Validate multiple deals and generate comprehensive summary
   */
  async validateDealsComprehensively(
    dealsWithPipeline: Array<{deal: any, pipelineName: string}>,
    onProgress?: (current: number, total: number) => void
  ): Promise<ComprehensiveValidationSummary> {
    const results: DealValidationResult[] = [];
    const pipelineBreakdown: ComprehensiveValidationSummary['pipelineBreakdown'] = {};
    const issueBreakdown: ComprehensiveValidationSummary['issueBreakdown'] = {};

    // Process each deal
    for (let i = 0; i < dealsWithPipeline.length; i++) {
      const {deal, pipelineName} = dealsWithPipeline[i];
      
      if (onProgress) {
        onProgress(i + 1, dealsWithPipeline.length);
      }
      
      const result = await this.validateDealComprehensively(deal, pipelineName);
      results.push(result);

      // Update pipeline breakdown
      if (!pipelineBreakdown[pipelineName]) {
        pipelineBreakdown[pipelineName] = {
          total: 0,
          withQuoteId: 0,
          withoutQuoteId: 0,
          fullySynced: 0,
          withErrors: 0,
          totalValue: 0
        };
      }

      pipelineBreakdown[pipelineName].total++;
      pipelineBreakdown[pipelineName].totalValue += result.dealValue;
      
      if (result.hasQuoteId) {
        pipelineBreakdown[pipelineName].withQuoteId++;
      } else {
        pipelineBreakdown[pipelineName].withoutQuoteId++;
      }
      
      if (result.isFullySynced) {
        pipelineBreakdown[pipelineName].fullySynced++;
      }
      
      const hasErrors = result.validationIssues.some(i => i.severity === 'error');
      if (hasErrors) {
        pipelineBreakdown[pipelineName].withErrors++;
      }
      
      // Update issue breakdown
      result.validationIssues.forEach(issue => {
        issueBreakdown[issue.code] = (issueBreakdown[issue.code] || 0) + 1;
      });
    }

    // Calculate totals
    const totalDeals = results.length;
    const dealsWithQuoteId = results.filter(r => r.hasQuoteId).length;
    const dealsWithoutQuoteId = results.filter(r => !r.hasQuoteId).length;
    const fullySyncedDeals = results.filter(r => r.isFullySynced).length;
    const dealsWithErrors = results.filter(r => 
      r.validationIssues.some(i => i.severity === 'error')
    ).length;
    const dealsWithWarnings = results.filter(r => 
      r.validationIssues.some(i => i.severity === 'warning')
    ).length;
    const totalValue = results.reduce((sum, r) => sum + r.dealValue, 0);
    const currency = results[0]?.currency || 'SGD';

    return {
      totalWonDeals: totalDeals,
      dealsWithQuoteId,
      dealsWithoutQuoteId,
      fullySyncedDeals,
      dealsWithErrors,
      dealsWithWarnings,
      totalValue,
      currency,
      pipelineBreakdown,
      issueBreakdown,
      results
    };
  }

  /**
   * Generate comprehensive validation report
   */
  generateComprehensiveReport(summary: ComprehensiveValidationSummary): string {
    const lines: string[] = [];
    
    lines.push('=== Comprehensive Project Sync Validation Report ===');
    lines.push(`\nTotal Won Deals: ${summary.totalWonDeals}`);
    lines.push(`Fully Synced: ${summary.fullySyncedDeals} (${((summary.fullySyncedDeals / summary.totalWonDeals) * 100).toFixed(1)}%)`);
    lines.push(`With Errors: ${summary.dealsWithErrors} (${((summary.dealsWithErrors / summary.totalWonDeals) * 100).toFixed(1)}%)`);
    lines.push(`With Warnings: ${summary.dealsWithWarnings}`);
    lines.push(`Total Value: ${summary.currency} ${summary.totalValue.toLocaleString()}`);
    
    lines.push('\n=== Issue Summary ===');
    const sortedIssues = Object.entries(summary.issueBreakdown)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10);
    
    sortedIssues.forEach(([code, count]) => {
      lines.push(`${code}: ${count} occurrences`);
    });
    
    lines.push('\n=== Pipeline Breakdown ===');
    for (const [pipeline, stats] of Object.entries(summary.pipelineBreakdown)) {
      lines.push(`\n${pipeline}:`);
      lines.push(`  Total Deals: ${stats.total}`);
      lines.push(`  Fully Synced: ${stats.fullySynced} (${((stats.fullySynced / stats.total) * 100).toFixed(1)}%)`);
      lines.push(`  With Errors: ${stats.withErrors}`);
      lines.push(`  Total Value: ${summary.currency} ${stats.totalValue.toLocaleString()}`);
    }
    
    return lines.join('\n');
  }
}