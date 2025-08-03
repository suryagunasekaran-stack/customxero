/**
 * TypeScript interfaces for validation functionality
 */

export interface ValidationResult {
  tenantId: string;
  timestamp: Date;
  deals: ValidatedDeal[];
  quotes: ValidatedQuote[];
  projects: ValidatedProject[];
  summary: ValidationSummary;
}

export interface ValidatedDeal {
  id: number;
  title: string;
  normalizedTitle: string;
  pipelineId: number;
  value: number;
  currency: string;
  xeroQuoteId?: string;
  xeroProjectId?: string;
  validationIssues: ValidationIssue[];
  customFields: Record<string, any>;
}

export interface ValidatedQuote {
  QuoteID: string;
  QuoteNumber: string;
  Status: string;
  Total: number;
  matchedDealId?: number;
  validationIssues: ValidationIssue[];
}

export interface ValidatedProject {
  projectId: string;
  name: string;
  normalizedKey: string;
  status: string;
  totalAmount?: number;
  matchedDealId?: number;
  validationIssues: ValidationIssue[];
}

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  field?: string;
  suggestedFix?: string;
}

export interface ValidationSummary {
  totalDeals: number;
  totalQuotes: number;
  totalProjects: number;
  dealsWithIssues: number;
  quotesWithIssues: number;
  projectsWithIssues: number;
  totalIssues: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  matchedDealsToQuotes: number;
  matchedDealsToProjects: number;
  unmatchedDeals: number;
  unmatchedQuotes: number;
  unmatchedProjects: number;
  quotesByStatus?: {
    DRAFT: number;
    SENT: number;
    ACCEPTED: number;
    DECLINED: number;
    DELETED: number;
    INVOICED: number;
  };
  totalQuoteInProgressValue?: number;
  totalPipedriveWorkInProgressValue?: number;
  orphanedAcceptedQuotes?: number;
  orphanedAcceptedQuotesValue?: number;
  acceptedQuotesWithInvalidFormat?: number;
}

export interface TenantConfig {
  tenantId: string;
  pipedriveApiKey: string;
  companyDomain: string;
  pipelineIds: number[];
  customFieldKeys: CustomFieldMapping;
  enabled: boolean;
}

export interface CustomFieldMapping {
  xeroQuoteId: string;
  invoiceId: string;
  vesselName: string;
  [key: string]: string;
}