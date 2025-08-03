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
  invoiceStageId?: number; // Stage ID for Invoice stage (e.g., 6 for tenant 6dd39ea4...)
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
  metadata?: any; // Additional data for specific issue types (quotes, etc.)
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
  isInvalid?: boolean;
  invalidReason?: string;
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
  
  // Validate deals in Invoice stage (if configured)
  const invoiceStageIssues = validateInvoiceStageDeals(context);
  issues.push(...invoiceStageIssues);
  
  // Validate orphaned accepted quotes
  const orphanedQuoteIssues = validateOrphanedAcceptedQuotes(context);
  issues.push(...orphanedQuoteIssues);
  
  // Validate accepted quote number format
  const quoteFormatIssues = validateAcceptedQuoteNumberFormat(context);
  issues.push(...quoteFormatIssues);
  
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
  
  // Check for common invalid patterns
  // 1. Titles starting with QU (quote number, not project)
  if (title.match(/^QU\d+/i)) {
    issues.push({
      severity: 'error',
      code: 'INVALID_TITLE_QUOTE_PREFIX',
      message: `Title "${title}" starts with quote number (QU) instead of project code`,
      dealId: deal.id,
      dealTitle: title,
      field: 'title',
      suggestedFix: 'Replace with format: PROJECTCODE-VESSELNAME (e.g., NY2594-VesselName)'
    });
  }
  
  // 2. Check for multiple numbers separated by spaces/dashes (invalid pattern)
  if (title.match(/^\w+[-\s]+\d{5,}[-\s]+\d{5,}/)) {
    issues.push({
      severity: 'error',
      code: 'INVALID_TITLE_NUMBER_SEQUENCE',
      message: `Title "${title}" contains invalid number sequences`,
      dealId: deal.id,
      dealTitle: title,
      field: 'title',
      suggestedFix: 'Use format: PROJECTCODE-VESSELNAME (e.g., ED12345-VesselName)'
    });
  }
  
  // 3. Check for "(copy)" suffix - DISABLED for now, allowed per business requirements
  // Keeping the code commented for future reference if needed
  /*
  if (title.includes('(copy)')) {
    issues.push({
      severity: 'warning',
      code: 'DUPLICATE_DEAL_TITLE',
      message: `Title "${title}" appears to be a duplicate (contains "copy")`,
      dealId: deal.id,
      dealTitle: title,
      field: 'title',
      suggestedFix: 'Remove "(copy)" and ensure unique project-vessel combination'
    });
  }
  */
  
  // Check for valid project code pattern (but exclude QU prefix)
  if (!parsed.projectCode || parsed.projectCode.startsWith('QU')) {
    issues.push({
      severity: 'error',
      code: 'INVALID_FORMAT',
      message: `Title "${title}" does not follow expected format (ProjectCode-VesselName)`,
      dealId: deal.id,
      dealTitle: title,
      field: 'title',
      suggestedFix: 'Use format like "ED12345-VesselName" or "NY2594-VesselName"'
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
  
  // Additional validation: vessel name shouldn't be just numbers
  if (parsed.vesselName && /^\d+$/.test(parsed.vesselName)) {
    issues.push({
      severity: 'error',
      code: 'INVALID_VESSEL_NAME',
      message: `Vessel name cannot be just numbers: "${parsed.vesselName}"`,
      dealId: deal.id,
      dealTitle: title,
      field: 'vesselName',
      suggestedFix: 'Vessel name should be a proper ship/vessel name, not a number'
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
    
    // Check both v1 (top-level) and v2 (custom_fields object) locations
    const customFieldsV2 = firstDeal.custom_fields || {};
    const customFieldKeysInDeal = Object.keys(firstDeal).filter(k => k.length > 20); // v1 API
    const customFieldKeysInV2 = Object.keys(customFieldsV2); // v2 API
    
    // Try to get the value from both locations
    const xeroQuoteIdValue = firstDeal.custom_fields?.[customFieldKeys.xeroQuoteId] || 
                            firstDeal[customFieldKeys.xeroQuoteId];
    
    // Also check what quotes we have
    const sampleQuotes = context.xeroQuotes.slice(0, 3).map(q => ({
      QuoteID: q.QuoteID,
      QuoteNumber: q.QuoteNumber,
      Reference: q.Reference
    }));
    
    // Use a proper logger or store in results instead of console.log
    const debugInfo = {
      lookingForField: customFieldKeys.xeroQuoteId,
      v1CustomFields: customFieldKeysInDeal.slice(0, 5),
      v2CustomFields: customFieldKeysInV2.slice(0, 5),
      sampleXeroQuoteIdValue: xeroQuoteIdValue,
      dealId: firstDeal.id,
      dealTitle: firstDeal.title || firstDeal.name,
      hasQuoteFieldV1: customFieldKeys.xeroQuoteId in firstDeal,
      hasQuoteFieldV2: customFieldKeys.xeroQuoteId in customFieldsV2,
      hasCustomFieldsObject: !!firstDeal.custom_fields,
      totalQuotesFromXero: context.xeroQuotes.length,
      sampleQuotesFromXero: sampleQuotes
    };
    
    // Always add debug info to help understand what's happening
    results.push({
      dealId: 0,
      dealTitle: 'DEBUG INFO',
      hasQuote: false,
      issues: [{
        severity: 'info',
        code: 'DEBUG_FIELD_INFO',
        message: `Debug: Looking for field ${customFieldKeys.xeroQuoteId}, Found ${context.xeroQuotes.length} quotes from Xero`,
        metadata: debugInfo
      }]
    });
  }
  
  for (const deal of context.pipedriveDeals) {
    const issues: ValidationIssue[] = [];
    // Try to get the custom field value from both v1 and v2 locations
    const xeroQuoteId = deal.custom_fields?.[customFieldKeys.xeroQuoteId] || 
                       deal[customFieldKeys.xeroQuoteId];
    
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
    // The xeroQuoteId field should contain the QuoteID (UUID) from Xero
    let matchingQuote = context.xeroQuotes.find(q => q.QuoteID === xeroQuoteId);
    
    if (!matchingQuote) {
      // Try to find by quote number if the field contains a quote number instead of ID
      const matchByNumber = context.xeroQuotes.find(q => q.QuoteNumber === xeroQuoteId);
      matchingQuote = matchByNumber; // Use this for result even if found by number
      
      if (matchByNumber) {
        issues.push({
          severity: 'warning',
          code: 'QUOTE_ID_MISMATCH',
          message: `Found quote by number ${xeroQuoteId} but should store QuoteID: ${matchByNumber.QuoteID}`,
          dealId: deal.id,
          dealTitle: deal.title || deal.name,
          field: 'xeroQuoteId',
          metadata: {
            currentValue: xeroQuoteId,
            expectedValue: matchByNumber.QuoteID,
            quoteNumber: matchByNumber.QuoteNumber
          }
        });
        // Use the found quote for further validation and result
        const quoteToValidate = matchByNumber;
        const foundQuote = matchByNumber; // Store for use in results
        
        // Check Reference field - more flexible check
        if (quoteToValidate.Reference) {
          const dealIdStr = deal.id.toString();
          const referenceContainsDealId = quoteToValidate.Reference.toLowerCase().includes(`deal id: ${dealIdStr}`) ||
                                         quoteToValidate.Reference.toLowerCase().includes(`deal id:${dealIdStr}`) ||
                                         quoteToValidate.Reference.includes(dealIdStr);
          
          if (!referenceContainsDealId) {
            issues.push({
              severity: 'info',
              code: 'REFERENCE_FORMAT',
              message: `Quote reference "${quoteToValidate.Reference}" doesn't contain deal ID ${dealIdStr}`,
              dealId: deal.id,
              dealTitle: deal.title || deal.name,
              field: 'reference'
            });
          }
        }
        
        // Check quote status
        if (deal.status === 'won' && quoteToValidate.Status !== 'ACCEPTED') {
          issues.push({
            severity: 'warning',
            code: 'QUOTE_STATUS_MISMATCH',
            message: `Won deal has quote in status ${quoteToValidate.Status} (expected ACCEPTED)`,
            dealId: deal.id,
            dealTitle: deal.title || deal.name,
            field: 'quoteStatus'
          });
        }
      } else {
        issues.push({
          severity: 'error',
          code: 'QUOTE_NOT_FOUND',
          message: `Xero quote with ID or Number "${xeroQuoteId}" not found in Xero`,
          dealId: deal.id,
          dealTitle: deal.title || deal.name,
          field: 'xeroQuoteId'
        });
      }
    } else {
      // Found quote by ID - validate it
      
      // Check Reference field - should contain the deal ID (case-insensitive)
      if (matchingQuote.Reference) {
        // Make the check more flexible - just check if it contains the deal ID
        const dealIdStr = deal.id.toString();
        const referenceContainsDealId = matchingQuote.Reference.toLowerCase().includes(`deal id: ${dealIdStr}`) ||
                                       matchingQuote.Reference.toLowerCase().includes(`deal id:${dealIdStr}`) ||
                                       matchingQuote.Reference.includes(dealIdStr);
        
        if (!referenceContainsDealId) {
          issues.push({
            severity: 'info', // Downgrade to info since this is not critical
            code: 'REFERENCE_FORMAT',
            message: `Quote reference "${matchingQuote.Reference}" doesn't contain deal ID ${dealIdStr}`,
            dealId: deal.id,
            dealTitle: deal.title || deal.name,
            field: 'reference'
          });
        }
      } else {
        issues.push({
          severity: 'info',
          code: 'MISSING_REFERENCE',
          message: 'Quote has no reference to Pipedrive Deal ID',
          dealId: deal.id,
          dealTitle: deal.title || deal.name,
          field: 'reference'
        });
      }
      
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
          message: `Deal value ($${dealValue.toFixed(2)}) doesn't match quote total ($${quoteTotal.toFixed(2)})`,
          dealId: deal.id,
          dealTitle: deal.title || deal.name,
          field: 'value',
          metadata: {
            dealValue,
            quoteTotal,
            difference: Math.abs(dealValue - quoteTotal)
          }
        });
      }
      
      // Check organization match
      if (deal.org_name && matchingQuote.Contact?.Name) {
        const dealOrg = deal.org_name.toLowerCase().trim();
        const quoteOrg = matchingQuote.Contact.Name.toLowerCase().trim();
        
        if (!dealOrg.includes(quoteOrg) && !quoteOrg.includes(dealOrg)) {
          issues.push({
            severity: 'warning',
            code: 'ORGANIZATION_MISMATCH',
            message: `Deal organization "${deal.org_name}" doesn't match quote contact "${matchingQuote.Contact.Name}"`,
            dealId: deal.id,
            dealTitle: deal.title || deal.name,
            field: 'organization'
          });
        }
      }
      
      // Check products/line items match if available
      if (deal.products_count && matchingQuote.LineItems) {
        const dealProductCount = parseInt(deal.products_count) || 0;
        const quoteLineItemCount = matchingQuote.LineItems.length;
        
        if (dealProductCount !== quoteLineItemCount) {
          issues.push({
            severity: 'info',
            code: 'LINE_ITEM_COUNT_MISMATCH',
            message: `Deal has ${dealProductCount} products but quote has ${quoteLineItemCount} line items`,
            dealId: deal.id,
            dealTitle: deal.title || deal.name,
            field: 'lineItems'
          });
        }
      }
    }
    
    results.push({
      dealId: deal.id,
      dealTitle: deal.title || deal.name || '',
      xeroQuoteId,
      quoteNumber: matchingQuote?.QuoteNumber,
      hasQuote: !!matchingQuote,
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
  
  // Check vessel name field (try both v1 and v2 locations)
  const vesselName = deal.custom_fields?.[customFieldKeys.vesselName] || 
                    deal[customFieldKeys.vesselName];
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
 * Validates that deals in the Invoice stage have corresponding quotes with INVOICED status
 * 
 * @description Checks deals in the configured Invoice stage to ensure their linked Xero quotes
 * are in the correct status (INVOICED). Quotes in DRAFT, SENT, or ACCEPTED status indicate
 * the deal hasn't been properly invoiced yet.
 * 
 * @param {PipedriveValidationContext} context - Validation context with deals, quotes and tenant config
 * @returns {ValidationIssue[]} Array of validation issues for deals with incorrect quote status
 * 
 * @example
 * ```typescript
 * const issues = validateInvoiceStageDeals(context);
 * issues.forEach(issue => {
 *   console.log(`Deal ${issue.dealId} has quote in wrong status`);
 * });
 * ```
 * 
 * @since 1.0.0
 */
export function validateInvoiceStageDeals(context: PipedriveValidationContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { customFieldKeys, invoiceStageId } = context.tenantConfig;
  
  // Skip if no invoice stage configured for this tenant
  if (!invoiceStageId) {
    return issues;
  }
  
  // Filter deals that are in the Invoice stage
  const invoiceStageDeals = context.pipedriveDeals.filter(deal => 
    deal.stage_id === invoiceStageId
  );
  
  for (const deal of invoiceStageDeals) {
    // Get the Xero Quote ID from the deal
    const xeroQuoteId = deal.custom_fields?.[customFieldKeys.xeroQuoteId] || 
                       deal[customFieldKeys.xeroQuoteId];
    
    if (!xeroQuoteId) {
      // Deal in Invoice stage should have a quote
      issues.push({
        severity: 'error',
        code: 'INVOICE_STAGE_NO_QUOTE',
        message: `Deal in Invoice stage has no linked Xero quote`,
        dealId: deal.id,
        dealTitle: deal.title || deal.name,
        field: 'xeroQuoteId',
        suggestedFix: 'Link a Xero quote before moving deal to Invoice stage'
      });
      continue;
    }
    
    // Find the matching quote
    const matchingQuote = context.xeroQuotes.find(q => 
      q.QuoteID === xeroQuoteId || q.QuoteNumber === xeroQuoteId
    );
    
    if (!matchingQuote) {
      issues.push({
        severity: 'error',
        code: 'INVOICE_STAGE_QUOTE_NOT_FOUND',
        message: `Deal in Invoice stage references non-existent quote ${xeroQuoteId}`,
        dealId: deal.id,
        dealTitle: deal.title || deal.name,
        field: 'xeroQuoteId'
      });
      continue;
    }
    
    // Check if the quote is in INVOICED status
    if (matchingQuote.Status !== 'INVOICED') {
      issues.push({
        severity: 'error',
        code: 'INVOICE_STAGE_WRONG_STATUS',
        message: `Deal in Invoice stage but quote is in ${matchingQuote.Status} status (should be INVOICED)`,
        dealId: deal.id,
        dealTitle: deal.title || deal.name,
        field: 'quoteStatus',
        suggestedFix: `Convert quote ${matchingQuote.QuoteNumber} to invoice in Xero`,
        metadata: {
          quoteId: matchingQuote.QuoteID,
          quoteNumber: matchingQuote.QuoteNumber,
          currentStatus: matchingQuote.Status,
          expectedStatus: 'INVOICED'
        }
      });
    }
  }
  
  return issues;
}

/**
 * Validates that accepted Xero quotes follow the correct naming convention
 * 
 * @description Checks that accepted quotes follow the format PROJECTNUMBER-QUNUMBER-VERSION
 * Examples of valid formats:
 * - NY2594-QU22554-1
 * - NY2450-QU19757-1-v2
 * - ED12345-QU00123-2
 * 
 * Invalid formats that will be flagged:
 * - QU0349-v2 (missing project number)
 * - QU0349 (missing all components)
 * - NY2594-22554-1 (missing QU prefix)
 * 
 * @param {PipedriveValidationContext} context - Validation context with deals, quotes and tenant config
 * @returns {ValidationIssue[]} Array of validation issues for incorrectly formatted quote numbers
 * 
 * @since 1.0.0
 */
export function validateAcceptedQuoteNumberFormat(context: PipedriveValidationContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  
  // Get all accepted quotes
  const acceptedQuotes = context.xeroQuotes.filter(quote => quote.Status === 'ACCEPTED');
  
  // Regular expression for valid quote number format
  // Pattern: PROJECTNUMBER-QUNUMBER-VERSION or PROJECTNUMBER-QUNUMBER-VERSION-vN
  // Valid examples: 
  //   - NY2594-QU22554-1
  //   - NY2450-QU19757-1-v2
  //   - ED12345-QU00123-2
  //   - MES2024-QU123-1
  // Project codes: Letters followed by numbers (e.g., NY, ED, MES, PO, WO, SO, JO)
  const validQuotePattern = /^[A-Z]+\d+[-]QU\d+[-]\d+(?:[-]v\d+)?$/i;
  
  // Alternative patterns to identify common mistakes
  const missingProjectPattern = /^QU\d+[-](?:v\d+|\d+)$/i; // e.g., QU0349-v2
  const missingQUPrefixPattern = /^[A-Z]+\d+[-]\d+[-]\d+$/i; // e.g., NY2594-22554-1 (missing QU)
  const oldVersionPattern = /^QU\d+$/i; // e.g., QU0349
  
  for (const quote of acceptedQuotes) {
    const quoteNumber = quote.QuoteNumber;
    
    if (!quoteNumber) {
      issues.push({
        severity: 'error',
        code: 'ACCEPTED_QUOTE_NO_NUMBER',
        message: `Accepted quote ${quote.QuoteID} has no quote number`,
        field: 'quoteNumber',
        suggestedFix: 'Add a quote number in format PROJECTNUMBER-QUNUMBER-VERSION'
      });
      continue;
    }
    
    // Check if quote number matches the valid pattern
    if (!validQuotePattern.test(quoteNumber)) {
      let suggestedFix = 'Update quote number to format: PROJECTNUMBER-QUNUMBER-VERSION (e.g., NY2594-QU22554-1)';
      let specificIssue = 'Invalid format';
      
      // Identify specific issue
      if (missingProjectPattern.test(quoteNumber)) {
        specificIssue = 'Missing project number prefix';
        suggestedFix = `Add project number prefix to quote (e.g., NY2594-${quoteNumber})`;
      } else if (missingQUPrefixPattern.test(quoteNumber)) {
        specificIssue = 'Missing QU prefix in quote number';
        suggestedFix = 'Add QU prefix to the quote number section';
      } else if (oldVersionPattern.test(quoteNumber)) {
        specificIssue = 'Old format - missing project and version';
        suggestedFix = `Update to new format (e.g., NY2594-${quoteNumber}-1)`;
      } else if (quoteNumber.includes('v') && !quoteNumber.match(/[-]v\d+$/)) {
        specificIssue = 'Version suffix incorrectly formatted';
        suggestedFix = 'Version should be at the end in format -vN (e.g., -v2)';
      }
      
      issues.push({
        severity: 'error',
        code: 'ACCEPTED_QUOTE_INVALID_FORMAT',
        message: `Accepted quote ${quoteNumber} has invalid format: ${specificIssue}`,
        field: 'quoteNumber',
        suggestedFix: suggestedFix,
        metadata: {
          quoteId: quote.QuoteID,
          quoteNumber: quote.QuoteNumber,
          currentFormat: quoteNumber,
          expectedPattern: 'PROJECTNUMBER-QUNUMBER-VERSION',
          exampleFormat: 'NY2594-QU22554-1 or NY2450-QU19757-1-v2',
          contactName: quote.Contact?.Name,
          quoteTotal: quote.Total
        }
      });
    }
  }
  
  return issues;
}

/**
 * Validates accepted quotes to find orphaned or incorrectly linked quotes
 * 
 * @description Identifies accepted quotes that are:
 * 1. Not linked to any Pipedrive deal (orphaned)
 * 2. Linked to deals that are not in the "in progress" stages
 * 3. Have value mismatches with linked deals
 * This helps identify discrepancies between Xero quote values and Pipedrive deal values
 * 
 * @param {PipedriveValidationContext} context - Validation context with deals, quotes and tenant config
 * @returns {ValidationIssue[]} Array of validation issues for orphaned or incorrectly linked quotes
 * 
 * @example
 * ```typescript
 * const issues = validateOrphanedAcceptedQuotes(context);
 * issues.forEach(issue => {
 *   console.log(`Quote ${issue.quoteNumber} is orphaned or incorrectly linked`);
 * });
 * ```
 * 
 * @since 1.0.0
 */
export function validateOrphanedAcceptedQuotes(context: PipedriveValidationContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { customFieldKeys } = context.tenantConfig;
  
  // Get all accepted quotes
  const acceptedQuotes = context.xeroQuotes.filter(quote => quote.Status === 'ACCEPTED');
  
  // Get all in-progress stage IDs (all stages except archived/lost/won)
  // For now, we consider all deals in the configured pipelines as "in progress"
  const inProgressPipelineIds = context.tenantConfig.pipelineIds;
  
  for (const quote of acceptedQuotes) {
    const quoteId = quote.QuoteID;
    const quoteNumber = quote.QuoteNumber;
    
    // Check if quote's Reference field mentions a Pipedrive Deal ID
    let referencedDealId: number | null = null;
    if (quote.Reference) {
      // Look for patterns like "Pipedrive Deal Id: 189" or "Deal ID: 189"
      const dealIdMatch = quote.Reference.match(/(?:Pipedrive\s+)?Deal\s+I[dD]:\s*(\d+)/i);
      if (dealIdMatch) {
        referencedDealId = parseInt(dealIdMatch[1], 10);
      }
    }
    
    // Find deals that reference this quote OR that are referenced by the quote
    const linkedDeals = context.pipedriveDeals.filter(deal => {
      // Check if deal has quote ID in custom field
      const xeroQuoteId = deal.custom_fields?.[customFieldKeys.xeroQuoteId] || 
                         deal[customFieldKeys.xeroQuoteId];
      if (xeroQuoteId === quoteId || xeroQuoteId === quoteNumber) {
        return true;
      }
      
      // Check if quote references this deal ID
      if (referencedDealId && deal.id === referencedDealId) {
        return true;
      }
      
      return false;
    });
    
    if (linkedDeals.length === 0) {
      // Only mark as orphaned if there's no reference to a deal ID in the quote
      if (!referencedDealId) {
        issues.push({
          severity: 'warning',
          code: 'ORPHANED_ACCEPTED_QUOTE',
          message: `Accepted quote ${quoteNumber} (${quote.Contact?.Name || 'Unknown'}) is not linked to any Pipedrive deal`,
          field: 'quoteLink',
          suggestedFix: 'Create a Pipedrive deal for this accepted quote or update the quote status if it\'s no longer active',
          metadata: {
            quoteId: quote.QuoteID,
            quoteNumber: quote.QuoteNumber,
            quoteTotal: quote.Total,
            contactName: quote.Contact?.Name,
            reference: quote.Reference
          }
        });
      } else {
        // Quote references a deal ID that doesn't exist in our fetched deals
        issues.push({
          severity: 'error',
          code: 'QUOTE_REFERENCES_MISSING_DEAL',
          message: `Accepted quote ${quoteNumber} references Deal ID ${referencedDealId} which was not found in Pipedrive`,
          field: 'quoteLink',
          suggestedFix: `Check if Deal ${referencedDealId} exists in Pipedrive or if it's in a different pipeline`,
          metadata: {
            quoteId: quote.QuoteID,
            quoteNumber: quote.QuoteNumber,
            quoteTotal: quote.Total,
            contactName: quote.Contact?.Name,
            reference: quote.Reference,
            referencedDealId: referencedDealId
          }
        });
      }
    } else {
      // Check if linked deals are in progress pipelines
      for (const deal of linkedDeals) {
        // Check if deal is in one of the configured pipelines
        const isInProgressPipeline = inProgressPipelineIds.includes(deal.pipeline_id);
        
        if (!isInProgressPipeline) {
          issues.push({
            severity: 'warning',
            code: 'ACCEPTED_QUOTE_WRONG_PIPELINE',
            message: `Accepted quote ${quoteNumber} is linked to deal "${deal.title || deal.name}" which is not in a work-in-progress pipeline`,
            dealId: deal.id,
            dealTitle: deal.title || deal.name,
            field: 'pipeline',
            suggestedFix: 'Move the deal to a work-in-progress pipeline or update the quote status if work is complete',
            metadata: {
              quoteId: quote.QuoteID,
              quoteNumber: quote.QuoteNumber,
              quoteTotal: quote.Total,
              dealPipelineId: deal.pipeline_id,
              expectedPipelineIds: inProgressPipelineIds
            }
          });
        }
        
        // Check if deal is lost (lost deals shouldn't have accepted quotes)
        if (deal.status === 'lost') {
          issues.push({
            severity: 'warning',
            code: 'ACCEPTED_QUOTE_LOST_DEAL',
            message: `Accepted quote ${quoteNumber} is linked to a lost deal "${deal.title || deal.name}"`,
            dealId: deal.id,
            dealTitle: deal.title || deal.name,
            field: 'dealStatus',
            suggestedFix: 'Update the quote to DECLINED or DELETED status since the deal is lost',
            metadata: {
              quoteId: quote.QuoteID,
              quoteNumber: quote.QuoteNumber,
              dealStatus: deal.status
            }
          });
        }
        // Note: Won deals with accepted quotes are OK - they're in progress towards invoicing
        // The error only occurs if they're in the Invoice stage (stage 6) without being invoiced
        // That validation is handled by validateInvoiceStageDeals()
        
        // IMPORTANT: Value validation for quotes that reference deals
        // Check if quote total matches deal value (with tolerance)
        const quoteTotal = quote.Total || 0;
        const dealValue = deal.value || 0;
        
        // Handle currency conversion if needed
        let normalizedDealValue = dealValue;
        if (deal.currency && deal.currency !== 'SGD') {
          // If deal has SGD prefix in value display but stored differently
          // This is a simplification - in production you'd want proper currency conversion
          normalizedDealValue = dealValue;
        }
        
        // Check for value mismatch (allowing 10% tolerance for rounding/tax differences)
        const tolerance = 0.1; // 10% tolerance
        const valueDifference = Math.abs(quoteTotal - normalizedDealValue);
        const percentageDifference = normalizedDealValue > 0 ? valueDifference / normalizedDealValue : 0;
        
        if (percentageDifference > tolerance && valueDifference > 1) { // Ignore tiny differences
          issues.push({
            severity: 'warning',
            code: 'VALUE_MISMATCH',
            message: `Quote ${quoteNumber} total (${quoteTotal.toLocaleString()}) doesn't match deal "${deal.title || deal.name}" value (${deal.currency || ''}${normalizedDealValue.toLocaleString()})`,
            dealId: deal.id,
            dealTitle: deal.title || deal.name,
            field: 'value',
            suggestedFix: `Align the quote total with the deal value or verify the discrepancy is intentional`,
            metadata: {
              quoteId: quote.QuoteID,
              quoteNumber: quote.QuoteNumber,
              quoteTotal: quoteTotal,
              dealValue: normalizedDealValue,
              dealCurrency: deal.currency,
              difference: valueDifference,
              percentageDifference: Math.round(percentageDifference * 100)
            }
          });
        }
      }
    }
  }
  
  return issues;
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
  
  const cleanTitle = title.replace(/\s*\(\d+\)\s*$/, '').replace(/\s*\(copy\)\s*$/i, '').trim();
  
  // IMPORTANT: Reject titles starting with QU (quote numbers)
  if (cleanTitle.match(/^QU\d+/i)) {
    return { 
      raw: title,
      isInvalid: true,
      invalidReason: 'Starts with quote number instead of project code'
    };
  }
  
  // Check for ED format (ED12345-middle-vessel)
  const edMatch = cleanTitle.match(/^(ED\d+)([-\s]+)(.+)$/i);
  if (edMatch) {
    const parts = edMatch[3].split(/[-\s]+/);
    // For ED format, skip middle part and take vessel name
    const vesselName = parts.length > 1 ? parts[parts.length - 1] : parts[0];
    
    // Validate vessel name is not just numbers
    if (/^\d+$/.test(vesselName)) {
      return {
        projectCode: edMatch[1].toUpperCase(),
        raw: title,
        isInvalid: true,
        invalidReason: 'Vessel name is just numbers'
      };
    }
    
    return {
      projectCode: edMatch[1].toUpperCase(),
      vesselName: vesselName.trim(),
      separator: edMatch[2],
      isEDFormat: true,
      raw: title
    };
  }
  
  // Standard format (PROJECTCODE-VESSELNAME)
  // But exclude patterns like NY, MES, etc. Common project prefixes
  const standardMatch = cleanTitle.match(/^((?:NY|MES|ED|PO|WO|SO|JO)\d+)([-\s]+)(.+)$/i);
  if (standardMatch) {
    const vesselName = standardMatch[3].trim();
    
    // Validate vessel name is not just numbers
    if (/^\d+$/.test(vesselName)) {
      return {
        projectCode: standardMatch[1].toUpperCase(),
        raw: title,
        isInvalid: true,
        invalidReason: 'Vessel name is just numbers'
      };
    }
    
    return {
      projectCode: standardMatch[1].toUpperCase(),
      vesselName: vesselName,
      separator: standardMatch[2],
      isEDFormat: false,
      raw: title
    };
  }
  
  // No recognizable format
  return { 
    raw: title,
    isInvalid: true,
    invalidReason: 'Does not match expected format'
  };
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