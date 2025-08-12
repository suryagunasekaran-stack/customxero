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
  dealId?: number;
  dealTitle?: string;
  metadata?: {
    quoteNumber?: string;
    contactName?: string;
    quoteTotal?: number;
    [key: string]: any;
  };
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
  quoteCurrency?: string;
  totalPipedriveWorkInProgressValue?: number;
  pipedriveCurrency?: string;
  orphanedAcceptedQuotes?: number;
  orphanedAcceptedQuotesValue?: number;
  acceptedQuotesWithInvalidFormat?: number;
}

export interface XeroValidationIssue {
  severity: 'error' | 'warning' | 'info';
  code: 'INVALID_QUOTE_FORMAT' | 'MISSING_TRACKING_OPTIONS' | 'INVALID_PROJECT_CODE';
  message: string;
  quoteNumber: string;
  quoteId: string;
  suggestedFix?: string;
  metadata?: {
    expectedFormat?: string;
    actualFormat?: string;
    lineItemsWithoutTracking?: number;
    totalLineItems?: number;
    [key: string]: any;
  };
}

export interface XeroValidationSession {
  id: string;
  tenantId: string;
  startTime: Date;
  endTime?: Date;
  status: 'pending' | 'running' | 'completed' | 'failed';
  quotesProcessed: number;
  totalQuotes: number;
  issues: XeroValidationIssue[];
  errorCount: number;
  warningCount: number;
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