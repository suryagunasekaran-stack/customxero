interface ValidationIssue {
  dealId: number;
  dealTitle: string;
  pipelineName: string;
  issue: string;
  severity: 'error' | 'warning';
  customFields?: any;
}

interface ValidationResult {
  dealId: number;
  dealTitle: string;
  pipelineName: string;
  hasQuoteId: boolean;
  quoteId?: string;
  quoteNumber?: string;
  dealValue: number;
  currency: string;
  wonTime: string;
  validationIssues: ValidationIssue[];
}

interface ValidationSummary {
  totalWonDeals: number;
  dealsWithQuoteId: number;
  dealsWithoutQuoteId: number;
  totalValue: number;
  currency: string;
  pipelineBreakdown: {
    [pipelineName: string]: {
      total: number;
      withQuoteId: number;
      withoutQuoteId: number;
      totalValue: number;
    };
  };
  issues: ValidationIssue[];
  results: ValidationResult[];
}

export class QuoteValidationService {
  private quoteIdFieldKey: string;
  private quoteNumberFieldKey: string;

  constructor(quoteIdFieldKey: string, quoteNumberFieldKey: string) {
    this.quoteIdFieldKey = quoteIdFieldKey;
    this.quoteNumberFieldKey = quoteNumberFieldKey;
  }

  /**
   * Validate a single deal for quote ID presence
   */
  validateDeal(deal: any, pipelineName: string): ValidationResult {
    const validationIssues: ValidationIssue[] = [];
    
    // Check for quote ID - v2 API stores custom fields in custom_fields object
    const quoteId = deal.custom_fields?.[this.quoteIdFieldKey] || null;
    const quoteNumber = deal.custom_fields?.[this.quoteNumberFieldKey] || null;
    
    const hasQuoteId = !!quoteId;
    
    if (!hasQuoteId) {
      validationIssues.push({
        dealId: deal.id,
        dealTitle: deal.title,
        pipelineName,
        issue: 'Deal is missing Quote ID',
        severity: 'error'
      });
    }

    // Additional validation checks
    if (deal.value === 0 || !deal.value) {
      validationIssues.push({
        dealId: deal.id,
        dealTitle: deal.title,
        pipelineName,
        issue: 'Deal has zero or no value',
        severity: 'warning'
      });
    }

    return {
      dealId: deal.id,
      dealTitle: deal.title,
      pipelineName,
      hasQuoteId,
      quoteId,
      quoteNumber,
      dealValue: deal.value || 0,
      currency: deal.currency || 'SGD',
      wonTime: deal.won_time,
      validationIssues
    };
  }

  /**
   * Validate multiple deals and generate summary
   */
  validateDeals(dealsWithDetails: Array<{deal: any, pipelineName: string}>): ValidationSummary {
    const results: ValidationResult[] = [];
    const allIssues: ValidationIssue[] = [];
    const pipelineBreakdown: ValidationSummary['pipelineBreakdown'] = {};

    // Validate each deal
    for (const {deal, pipelineName} of dealsWithDetails) {
      const result = this.validateDeal(deal, pipelineName);
      results.push(result);
      allIssues.push(...result.validationIssues);

      // Update pipeline breakdown
      if (!pipelineBreakdown[pipelineName]) {
        pipelineBreakdown[pipelineName] = {
          total: 0,
          withQuoteId: 0,
          withoutQuoteId: 0,
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
    }

    // Calculate totals
    const totalWonDeals = results.length;
    const dealsWithQuoteId = results.filter(r => r.hasQuoteId).length;
    const dealsWithoutQuoteId = results.filter(r => !r.hasQuoteId).length;
    const totalValue = results.reduce((sum, r) => sum + r.dealValue, 0);
    const currency = results[0]?.currency || 'SGD';

    return {
      totalWonDeals,
      dealsWithQuoteId,
      dealsWithoutQuoteId,
      totalValue,
      currency,
      pipelineBreakdown,
      issues: allIssues,
      results
    };
  }

  /**
   * Generate validation report
   */
  generateReport(summary: ValidationSummary): string {
    const lines: string[] = [];
    
    lines.push('=== Project Sync Validation Report ===');
    lines.push(`\nTotal Won Deals in WIP Pipelines: ${summary.totalWonDeals}`);
    lines.push(`Deals with Quote ID: ${summary.dealsWithQuoteId} (${((summary.dealsWithQuoteId / summary.totalWonDeals) * 100).toFixed(1)}%)`);
    lines.push(`Deals without Quote ID: ${summary.dealsWithoutQuoteId} (${((summary.dealsWithoutQuoteId / summary.totalWonDeals) * 100).toFixed(1)}%)`);
    lines.push(`Total Value: ${summary.currency} ${summary.totalValue.toLocaleString()}`);
    
    lines.push('\n=== Pipeline Breakdown ===');
    for (const [pipeline, stats] of Object.entries(summary.pipelineBreakdown)) {
      lines.push(`\n${pipeline}:`);
      lines.push(`  Total Deals: ${stats.total}`);
      lines.push(`  With Quote ID: ${stats.withQuoteId}`);
      lines.push(`  Without Quote ID: ${stats.withoutQuoteId}`);
      lines.push(`  Total Value: ${summary.currency} ${stats.totalValue.toLocaleString()}`);
    }
    
    if (summary.issues.length > 0) {
      lines.push('\n=== Validation Issues ===');
      const errors = summary.issues.filter(i => i.severity === 'error');
      const warnings = summary.issues.filter(i => i.severity === 'warning');
      
      if (errors.length > 0) {
        lines.push(`\nErrors (${errors.length}):`);
        errors.forEach(issue => {
          lines.push(`  - [${issue.dealId}] ${issue.dealTitle} (${issue.pipelineName}): ${issue.issue}`);
        });
      }
      
      if (warnings.length > 0) {
        lines.push(`\nWarnings (${warnings.length}):`);
        warnings.forEach(issue => {
          lines.push(`  - [${issue.dealId}] ${issue.dealTitle} (${issue.pipelineName}): ${issue.issue}`);
        });
      }
    }
    
    return lines.join('\n');
  }
}