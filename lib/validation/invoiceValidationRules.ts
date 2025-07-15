import { ValidationIssue } from './dealValidationRules';

export interface XeroInvoice {
  InvoiceID: string;
  InvoiceNumber: string;
  Reference?: string;
  Status: string;
  Total: number;
  CurrencyCode: string;
  Contact?: {
    ContactID: string;
    Name: string;
  };
}

export interface InvoiceValidationResult {
  dealId: string;
  dealTitle: string;
  dealValue: number;
  dealCurrency: string;
  invoiceId?: string;
  invoiceNumber?: string;
  xeroInvoice?: XeroInvoice;
  validationIssues: ValidationIssue[];
}

export interface Phase2InvoiceValidationStats {
  totalPipeline3Deals: number;
  dealsWithInvoiceId: number;
  dealsWithoutInvoiceId: number;
  invoicesFound: number;
  invoicesNotFound: number;
  invoiceValueMatches: number;
  invoiceValueMismatches: number;
  totalDealsValue: number;
  totalInvoicesValue: number;
  valueDifference: number;
}

/**
 * Validate Pipeline 3 deal - check if it has invoice and validate against Xero
 */
export async function validateDealInvoice(
  deal: any,
  invoiceFieldKey: string,
  accessToken: string,
  tenantId: string
): Promise<InvoiceValidationResult> {
  const issues: ValidationIssue[] = [];
  
  const result: InvoiceValidationResult = {
    dealId: deal.id,
    dealTitle: deal.title,
    dealValue: deal.value,
    dealCurrency: deal.currency,
    validationIssues: issues
  };
  
  // Check if deal has invoice ID
  const invoiceId = deal.custom_fields?.[invoiceFieldKey];
  
  if (!invoiceId) {
    issues.push({
      code: 'INVOICE_ID_MISSING',
      severity: 'error',
      message: 'Pipeline 3 deal has no invoice ID',
      field: 'invoiceId',
      currentValue: 'None',
      expectedValue: 'Valid Invoice ID',
      fixable: false
    });
    return result;
  }
  
  result.invoiceId = invoiceId;
  
  // Fetch invoice from Xero
  try {
    const invoiceUrl = `https://api.xero.com/api.xro/2.0/Invoices/${invoiceId}`;
    const response = await fetch(invoiceUrl, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'Xero-tenant-id': tenantId
      }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        issues.push({
          code: 'INVOICE_NOT_FOUND',
          severity: 'error',
          message: `Invoice ${invoiceId} not found in Xero`,
          field: 'invoiceId',
          currentValue: invoiceId,
          fixable: false
        });
      } else {
        issues.push({
          code: 'INVOICE_FETCH_ERROR',
          severity: 'error',
          message: `Failed to fetch invoice from Xero: ${response.status}`,
          field: 'invoiceId',
          currentValue: invoiceId,
          fixable: false
        });
      }
      return result;
    }
    
    const invoiceData = await response.json();
    
    if (invoiceData.Status === 'OK' && invoiceData.Invoices && invoiceData.Invoices.length > 0) {
      const xeroInvoice = invoiceData.Invoices[0];
      result.xeroInvoice = xeroInvoice;
      result.invoiceNumber = xeroInvoice.InvoiceNumber;
      
      // Validate invoice status
      if (xeroInvoice.Status !== 'AUTHORISED' && xeroInvoice.Status !== 'PAID') {
        issues.push({
          code: 'INVOICE_STATUS_INVALID',
          severity: 'warning',
          message: `Invoice status is ${xeroInvoice.Status}, should be AUTHORISED or PAID`,
          field: 'status',
          currentValue: xeroInvoice.Status,
          expectedValue: 'AUTHORISED or PAID',
          fixable: false
        });
      }
      
      // Validate value match
      const invoiceTotalRounded = Math.round(xeroInvoice.Total * 100) / 100;
      const dealValueRounded = Math.round(deal.value * 100) / 100;
      
      if (Math.abs(invoiceTotalRounded - dealValueRounded) > 0.01) {
        issues.push({
          code: 'INVOICE_VALUE_MISMATCH',
          severity: 'error',
          message: `Invoice value (${xeroInvoice.CurrencyCode} ${invoiceTotalRounded}) doesn't match deal value (${deal.currency} ${dealValueRounded})`,
          field: 'value',
          currentValue: invoiceTotalRounded.toString(),
          expectedValue: dealValueRounded.toString(),
          fixable: false
        });
      }
      
      // Validate currency match
      if (xeroInvoice.CurrencyCode !== deal.currency) {
        issues.push({
          code: 'INVOICE_CURRENCY_MISMATCH',
          severity: 'error',
          message: `Invoice currency (${xeroInvoice.CurrencyCode}) doesn't match deal currency (${deal.currency})`,
          field: 'currency',
          currentValue: xeroInvoice.CurrencyCode,
          expectedValue: deal.currency,
          fixable: false
        });
      }
      
      // Check organization match
      if (deal.org_name && xeroInvoice.Contact?.Name) {
        const dealOrgName = deal.org_name.toLowerCase().trim();
        const invoiceContactName = xeroInvoice.Contact.Name.toLowerCase().trim();
        
        if (!dealOrgName.includes(invoiceContactName) && !invoiceContactName.includes(dealOrgName)) {
          issues.push({
            code: 'INVOICE_CUSTOMER_MISMATCH',
            severity: 'warning',
            message: 'Organization name might not match invoice contact',
            field: 'org_name',
            currentValue: deal.org_name,
            expectedValue: xeroInvoice.Contact.Name,
            fixable: false
          });
        }
      }
    }
  } catch (error) {
    issues.push({
      code: 'INVOICE_VALIDATION_ERROR',
      severity: 'error',
      message: `Error validating invoice: ${error instanceof Error ? error.message : 'Unknown error'}`,
      field: 'invoice',
      currentValue: invoiceId,
      fixable: false
    });
  }
  
  return result;
}

/**
 * Perform Phase 2 validation - validate Pipeline 3 deals invoices
 */
export async function validatePipeline3Invoices(
  deals: any[],
  invoiceFieldKey: string,
  accessToken: string,
  tenantId: string
): Promise<{
  deals: InvoiceValidationResult[];
  stats: Phase2InvoiceValidationStats;
}> {
  const validatedDeals: InvoiceValidationResult[] = [];
  
  // Validate each deal
  for (const deal of deals) {
    const validationResult = await validateDealInvoice(
      deal,
      invoiceFieldKey,
      accessToken,
      tenantId
    );
    validatedDeals.push(validationResult);
  }
  
  // Calculate statistics
  const dealsWithInvoiceId = validatedDeals.filter(d => d.invoiceId).length;
  const dealsWithoutInvoiceId = validatedDeals.filter(d => !d.invoiceId).length;
  const invoicesFound = validatedDeals.filter(d => d.xeroInvoice).length;
  const invoicesNotFound = validatedDeals.filter(d => 
    d.invoiceId && !d.xeroInvoice
  ).length;
  
  const invoiceValueMatches = validatedDeals.filter(d => 
    d.xeroInvoice && !d.validationIssues.some(i => i.code === 'INVOICE_VALUE_MISMATCH')
  ).length;
  
  const invoiceValueMismatches = validatedDeals.filter(d => 
    d.validationIssues.some(i => i.code === 'INVOICE_VALUE_MISMATCH')
  ).length;
  
  const totalDealsValue = deals.reduce((sum, d) => sum + d.value, 0);
  const totalInvoicesValue = validatedDeals
    .filter(d => d.xeroInvoice)
    .reduce((sum, d) => sum + (d.xeroInvoice?.Total || 0), 0);
  
  const stats: Phase2InvoiceValidationStats = {
    totalPipeline3Deals: deals.length,
    dealsWithInvoiceId,
    dealsWithoutInvoiceId,
    invoicesFound,
    invoicesNotFound,
    invoiceValueMatches,
    invoiceValueMismatches,
    totalDealsValue: Math.round(totalDealsValue * 100) / 100,
    totalInvoicesValue: Math.round(totalInvoicesValue * 100) / 100,
    valueDifference: Math.round((totalDealsValue - totalInvoicesValue) * 100) / 100
  };
  
  return {
    deals: validatedDeals,
    stats
  };
}