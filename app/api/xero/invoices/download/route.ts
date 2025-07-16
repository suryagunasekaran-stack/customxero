import { NextRequest, NextResponse } from 'next/server';
import { ensureValidToken } from '@/lib/ensureXeroToken';
import { trackXeroApiCall } from '@/lib/xeroApiTracker';
import { SmartRateLimit } from '@/lib/smartRateLimit';
import * as XLSX from 'xlsx';

interface XeroInvoice {
  InvoiceID: string;
  Type: string;
  InvoiceNumber: string;
  Reference?: string;
  Status: string;
  LineAmountTypes?: string;
  SubTotal?: number;
  TotalTax?: number;
  Total?: number;
  AmountDue?: number;
  AmountPaid?: number;
  AmountCredited?: number;
  CurrencyCode?: string;
  IsDiscounted?: boolean;
  HasAttachments?: boolean;
  HasErrors?: boolean;
  DateString?: string;
  Date?: string;
  DueDateString?: string;
  DueDate?: string;
  UpdatedDateUTC?: string;
  Contact?: {
    ContactID: string;
    Name: string;
  };
  LineItems?: Array<{
    Description?: string;
    Quantity?: number;
    UnitAmount?: number;
    TaxType?: string;
    TaxAmount?: number;
    LineAmount?: number;
    AccountCode?: string;
  }>;
}

interface InvoicesResponse {
  Invoices: XeroInvoice[];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'excel'; // Default to Excel
    
    const tokenData = await ensureValidToken();
    const allInvoices: XeroInvoice[] = [];
    let page = 1;
    const pageSize = 100; // Xero recommended page size
    let hasMorePages = true;

    console.log('[Invoices Download] Starting invoice fetch process...');

    // Fetch all pages of invoices
    while (hasMorePages) {
      // Use optimized query with paging to avoid 100k limit
      // Filter for ACCREC (sales invoices) only, excluding ACCPAY (bills/purchase invoices)
      const url = `https://api.xero.com/api.xro/2.0/Invoices?where=Type%3D%22ACCREC%22&page=${page}&pageSize=${pageSize}&order=UpdatedDateUTC DESC`;
      
      await SmartRateLimit.waitIfNeeded();
      
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'Xero-tenant-id': tokenData.effective_tenant_id,
          Accept: 'application/json',
        },
      });

      await trackXeroApiCall(tokenData.effective_tenant_id);
      SmartRateLimit.updateFromHeaders(res.headers);

      if (!res.ok) {
        const errorData = await res.json();
        console.error('[Invoices Download] API Error:', errorData);
        return NextResponse.json(
          { error: `Failed to fetch invoices: ${res.status}`, details: errorData },
          { status: res.status }
        );
      }

      const data: InvoicesResponse = await res.json();
      
      // Add invoices from this page
      if (data.Invoices && data.Invoices.length > 0) {
        allInvoices.push(...data.Invoices);
        console.log(`[Invoices Download] Fetched page ${page} with ${data.Invoices.length} invoices. Total so far: ${allInvoices.length}`);
        
        // If we got a full page, there might be more
        if (data.Invoices.length === pageSize) {
          page++;
        } else {
          hasMorePages = false;
        }
      } else {
        hasMorePages = false;
      }

      // Safety check to prevent infinite loops
      if (allInvoices.length > 90000) {
        console.warn('[Invoices Download] Approaching 100k limit, stopping pagination');
        hasMorePages = false;
      }
    }

    console.log(`[Invoices Download] Fetch complete. Total invoices: ${allInvoices.length}`);

    // Create filename with timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    
    if (format === 'json') {
      // Return JSON format
      const jsonData = {
        metadata: {
          exportDate: new Date().toISOString(),
          tenantId: tokenData.effective_tenant_id,
          totalInvoices: allInvoices.length,
          totalValue: allInvoices.reduce((sum, inv) => sum + (inv.Total || 0), 0),
          totalDue: allInvoices.reduce((sum, inv) => sum + (inv.AmountDue || 0), 0),
          currencies: [...new Set(allInvoices.map(inv => inv.CurrencyCode).filter(Boolean))]
        },
        invoices: allInvoices
      };

      const filename = `xero-invoices-${timestamp}.json`;
      
      return new NextResponse(JSON.stringify(jsonData, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    } else {
      // Create Excel workbook
      const wb = XLSX.utils.book_new();
      
      // Transform invoices data for Excel
      const excelData = allInvoices.map(invoice => ({
        'Invoice Number': invoice.InvoiceNumber || '',
        'Type': invoice.Type || '',
        'Status': invoice.Status || '',
        'Contact': invoice.Contact?.Name || '',
        'Invoice Date': invoice.DateString || '',
        'Due Date': invoice.DueDateString || '',
        'Currency': invoice.CurrencyCode || '',
        'Subtotal': invoice.SubTotal || 0,
        'Tax': invoice.TotalTax || 0,
        'Total': invoice.Total || 0,
        'Amount Paid': invoice.AmountPaid || 0,
        'Amount Due': invoice.AmountDue || 0,
        'Amount Credited': invoice.AmountCredited || 0,
        'Reference': invoice.Reference || '',
        'Has Attachments': invoice.HasAttachments ? 'Yes' : 'No',
        'Has Errors': invoice.HasErrors ? 'Yes' : 'No',
        'Last Updated': invoice.UpdatedDateUTC ? new Date(invoice.UpdatedDateUTC).toLocaleString() : '',
        'Invoice ID': invoice.InvoiceID || '',
        'Contact ID': invoice.Contact?.ContactID || ''
      }));

      // Create main worksheet
      const ws = XLSX.utils.json_to_sheet(excelData);

      // Auto-fit columns
      const colWidths = [
        { wch: 15 }, // Invoice Number
        { wch: 12 }, // Type
        { wch: 12 }, // Status
        { wch: 30 }, // Contact
        { wch: 12 }, // Invoice Date
        { wch: 12 }, // Due Date
        { wch: 10 }, // Currency
        { wch: 12 }, // Subtotal
        { wch: 10 }, // Tax
        { wch: 12 }, // Total
        { wch: 12 }, // Amount Paid
        { wch: 12 }, // Amount Due
        { wch: 15 }, // Amount Credited
        { wch: 20 }, // Reference
        { wch: 15 }, // Has Attachments
        { wch: 12 }, // Has Errors
        { wch: 20 }, // Last Updated
        { wch: 36 }, // Invoice ID
        { wch: 36 }  // Contact ID
      ];
      ws['!cols'] = colWidths;

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Invoices');

      // Create summary by status
      const statusSummary = allInvoices.reduce((acc, inv) => {
        const status = inv.Status || 'Unknown';
        if (!acc[status]) {
          acc[status] = { count: 0, total: 0, due: 0 };
        }
        acc[status].count++;
        acc[status].total += inv.Total || 0;
        acc[status].due += inv.AmountDue || 0;
        return acc;
      }, {} as Record<string, { count: number; total: number; due: number }>);

      const summaryData = Object.entries(statusSummary).map(([status, data]) => ({
        'Status': status,
        'Count': data.count,
        'Total Amount': data.total,
        'Amount Due': data.due
      }));

      // Add total row
      summaryData.push({
        'Status': 'TOTAL',
        'Count': allInvoices.length,
        'Total Amount': allInvoices.reduce((sum, inv) => sum + (inv.Total || 0), 0),
        'Amount Due': allInvoices.reduce((sum, inv) => sum + (inv.AmountDue || 0), 0)
      });

      const summaryWs = XLSX.utils.json_to_sheet(summaryData);
      summaryWs['!cols'] = [
        { wch: 20 }, // Status
        { wch: 10 }, // Count
        { wch: 15 }, // Total Amount
        { wch: 15 }  // Amount Due
      ];
      XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary by Status');

      // Create summary by type
      const typeSummary = allInvoices.reduce((acc, inv) => {
        const type = inv.Type || 'Unknown';
        if (!acc[type]) {
          acc[type] = { count: 0, total: 0, due: 0 };
        }
        acc[type].count++;
        acc[type].total += inv.Total || 0;
        acc[type].due += inv.AmountDue || 0;
        return acc;
      }, {} as Record<string, { count: number; total: number; due: number }>);

      const typeData = Object.entries(typeSummary).map(([type, data]) => ({
        'Type': type,
        'Count': data.count,
        'Total Amount': data.total,
        'Amount Due': data.due
      }));

      const typeWs = XLSX.utils.json_to_sheet(typeData);
      typeWs['!cols'] = [
        { wch: 20 }, // Type
        { wch: 10 }, // Count
        { wch: 15 }, // Total Amount
        { wch: 15 }  // Amount Due
      ];
      XLSX.utils.book_append_sheet(wb, typeWs, 'Summary by Type');

      // Add metadata sheet
      const metadataData = [{
        'Export Date': new Date().toLocaleString(),
        'Tenant ID': tokenData.effective_tenant_id,
        'Total Invoices': allInvoices.length,
        'Total Value': allInvoices.reduce((sum, inv) => sum + (inv.Total || 0), 0),
        'Total Amount Due': allInvoices.reduce((sum, inv) => sum + (inv.AmountDue || 0), 0),
        'Total Amount Paid': allInvoices.reduce((sum, inv) => sum + (inv.AmountPaid || 0), 0),
        'Currencies': [...new Set(allInvoices.map(inv => inv.CurrencyCode).filter(Boolean))].join(', ')
      }];

      const metadataWs = XLSX.utils.json_to_sheet(metadataData);
      metadataWs['!cols'] = [
        { wch: 20 }, // Label
        { wch: 40 }  // Value
      ];
      XLSX.utils.book_append_sheet(wb, metadataWs, 'Export Info');

      // Generate Excel buffer
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
      const filename = `xero-invoices-${timestamp}.xlsx`;

      // Return Excel file
      return new NextResponse(excelBuffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

  } catch (err: any) {
    console.error('[Invoices Download] Error:', err);
    if (err.message.includes('No authenticated session') || 
        err.message.includes('Please login') || 
        err.message.includes('re-authenticate')) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json({ error: `Internal Server Error: ${err.message}` }, { status: 500 });
  }
}