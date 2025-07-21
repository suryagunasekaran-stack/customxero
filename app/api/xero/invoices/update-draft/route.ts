import { NextRequest, NextResponse } from 'next/server';
import { ensureValidToken } from '@/lib/ensureXeroToken';
import { trackXeroApiCall } from '@/lib/xeroApiTracker';
import { waitForXeroRateLimit, updateXeroRateLimitFromHeaders } from '@/lib/xeroApiTracker';

interface UpdateLineItem {
  "*InvoiceNumber": string;
  "*Description": string;
  "*AccountCode": string;
  "*TaxType": string;
  "TrackingName1": string;
  "TrackingOption1": string;
}

interface XeroLineItem {
  LineItemID?: string;
  Description?: string;
  Quantity?: number;
  UnitAmount?: number;
  AccountCode?: string;
  TaxType?: string;
  LineAmount?: number;
  Tracking?: Array<{
    Name: string;
    Option: string;
  }>;
}

interface XeroInvoice {
  InvoiceID: string;
  InvoiceNumber: string;
  Type: string;
  Status: string;
  LineItems?: XeroLineItem[];
  Contact?: {
    ContactID: string;
    Name: string;
  };
  Date?: string;
  DueDate?: string;
  LineAmountTypes?: string;
  Reference?: string;
  BrandingThemeID?: string;
  CurrencyCode?: string;
  ExpectedPaymentDate?: string;
  Url?: string;
  SubTotal?: number;
  TotalTax?: number;
  Total?: number;
}

export async function POST(request: NextRequest) {
  try {
    const tokenData = await ensureValidToken();
    const body = await request.json();
    
    // Validate request body
    if (!body.updateData || !Array.isArray(body.updateData)) {
      return NextResponse.json(
        { error: 'Missing or invalid updateData array in request body' },
        { status: 400 }
      );
    }

    const updateData: UpdateLineItem[] = body.updateData;
    const dryRun = body.dryRun || false; // Option to preview changes without updating

    console.log(`[Invoice Update] Processing ${updateData.length} invoice updates...`);

    // Step 1: Fetch all draft invoices with line items
    const draftInvoices: XeroInvoice[] = [];
    let page = 1;
    const pageSize = 100;
    let hasMorePages = true;

    while (hasMorePages) {
      // Fetch only DRAFT invoices of type ACCREC (sales invoices)
      const url = `https://api.xero.com/api.xro/2.0/Invoices?where=Type%3D%22ACCREC%22%20AND%20Status%3D%22DRAFT%22&page=${page}&pageSize=${pageSize}`;
      
      await waitForXeroRateLimit(tokenData.effective_tenant_id);
      
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'Xero-tenant-id': tokenData.effective_tenant_id,
          Accept: 'application/json',
        },
      });

      await trackXeroApiCall(tokenData.effective_tenant_id);
      await updateXeroRateLimitFromHeaders(res.headers, tokenData.effective_tenant_id);

      if (!res.ok) {
        const errorData = await res.json();
        return NextResponse.json(
          { error: `Failed to fetch draft invoices: ${res.status}`, details: errorData },
          { status: res.status }
        );
      }

      const data = await res.json();
      
      if (data.Invoices && data.Invoices.length > 0) {
        draftInvoices.push(...data.Invoices);
        
        if (data.Invoices.length === pageSize) {
          page++;
        } else {
          hasMorePages = false;
        }
      } else {
        hasMorePages = false;
      }
    }

    console.log(`[Invoice Update] Found ${draftInvoices.length} draft invoices`);

    // Step 2: Create a map of update data by invoice number
    const updateMap = new Map<string, UpdateLineItem>();
    updateData.forEach(item => {
      updateMap.set(item["*InvoiceNumber"], item);
    });

    // Step 3: Process each draft invoice and prepare update payload
    const invoicesToUpdate: XeroInvoice[] = [];
    const updateResults: any[] = [];

    for (const invoice of draftInvoices) {
      const updateItem = updateMap.get(invoice.InvoiceNumber);
      
      if (updateItem) {
        // Fetch full invoice details including line items
        const invoiceDetailUrl = `https://api.xero.com/api.xro/2.0/Invoices/${invoice.InvoiceID}`;
        
        await waitForXeroRateLimit(tokenData.effective_tenant_id);
        
        const detailRes = await fetch(invoiceDetailUrl, {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            'Xero-tenant-id': tokenData.effective_tenant_id,
            Accept: 'application/json',
          },
        });

        await trackXeroApiCall(tokenData.effective_tenant_id);
        await updateXeroRateLimitFromHeaders(detailRes.headers, tokenData.effective_tenant_id);

        if (!detailRes.ok) {
          console.error(`[Invoice Update] Failed to fetch details for invoice ${invoice.InvoiceNumber}`);
          continue;
        }

        const detailData = await detailRes.json();
        const fullInvoice = detailData.Invoices[0];

        // Update line items
        if (fullInvoice.LineItems && fullInvoice.LineItems.length > 0) {
          // Update the first line item (or all line items if needed)
          fullInvoice.LineItems.forEach((lineItem: XeroLineItem) => {
            lineItem.Description = updateItem["*Description"];
            lineItem.AccountCode = updateItem["*AccountCode"];
            lineItem.TaxType = updateItem["*TaxType"];
            
            // Add tracking category if provided
            if (updateItem.TrackingName1 && updateItem.TrackingOption1) {
              lineItem.Tracking = [{
                Name: updateItem.TrackingName1,
                Option: updateItem.TrackingOption1
              }];
            }
          });

          // Prepare invoice for update - include all fields from the original invoice
          const updateInvoice: any = {
            InvoiceID: fullInvoice.InvoiceID,
            Type: fullInvoice.Type || 'ACCREC',
            Contact: {
              ContactID: fullInvoice.Contact?.ContactID
            },
            InvoiceNumber: fullInvoice.InvoiceNumber,
            Status: fullInvoice.Status,
            LineAmountTypes: fullInvoice.LineAmountTypes || 'Exclusive',
            LineItems: fullInvoice.LineItems
          };
          
          // Include optional fields if they exist
          if (fullInvoice.Date) updateInvoice.DateString = fullInvoice.Date;
          if (fullInvoice.DueDate) updateInvoice.DueDateString = fullInvoice.DueDate;
          if (fullInvoice.Reference) updateInvoice.Reference = fullInvoice.Reference;
          if (fullInvoice.BrandingThemeID) updateInvoice.BrandingThemeID = fullInvoice.BrandingThemeID;
          if (fullInvoice.CurrencyCode) updateInvoice.CurrencyCode = fullInvoice.CurrencyCode;
          if (fullInvoice.ExpectedPaymentDate) updateInvoice.ExpectedPaymentDate = fullInvoice.ExpectedPaymentDate;
          if (fullInvoice.Url) updateInvoice.Url = fullInvoice.Url;

          invoicesToUpdate.push(updateInvoice);
          
          updateResults.push({
            invoiceNumber: invoice.InvoiceNumber,
            status: 'prepared',
            lineItemsUpdated: fullInvoice.LineItems.length
          });
        }
      }
    }

    console.log(`[Invoice Update] Prepared ${invoicesToUpdate.length} invoices for update`);

    // Step 4: If dry run, return the prepared payload without updating
    if (dryRun) {
      return NextResponse.json({
        message: 'Dry run completed',
        totalDraftInvoices: draftInvoices.length,
        matchedInvoices: invoicesToUpdate.length,
        updatePayload: {
          Invoices: invoicesToUpdate
        },
        results: updateResults
      });
    }

    // Step 5: Update invoices in batches (Xero allows up to 50 invoices per request)
    const batchSize = 50;
    const updatePromises = [];
    
    for (let i = 0; i < invoicesToUpdate.length; i += batchSize) {
      const batch = invoicesToUpdate.slice(i, i + batchSize);
      
      const updatePayload = {
        Invoices: batch
      };

      await waitForXeroRateLimit(tokenData.effective_tenant_id);
      
      const updateRes = await fetch('https://api.xero.com/api.xro/2.0/Invoices?SummarizeErrors=false', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'Xero-tenant-id': tokenData.effective_tenant_id,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(updatePayload)
      });

      await trackXeroApiCall(tokenData.effective_tenant_id);
      await updateXeroRateLimitFromHeaders(updateRes.headers, tokenData.effective_tenant_id);

      const responseData = await updateRes.json();
      
      if (!updateRes.ok) {
        console.error('[Invoice Update] Batch update failed:', responseData);
      }
      
      // Process response with detailed error information
      if (responseData.Invoices && Array.isArray(responseData.Invoices)) {
        responseData.Invoices.forEach((invoiceResponse: any) => {
          const resultIndex = updateResults.findIndex(r => r.invoiceNumber === invoiceResponse.InvoiceNumber);
          if (resultIndex >= 0) {
            if (invoiceResponse.StatusAttributeString === 'OK' || invoiceResponse.Status === 'OK') {
              updateResults[resultIndex].status = 'success';
              updateResults[resultIndex].invoiceId = invoiceResponse.InvoiceID;
            } else if (invoiceResponse.StatusAttributeString === 'ERROR' || invoiceResponse.Status === 'ERROR') {
              updateResults[resultIndex].status = 'failed';
              if (invoiceResponse.ValidationErrors && invoiceResponse.ValidationErrors.length > 0) {
                updateResults[resultIndex].error = invoiceResponse.ValidationErrors.map((e: any) => e.Message).join('; ');
              } else {
                updateResults[resultIndex].error = 'Update failed with unknown error';
              }
            }
          }
        });
      } else {
        // Fallback for unexpected response format
        batch.forEach(inv => {
          const resultIndex = updateResults.findIndex(r => r.invoiceNumber === inv.InvoiceNumber);
          if (resultIndex >= 0) {
            updateResults[resultIndex].status = updateRes.ok ? 'success' : 'failed';
            if (!updateRes.ok) {
              updateResults[resultIndex].error = responseData.Message || 'Update failed';
            }
          }
        });
      }
    }

    // Summary
    const successCount = updateResults.filter(r => r.status === 'success').length;
    const failedCount = updateResults.filter(r => r.status === 'failed').length;

    return NextResponse.json({
      message: 'Invoice update completed',
      totalDraftInvoices: draftInvoices.length,
      matchedInvoices: invoicesToUpdate.length,
      successfulUpdates: successCount,
      failedUpdates: failedCount,
      results: updateResults
    });

  } catch (err: any) {
    console.error('[Invoice Update] Error:', err);
    return NextResponse.json({ 
      error: `Internal Server Error: ${err.message}` 
    }, { status: 500 });
  }
} 