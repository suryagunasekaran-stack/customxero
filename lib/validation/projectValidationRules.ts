import { ValidationIssue } from './dealValidationRules';
import { QuoteValidationResult } from './quoteValidationRules';

export interface XeroProject {
  projectId: string;
  contactId: string;
  name: string;
  currencyCode: string;
  status: string;
  estimate?: {
    currency: string;
    value: number;
  };
  totalTaskAmount?: {
    currency: string;
    value: number;
  };
  totalInvoiced?: {
    currency: string;
    value: number;
  };
  totalToBeInvoiced?: {
    currency: string;
    value: number;
  };
}

export interface ProjectValidationResult {
  projectId: string;
  projectName: string;
  projectCode: string;
  status: string;
  estimateValue: number;
  currency: string;
  associatedQuotes: QuoteValidationResult[];
  totalQuotesValue: number;
  validationIssues: ValidationIssue[];
  hasValidDeal: boolean;
}

export interface Phase3ValidationStats {
  totalInProgressProjects: number;
  projectsWithQuotes: number;
  projectsWithoutQuotes: number;
  projectsWithEstimateMismatch: number;
  projectsWithInvalidDeals: number;
  totalProjectEstimates: number;
  totalQuotesForProjects: number;
  estimateDifference: number;
  duplicateProjects?: number;
  projectBreakdown?: {
    withoutQuotes: { projectName: string; estimate: number; currency: string }[];
    withPipelineIssues: { projectName: string; quotes: any[]; deals: any[] }[];
    withEstimateMismatch: { projectName: string; estimate: number; quotesTotal: number; difference: number }[];
  };
}

/**
 * Extract project code from project name or quote number
 */
export function extractProjectCode(text: string): string | null {
  // Match patterns like "AF243418-Girolando Express" or "NY25619-QU0314-1"
  const match = text.match(/^([A-Z]+\d+)/);
  return match ? match[1] : null;
}

/**
 * Group quotes by project code
 */
export function groupQuotesByProject(quotes: QuoteValidationResult[]): Map<string, QuoteValidationResult[]> {
  const projectQuotesMap = new Map<string, QuoteValidationResult[]>();
  
  quotes.forEach(quote => {
    const projectCode = extractProjectCode(quote.quoteNumber);
    if (projectCode) {
      const existing = projectQuotesMap.get(projectCode) || [];
      existing.push(quote);
      projectQuotesMap.set(projectCode, existing);
    }
  });
  
  return projectQuotesMap;
}

/**
 * Validate individual project
 */
export function validateProject(
  project: XeroProject, 
  associatedQuotes: QuoteValidationResult[],
  deals: any[]
): ProjectValidationResult {
  const issues: ValidationIssue[] = [];
  const projectCode = extractProjectCode(project.name) || '';
  const estimateValue = project.estimate?.value || 0;
  
  const result: ProjectValidationResult = {
    projectId: project.projectId,
    projectName: project.name,
    projectCode,
    status: project.status,
    estimateValue,
    currency: project.currencyCode,
    associatedQuotes,
    totalQuotesValue: 0,
    validationIssues: issues,
    hasValidDeal: false
  };
  
  // Check if project has any accepted quotes
  if (associatedQuotes.length === 0) {
    issues.push({
      code: 'PROJECT_NO_QUOTES',
      severity: 'error',
      message: 'In-progress project has no accepted quotes',
      field: 'quotes',
      currentValue: '0',
      expectedValue: '>0',
      fixable: false
    });
    return result;
  }
  
  // Calculate total quotes value
  result.totalQuotesValue = associatedQuotes.reduce((sum, quote) => sum + quote.total, 0);
  
  // Check if any associated deal is in pipeline 2
  let hasValidDeal = false;
  let invalidDealCount = 0;
  
  associatedQuotes.forEach(quote => {
    if (quote.associatedDealId) {
      const deal = deals.find(d => d.id.toString() === quote.associatedDealId);
      if (deal) {
        if (deal.pipeline_id === 2) {
          hasValidDeal = true;
        } else {
          invalidDealCount++;
        }
      }
    }
  });
  
  result.hasValidDeal = hasValidDeal;
  
  if (!hasValidDeal && associatedQuotes.some(q => q.associatedDealId)) {
    issues.push({
      code: 'PROJECT_NO_PIPELINE2_DEAL',
      severity: 'error',
      message: `No associated deals in Pipeline 2 (${invalidDealCount} deals in other pipelines)`,
      field: 'pipeline',
      currentValue: 'Other pipelines',
      expectedValue: 'Pipeline 2',
      fixable: false
    });
  }
  
  // Check estimate vs quotes total
  const estimateRounded = Math.round(estimateValue * 100) / 100;
  const quotesRounded = Math.round(result.totalQuotesValue * 100) / 100;
  
  if (Math.abs(estimateRounded - quotesRounded) > 0.01) {
    issues.push({
      code: 'PROJECT_ESTIMATE_MISMATCH',
      severity: 'warning',
      message: `Project estimate (${project.currencyCode} ${estimateRounded.toLocaleString()}) doesn't match total quotes (${project.currencyCode} ${quotesRounded.toLocaleString()})`,
      field: 'estimate',
      currentValue: estimateRounded.toString(),
      expectedValue: quotesRounded.toString(),
      fixable: false
    });
  }
  
  // Check for orphaned quotes in associated quotes
  const orphanedQuotes = associatedQuotes.filter(q => 
    q.validationIssues.some(i => i.code === 'QUOTE_ORPHANED')
  );
  
  if (orphanedQuotes.length > 0) {
    issues.push({
      code: 'PROJECT_HAS_ORPHANED_QUOTES',
      severity: 'warning',
      message: `Project has ${orphanedQuotes.length} orphaned quote(s)`,
      field: 'quotes',
      currentValue: orphanedQuotes.map(q => q.quoteNumber).join(', '),
      fixable: false
    });
  }
  
  return result;
}

/**
 * Perform Phase 3 validation - validate Xero projects against quotes and deals
 */
export function validateProjectsAgainstQuotes(
  projects: XeroProject[],
  quotes: QuoteValidationResult[],
  deals: any[]
): {
  projects: ProjectValidationResult[];
  stats: Phase3ValidationStats;
  duplicates?: any[];
} {
  // Filter only INPROGRESS projects
  const inProgressProjects = projects.filter(p => p.status === 'INPROGRESS');
  
  // Group quotes by project code
  const quotesByProject = groupQuotesByProject(quotes);
  
  // Validate each project
  const validatedProjects: ProjectValidationResult[] = [];
  
  inProgressProjects.forEach(project => {
    const projectCode = extractProjectCode(project.name);
    const associatedQuotes = projectCode ? (quotesByProject.get(projectCode) || []) : [];
    
    const validationResult = validateProject(project, associatedQuotes, deals);
    validatedProjects.push(validationResult);
  });
  
  // Check for duplicate projects
  const duplicateProjects = findDuplicateProjects(inProgressProjects);
  
  // Add duplicate validation to projects
  duplicateProjects.forEach((duplicates, projectCode) => {
    duplicates.forEach(project => {
      const validatedProject = validatedProjects.find(p => p.projectId === project.projectId);
      if (validatedProject) {
        validatedProject.validationIssues.push({
          code: 'PROJECT_DUPLICATE',
          severity: 'error',
          message: `Duplicate project code ${projectCode} found (${duplicates.length} projects)`,
          field: 'projectCode',
          currentValue: projectCode,
          fixable: false
        });
      }
    });
  });
  
  // Calculate statistics
  const projectsWithQuotes = validatedProjects.filter(p => p.associatedQuotes.length > 0).length;
  const projectsWithoutQuotes = validatedProjects.filter(p => p.associatedQuotes.length === 0).length;
  const projectsWithEstimateMismatch = validatedProjects.filter(p => 
    p.validationIssues.some(i => i.code === 'PROJECT_ESTIMATE_MISMATCH')
  ).length;
  const projectsWithInvalidDeals = validatedProjects.filter(p => 
    p.validationIssues.some(i => i.code === 'PROJECT_NO_PIPELINE2_DEAL')
  ).length;
  
  const totalProjectEstimates = validatedProjects.reduce((sum, p) => sum + p.estimateValue, 0);
  const totalQuotesForProjects = validatedProjects.reduce((sum, p) => sum + p.totalQuotesValue, 0);
  
  // Create detailed breakdowns
  const projectBreakdown = {
    withoutQuotes: validatedProjects
      .filter(p => p.associatedQuotes.length === 0)
      .map(p => ({
        projectName: p.projectName,
        estimate: p.estimateValue,
        currency: p.currency
      })),
    withPipelineIssues: validatedProjects
      .filter(p => p.validationIssues.some(i => i.code === 'PROJECT_NO_PIPELINE2_DEAL'))
      .map(p => ({
        projectName: p.projectName,
        quotes: p.associatedQuotes.map(q => ({
          quoteNumber: q.quoteNumber,
          dealId: q.associatedDealId,
          total: q.total
        })),
        deals: p.associatedQuotes
          .filter(q => q.associatedDealId)
          .map(q => {
            const deal = deals.find(d => d.id.toString() === q.associatedDealId);
            return deal ? {
              dealId: deal.id,
              pipeline: deal.pipeline_id,
              title: deal.title
            } : null;
          })
          .filter(Boolean)
      })),
    withEstimateMismatch: validatedProjects
      .filter(p => p.validationIssues.some(i => i.code === 'PROJECT_ESTIMATE_MISMATCH'))
      .map(p => ({
        projectName: p.projectName,
        estimate: p.estimateValue,
        quotesTotal: p.totalQuotesValue,
        difference: Math.round((p.estimateValue - p.totalQuotesValue) * 100) / 100
      }))
  };
  
  const stats: Phase3ValidationStats = {
    totalInProgressProjects: inProgressProjects.length,
    projectsWithQuotes,
    projectsWithoutQuotes,
    projectsWithEstimateMismatch,
    projectsWithInvalidDeals,
    totalProjectEstimates: Math.round(totalProjectEstimates * 100) / 100,
    totalQuotesForProjects: Math.round(totalQuotesForProjects * 100) / 100,
    estimateDifference: Math.round((totalProjectEstimates - totalQuotesForProjects) * 100) / 100,
    duplicateProjects: duplicateProjects.size,
    projectBreakdown
  };
  
  return {
    projects: validatedProjects,
    stats,
    duplicates: Array.from(duplicateProjects.entries()).map(([code, projects]) => ({
      projectCode: code,
      projects: projects.map(p => ({
        projectId: p.projectId,
        projectName: p.name,
        estimate: p.estimate?.value || 0
      }))
    }))
  };
}

/**
 * Find projects without any quotes (potential issues)
 */
export function findProjectsWithoutQuotes(projects: ProjectValidationResult[]): ProjectValidationResult[] {
  return projects.filter(p => p.associatedQuotes.length === 0);
}

/**
 * Find duplicate projects by project code
 */
export function findDuplicateProjects(projects: XeroProject[]): Map<string, XeroProject[]> {
  const projectsByCode = new Map<string, XeroProject[]>();
  
  projects.forEach(project => {
    const projectCode = extractProjectCode(project.name);
    if (projectCode) {
      const existing = projectsByCode.get(projectCode) || [];
      existing.push(project);
      projectsByCode.set(projectCode, existing);
    }
  });
  
  // Filter to only keep duplicates
  const duplicates = new Map<string, XeroProject[]>();
  projectsByCode.forEach((projects, code) => {
    if (projects.length > 1) {
      duplicates.set(code, projects);
    }
  });
  
  return duplicates;
}