/**
 * Pipedrive validation rules for cross-system data integrity checking
 */

import type { ValidationContext } from './dealValidationRules';

export interface PipedriveValidationContext extends ValidationContext {
  pipedriveDeals: any[];
  xeroQuotes: any[];
  xeroProjects: any[];
  tenantConfig: TenantConfig;
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
  quoteNumber?: string;
  invoiceNumber?: string;
  status?: string;
  ipc?: string;
  location?: string;
  personInCharge?: string;
  woNumber?: string;
  moNumber?: string;
  department?: string;
  vesselType?: string;
  salesReference?: string;
  wopqNumber?: string;
  refNumber?: string;
  [key: string]: string | undefined;
}

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  field?: string;
  suggestedFix?: string;
  dealId?: number;
  dealTitle?: string;
}

export interface TitleValidationResult {
  dealId: number;
  title: string;
  normalizedTitle: string;
  isValid: boolean;
  issues: ValidationIssue[];
  parsedComponents?: ParsedTitle;
}

export interface ParsedTitle {
  projectCode?: string;
  vesselName?: string;
  separator?: string;
  isEDFormat?: boolean;
  raw: string;
}

export interface QuoteValidationResult {
  dealId: number;
  dealTitle: string;
  xeroQuoteId?: string;
  quoteNumber?: string;
  hasQuote: boolean;
  quoteStatus?: string;
  issues: ValidationIssue[];
}

export interface FieldValidation {
  field: string;
  value: any;
  isValid: boolean;
  issue?: ValidationIssue;
}

/**
 * Validates all Pipedrive deals within the provided validation context, checking title formats and required fields
 * 
 * @description Performs comprehensive validation on all deals in the context, including title format validation
 * and required field checks. Collects all validation issues found across all deals.
 * 
 * @param {PipedriveValidationContext} context - The validation context containing deals, quotes, projects and tenant config
 * @returns {ValidationIssue[]} Array of validation issues found across all deals
 * 
 * @example
 * ```typescript
 * const context = {
 *   pipedriveDeals: deals,
 *   xeroQuotes: quotes,
 *   xeroProjects: projects,
 *   tenantConfig: config
 * };
 * const issues = validatePipedriveDeals(context);
 * console.log(`Found ${issues.length} validation issues`);
 * ```
 * 
 * @since 1.0.0
 */
export function validatePipedriveDeals(context: PipedriveValidationContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  
  for (const deal of context.pipedriveDeals) {
    // Validate title format
    const titleValidation = validateDealTitle(deal);
    issues.push(...titleValidation.issues);
    
    // Validate required fields
    const fieldValidations = validateRequiredFields(deal, context.tenantConfig);
    fieldValidations.forEach(fv => {
      if (fv.issue) issues.push(fv.issue);
    });
  }
  
  return issues;
}

/**
 * Validates the title format of multiple Pipedrive deals for proper naming conventions
 * 
 * @description Checks each deal title against expected project code and vessel name patterns.
 * Supports both standard format (PROJECTCODE-VESSELNAME) and ED format (ED12345-middle-vessel).
 * 
 * @param {any[]} deals - Array of Pipedrive deal objects to validate
 * @returns {TitleValidationResult[]} Array of validation results for each deal title
 * 
 * @example
 * ```typescript
 * const deals = [{ id: 1, title: "ED12345-maintenance-VesselName" }];
 * const results = validateDealTitles(deals);
 * results.forEach(result => {
 *   if (!result.isValid) {
 *     console.log(`Deal ${result.dealId} has title issues:`, result.issues);
 *   }
 * });
 * ```
 * 
 * @since 1.0.0
 */
export function validateDealTitles(deals: any[]): TitleValidationResult[] {
  return deals.map(validateDealTitle);
}

function validateDealTitle(deal: any): TitleValidationResult {
  const title = deal.title || deal.name || '';
  const issues: ValidationIssue[] = [];
  const parsed = parseTitle(title);
  const normalized = normalizeTitle(title);
  
  // Check if title is empty
  if (!title) {
    issues.push({
      severity: 'error',
      code: 'EMPTY_TITLE',
      message: 'Deal has no title',
      dealId: deal.id,
      field: 'title'
    });
    return { dealId: deal.id, title, normalizedTitle: '', isValid: false, issues };
  }
  
  // Check for valid project code pattern
  if (!parsed.projectCode) {
    issues.push({
      severity: 'warning',
      code: 'INVALID_FORMAT',
      message: `Title "${title}" does not follow expected format (ProjectCode-VesselName)`,
      dealId: deal.id,
      dealTitle: title,
      field: 'title',
      suggestedFix: 'Use format like "ED12345-VesselName" or "MES2024001-VesselName"'
    });
  }
  
  // Check for vessel name
  if (!parsed.vesselName) {
    issues.push({
      severity: 'warning',
      code: 'MISSING_VESSEL',
      message: `Title "${title}" is missing vessel name`,
      dealId: deal.id,
      dealTitle: title,
      field: 'title'
    });
  }
  
  return {
    dealId: deal.id,
    title,
    normalizedTitle: normalized,
    isValid: issues.length === 0,
    issues,
    parsedComponents: parsed
  };
}

/**
 * Cross-references Pipedrive deals with Xero quotes to validate data consistency and linkage
 * 
 * @description Validates the relationship between Pipedrive deals and Xero quotes by checking:
 * - Whether deals have linked Xero quote IDs
 * - If linked quotes exist in Xero
 * - Quote status matches deal status (won deals should have ACCEPTED quotes)
 * - Deal values match quote totals within tolerance
 * 
 * @param {PipedriveValidationContext} context - Validation context with deals, quotes and tenant config
 * @returns {QuoteValidationResult[]} Array of quote validation results for each deal
 * 
 * @example
 * ```typescript
 * const context = { pipedriveDeals, xeroQuotes, xeroProjects, tenantConfig };
 * const results = crossReferenceQuotes(context);
 * const missingQuotes = results.filter(r => !r.hasQuote);
 * console.log(`${missingQuotes.length} deals have no linked quotes`);
 * ```
 * 
 * @since 1.0.0
 */
export function crossReferenceQuotes(context: PipedriveValidationContext): QuoteValidationResult[] {
  const results: QuoteValidationResult[] = [];
  const { customFieldKeys } = context.tenantConfig;
  
  // Log the custom field key we're looking for (only once)
  if (context.pipedriveDeals.length > 0) {
    const firstDeal = context.pipedriveDeals[0];
    const customFieldKeysInDeal = Object.keys(firstDeal).filter(k => k.length > 20);
    
    // Use a proper logger or store in results instead of console.log
    const debugInfo = {
      lookingForField: customFieldKeys.xeroQuoteId,
      sampleDealKeys: customFieldKeysInDeal.slice(0, 5),
      sampleValue: firstDeal[customFieldKeys.xeroQuoteId],
      hasQuoteField: customFieldKeys.xeroQuoteId in firstDeal
    };
    
    // Add debug info to first result
    if (!firstDeal[customFieldKeys.xeroQuoteId]) {
      results.push({
        dealId: 0,
        dealTitle: 'DEBUG INFO',
        hasQuote: false,
        issues: [{
          severity: 'info',
          code: 'DEBUG_FIELD_INFO',
          message: `Looking for field: ${customFieldKeys.xeroQuoteId}, Found fields: ${customFieldKeysInDeal.length} custom fields`,
          metadata: debugInfo
        }]
      });
    }
  }
  
  for (const deal of context.pipedriveDeals) {
    const issues: ValidationIssue[] = [];
    const xeroQuoteId = deal[customFieldKeys.xeroQuoteId];
    
    // Check if deal has Xero Quote ID
    if (!xeroQuoteId) {
      issues.push({
        severity: 'info',
        code: 'NO_QUOTE_LINKED',
        message: 'Deal has no Xero quote linked',
        dealId: deal.id,
        dealTitle: deal.title || deal.name,
        field: 'xeroQuoteId'
      });
      
      results.push({
        dealId: deal.id,
        dealTitle: deal.title || deal.name || '',
        hasQuote: false,
        issues
      });
      continue;
    }
    
    // Find matching quote in Xero
    const matchingQuote = context.xeroQuotes.find(q => q.QuoteID === xeroQuoteId);
    
    if (!matchingQuote) {
      issues.push({
        severity: 'error',
        code: 'QUOTE_NOT_FOUND',
        message: `Xero quote ${xeroQuoteId} not found in Xero`,
        dealId: deal.id,
        dealTitle: deal.title || deal.name,
        field: 'xeroQuoteId'
      });
    } else {
      // Check quote status
      if (deal.status === 'won' && matchingQuote.Status !== 'ACCEPTED') {
        issues.push({
          severity: 'warning',
          code: 'QUOTE_STATUS_MISMATCH',
          message: `Won deal has quote in status ${matchingQuote.Status} (expected ACCEPTED)`,
          dealId: deal.id,
          dealTitle: deal.title || deal.name,
          field: 'quoteStatus'
        });
      }
      
      // Check value match
      const dealValue = parseFloat(deal.value) || 0;
      const quoteTotal = parseFloat(matchingQuote.Total) || 0;
      const tolerance = 0.01; // 1 cent tolerance
      
      if (Math.abs(dealValue - quoteTotal) > tolerance) {
        issues.push({
          severity: 'warning',
          code: 'VALUE_MISMATCH',
          message: `Deal value (${dealValue}) doesn't match quote total (${quoteTotal})`,
          dealId: deal.id,
          dealTitle: deal.title || deal.name,
          field: 'value'
        });
      }
    }
    
    results.push({
      dealId: deal.id,
      dealTitle: deal.title || deal.name || '',
      xeroQuoteId,
      quoteNumber: matchingQuote?.QuoteNumber,
      hasQuote: true,
      quoteStatus: matchingQuote?.Status,
      issues
    });
  }
  
  return results;
}

/**
 * Validates that required custom fields are present and populated in a Pipedrive deal
 * 
 * @description Checks specific custom fields mapped in tenant configuration to ensure
 * critical business data is present. Currently validates vessel name field as required.
 * 
 * @param {any} deal - The Pipedrive deal object to validate
 * @param {TenantConfig} tenantConfig - Tenant configuration containing custom field mappings
 * @returns {FieldValidation[]} Array of field validation results
 * 
 * @example
 * ```typescript
 * const validations = validateRequiredFields(deal, tenantConfig);
 * const missingFields = validations.filter(v => !v.isValid);
 * missingFields.forEach(field => {
 *   console.log(`Missing required field: ${field.field}`);
 * });
 * ```
 * 
 * @since 1.0.0
 */
export function validateRequiredFields(deal: any, tenantConfig: TenantConfig): FieldValidation[] {
  const validations: FieldValidation[] = [];
  const { customFieldKeys } = tenantConfig;
  
  // Check vessel name field
  const vesselName = deal[customFieldKeys.vesselName];
  validations.push({
    field: 'vesselName',
    value: vesselName,
    isValid: !!vesselName,
    issue: !vesselName ? {
      severity: 'info' as const,
      code: 'MISSING_VESSEL_FIELD',
      message: 'Vessel name custom field is empty',
      dealId: deal.id,
      dealTitle: deal.title || deal.name,
      field: 'vesselName'
    } : undefined
  });
  
  return validations;
}

/**
 * Parses a deal title string into its component parts for validation and normalization
 * 
 * @description Extracts project code, vessel name, and other components from deal titles.
 * Handles multiple formats including:
 * - ED format: "ED12345-middle-vessel" where middle part is ignored
 * - Standard format: "PROJECTCODE-VESSELNAME"
 * - Removes duplicate numbers in parentheses
 * 
 * @param {string} title - The deal title string to parse
 * @returns {ParsedTitle} Object containing parsed components and metadata
 * 
 * @example
 * ```typescript
 * const parsed = parseTitle("ED12345-maintenance-VesselABC");
 * console.log(parsed.projectCode); // "ED12345"
 * console.log(parsed.vesselName);  // "VesselABC"
 * console.log(parsed.isEDFormat);  // true
 * ```
 * 
 * @since 1.0.0
 */
export function parseTitle(title: string): ParsedTitle {
  if (!title || typeof title !== 'string') {
    return { raw: title || '' };
  }
  
  const cleanTitle = title.replace(/\s*\(\d+\)\s*$/, '').trim();
  
  // Check for ED format (ED12345-middle-vessel)
  const edMatch = cleanTitle.match(/^(ED\d+)([-\s]+)(.+)$/i);
  if (edMatch) {
    const parts = edMatch[3].split(/[-\s]+/);
    // For ED format, skip middle part and take vessel name
    const vesselName = parts.length > 1 ? parts[parts.length - 1] : parts[0];
    
    return {
      projectCode: edMatch[1].toUpperCase(),
      vesselName: vesselName.trim(),
      separator: edMatch[2],
      isEDFormat: true,
      raw: title
    };
  }
  
  // Standard format (PROJECTCODE-VESSELNAME)
  const standardMatch = cleanTitle.match(/^([A-Z]+\d+)([-\s]+)(.+)$/i);
  if (standardMatch) {
    return {
      projectCode: standardMatch[1].toUpperCase(),
      vesselName: standardMatch[3].trim(),
      separator: standardMatch[2],
      isEDFormat: false,
      raw: title
    };
  }
  
  // No recognizable format
  return { raw: title };
}

/**
 * Normalizes ED format deal titles by removing middle segments and standardizing format
 * 
 * @description Converts ED format titles like "ED12345-middle-vessel" to standardized
 * "ED12345-vessel" format for consistent processing and matching.
 * 
 * @param {string} title - The deal title to normalize
 * @returns {string} Normalized title string, or original if not ED format
 * 
 * @example
 * ```typescript
 * const normalized = normalizeEDFormat("ED12345-maintenance-VesselABC");
 * console.log(normalized); // "ED12345-VesselABC"
 * 
 * const notED = normalizeEDFormat("MES2024001-VesselXYZ");
 * console.log(notED); // "MES2024001-VesselXYZ" (unchanged)
 * ```
 * 
 * @since 1.0.0
 */
export function normalizeEDFormat(title: string): string {
  const parsed = parseTitle(title);
  
  if (parsed.isEDFormat && parsed.projectCode && parsed.vesselName) {
    return `${parsed.projectCode}-${parsed.vesselName}`;
  }
  
  return title;
}

/**
 * Normalize title for comparison
 */
function normalizeTitle(title: string): string {
  const parsed = parseTitle(title);
  
  if (parsed.projectCode && parsed.vesselName) {
    // For ED format, normalize to ED[digits]-[vessel]
    if (parsed.isEDFormat) {
      return `${parsed.projectCode}-${parsed.vesselName}`.toLowerCase();
    }
    // For standard format, keep as is
    return `${parsed.projectCode}-${parsed.vesselName}`.toLowerCase();
  }
  
  // Fallback to simple normalization
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Generates a normalized project key from a deal title for cross-system matching
 * 
 * @description Creates a standardized key for matching deals with Xero projects.
 * The key is lowercase, alphanumeric only, and follows the pattern "code-projectname".
 * Compatible with ProjectSyncOrchestrator key generation logic.
 * 
 * @param {string} title - The deal title to generate a key from
 * @returns {string} Normalized project key for matching, empty string if invalid input
 * 
 * @example
 * ```typescript
 * const key1 = generateProjectKey("ED12345-Vessel Name");
 * console.log(key1); // "ed12345-vesselname"
 * 
 * const key2 = generateProjectKey("MES2024001 - Project ABC");
 * console.log(key2); // "mes2024001-projectabc"
 * 
 * // Use for matching with Xero projects
 * const matchingProject = projects.find(p => 
 *   generateProjectKey(p.name) === generateProjectKey(deal.title)
 * );
 * ```
 * 
 * @since 1.0.0
 */
export function generateProjectKey(title: string): string {
  if (!title || typeof title !== 'string') {
    return '';
  }
  
  const cleanName = title.replace(/\s*\(\d+\)\s*$/, '').trim();
  
  // Try to match project code pattern
  const projectCodeMatch = cleanName.match(/^([A-Z]+\d+)\s*[-\s]+\s*(.+)$/i);
  if (projectCodeMatch) {
    const code = projectCodeMatch[1].toLowerCase();
    const projectName = projectCodeMatch[2]
      .trim()
      .toLowerCase()
      .replace(/[^a-zA-Z0-9]+/g, '');
    return `${code}-${projectName}`;
  }
  
  // Handle compact format (e.g., "ED255007vessel")
  const compactMatch = cleanName.match(/^([A-Z]+\d+)([A-Za-z].*)$/);
  if (compactMatch) {
    const code = compactMatch[1].toLowerCase();
    const projectName = compactMatch[2]
      .toLowerCase()
      .replace(/[^a-zA-Z0-9]+/g, '');
    return `${code}-${projectName}`;
  }
  
  // Fallback to normalized entire name
  return cleanName
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]+/g, '')
    .trim();
}