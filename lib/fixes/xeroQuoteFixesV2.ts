/**
 * Xero Quote Fix Functions V2
 * Simplified version to avoid Turbopack parsing issues
 */

import { ensureValidToken } from '../ensureXeroToken';

// Valid Xero Quote Status Transitions
export const XERO_QUOTE_STATUS_TRANSITIONS: Record<string, string[]> = {
  'DRAFT': ['SENT', 'DELETED'],
  'SENT': ['ACCEPTED', 'DECLINED', 'DELETED'],
  'DECLINED': ['SENT', 'DELETED'],
  'ACCEPTED': ['SENT', 'DELETED', 'INVOICED'],
  'INVOICED': ['SENT', 'DELETED']
};

// Get the path to transition from current status to target status
export function getStatusTransitionPath(currentStatus: string, targetStatus: string): string[] {
  if (currentStatus === targetStatus) {
    return [];
  }
  
  const directTransitions = XERO_QUOTE_STATUS_TRANSITIONS[currentStatus];
  if (directTransitions && directTransitions.includes(targetStatus)) {
    return [targetStatus];
  }
  
  // Special cases
  if (currentStatus === 'DRAFT' && targetStatus === 'ACCEPTED') {
    return ['SENT', 'ACCEPTED'];
  }
  
  if (currentStatus === 'DECLINED' && targetStatus === 'ACCEPTED') {
    return ['SENT', 'ACCEPTED'];
  }
  
  if (currentStatus === 'INVOICED' && targetStatus === 'ACCEPTED') {
    return ['SENT', 'ACCEPTED'];
  }
  
  return [];
}

// Sync products from Pipedrive to Xero quote
export async function syncProductsToXeroQuote(params: {
  xeroQuoteId: string;
  pipedriveProducts: any[];
  tenantId: string;
}): Promise<{ success: boolean; error?: string; updatedQuote?: any; warning?: string }> {
  try {
    const { access_token } = await ensureValidToken();
    const { xeroQuoteId, pipedriveProducts, tenantId } = params;
    
    // Step 1: Get the current quote from Xero
    console.log('Fetching Xero quote ' + xeroQuoteId + ' for update...');
    
    const getQuoteUrl = 'https://api.xero.com/api.xro/2.0/Quotes/' + xeroQuoteId;
    const getResponse = await fetch(getQuoteUrl, {
      headers: {
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + access_token,
        'Xero-tenant-id': tenantId
      }
    });
    
    if (!getResponse.ok) {
      const errorText = await getResponse.text();
      console.error('Failed to fetch quote:', errorText);
      return { success: false, error: 'Failed to fetch quote: ' + getResponse.status };
    }
    
    const quoteData = await getResponse.json();
    
    if (quoteData.Status !== 'OK' || !quoteData.Quotes || quoteData.Quotes.length === 0) {
      return { success: false, error: 'Quote not found in Xero' };
    }
    
    let currentQuote = quoteData.Quotes[0];
    const originalStatus = currentQuote.Status;
    console.log('Current quote status: ' + originalStatus + ', Line items: ' + (currentQuote.LineItems?.length || 0));
    
    // Check if quote is INVOICED - we cannot modify invoiced quotes
    if (originalStatus === 'INVOICED') {
      console.log('Cannot modify INVOICED quote');
      return { success: false, error: 'Cannot modify a quote that has been invoiced' };
    }
    
    // Step 2: Convert Pipedrive products to Xero line items
    const newLineItems = pipedriveProducts.map(product => ({
      Description: product.name || 'Product',
      Quantity: product.quantity || 1,
      UnitAmount: product.item_price || 0,
      LineAmount: (product.quantity || 1) * (product.item_price || 0),
      AccountCode: '200',
      TaxType: 'NONE',
      TaxAmount: 0,
      DiscountRate: product.discount_percentage || 0,
      Tracking: []
    }));
    
    // Step 3: Check if we need to change status to allow edits
    let needsStatusReset = false;
    
    if (originalStatus === 'ACCEPTED') {
      console.log('Quote is ACCEPTED, changing to SENT to allow edits...');
      needsStatusReset = true;
      
      const sentQuote = Object.assign({}, currentQuote, { Status: 'SENT' });
      
      // Remove read-only fields
      delete sentQuote.QuoteID;
      delete sentQuote.UpdatedDateUTC;
      delete sentQuote.HasAttachments;
      delete sentQuote.IsDeleted;
      delete sentQuote.ValidationErrors;
      
      const statusChangeResponse = await fetch(getQuoteUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + access_token,
          'Xero-tenant-id': tenantId
        },
        body: JSON.stringify({ Quotes: [sentQuote] })
      });
      
      if (!statusChangeResponse.ok) {
        const errorText = await statusChangeResponse.text();
        console.error('Failed to change quote status to SENT:', errorText);
        return { success: false, error: 'Failed to change quote status for update' };
      }
      
      const statusChangeData = await statusChangeResponse.json();
      if (statusChangeData.Quotes && statusChangeData.Quotes.length > 0) {
        currentQuote = statusChangeData.Quotes[0];
      }
    }
    
    // Step 4: Update quote with new line items
    const updatedQuote = Object.assign({}, currentQuote, {
      LineItems: newLineItems,
      SubTotal: newLineItems.reduce((sum, item) => sum + (item.LineAmount || 0), 0),
      TotalTax: 0,
      Total: newLineItems.reduce((sum, item) => sum + (item.LineAmount || 0), 0)
    });
    
    // Remove read-only fields
    delete updatedQuote.QuoteID;
    delete updatedQuote.UpdatedDateUTC;
    delete updatedQuote.HasAttachments;
    delete updatedQuote.IsDeleted;
    delete updatedQuote.ValidationErrors;
    
    console.log('Updating quote with ' + newLineItems.length + ' line items...');
    
    const updateResponse = await fetch(getQuoteUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + access_token,
        'Xero-tenant-id': tenantId
      },
      body: JSON.stringify({ Quotes: [updatedQuote] })
    });
    
    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error('Failed to update quote:', errorText);
      return { success: false, error: 'Failed to update quote: ' + updateResponse.status };
    }
    
    const updateResult = await updateResponse.json();
    
    if (updateResult.Status === 'OK' && updateResult.Quotes && updateResult.Quotes.length > 0) {
      let finalQuote = updateResult.Quotes[0];
      
      // Step 5: If we changed status, change it back
      if (needsStatusReset) {
        console.log('Changing quote status back to ACCEPTED...');
        
        const acceptedQuote = Object.assign({}, finalQuote, { Status: 'ACCEPTED' });
        
        delete acceptedQuote.QuoteID;
        delete acceptedQuote.UpdatedDateUTC;
        delete acceptedQuote.HasAttachments;
        delete acceptedQuote.IsDeleted;
        delete acceptedQuote.ValidationErrors;
        
        const finalStatusResponse = await fetch(getQuoteUrl, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + access_token,
            'Xero-tenant-id': tenantId
          },
          body: JSON.stringify({ Quotes: [acceptedQuote] })
        });
        
        if (!finalStatusResponse.ok) {
          const errorText = await finalStatusResponse.text();
          console.error('Failed to change quote back to ACCEPTED:', errorText);
          return { 
            success: true, 
            updatedQuote: finalQuote, 
            warning: 'Quote updated but status could not be changed back to ACCEPTED' 
          };
        }
        
        const finalStatusData = await finalStatusResponse.json();
        if (finalStatusData.Quotes && finalStatusData.Quotes.length > 0) {
          finalQuote = finalStatusData.Quotes[0];
        }
      }
      
      console.log('Quote updated successfully. New total: ' + finalQuote.Total);
      return { success: true, updatedQuote: finalQuote };
    } else {
      return { success: false, error: 'Update response invalid' };
    }
    
  } catch (error) {
    console.error('Error syncing products to Xero:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

// Update quote status to ACCEPTED
export async function acceptXeroQuote(params: {
  xeroQuoteId: string;
  tenantId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { access_token } = await ensureValidToken();
    const { xeroQuoteId, tenantId } = params;
    
    // Get current quote
    const getQuoteUrl = 'https://api.xero.com/api.xro/2.0/Quotes/' + xeroQuoteId;
    const getResponse = await fetch(getQuoteUrl, {
      headers: {
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + access_token,
        'Xero-tenant-id': tenantId
      }
    });
    
    if (!getResponse.ok) {
      return { success: false, error: 'Failed to fetch quote: ' + getResponse.status };
    }
    
    const quoteData = await getResponse.json();
    let currentQuote = quoteData.Quotes?.[0];
    
    if (!currentQuote) {
      return { success: false, error: 'Quote not found' };
    }
    
    const currentStatus = currentQuote.Status;
    console.log('Current quote status: ' + currentStatus);
    
    // Get transition path to ACCEPTED
    const transitionPath = getStatusTransitionPath(currentStatus, 'ACCEPTED');
    
    if (transitionPath.length === 0) {
      if (currentStatus === 'ACCEPTED') {
        console.log('Quote is already ACCEPTED');
        return { success: true };
      }
      return { success: false, error: 'Cannot transition from ' + currentStatus + ' to ACCEPTED' };
    }
    
    // Apply each status transition in sequence
    for (const nextStatus of transitionPath) {
      console.log('Transitioning quote from ' + currentQuote.Status + ' to ' + nextStatus);
      
      const updatedQuote = Object.assign({}, currentQuote, { Status: nextStatus });
      
      // Remove read-only fields
      delete updatedQuote.QuoteID;
      delete updatedQuote.UpdatedDateUTC;
      delete updatedQuote.HasAttachments;
      delete updatedQuote.IsDeleted;
      delete updatedQuote.ValidationErrors;
      
      const updateResponse = await fetch(getQuoteUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + access_token,
          'Xero-tenant-id': tenantId
        },
        body: JSON.stringify({ Quotes: [updatedQuote] })
      });
      
      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error('Failed to transition to ' + nextStatus + ':', errorText);
        return { success: false, error: 'Failed to transition quote to ' + nextStatus };
      }
      
      const responseData = await updateResponse.json();
      if (responseData.Quotes && responseData.Quotes.length > 0) {
        currentQuote = responseData.Quotes[0];
      }
    }
    
    console.log('Quote successfully transitioned to ACCEPTED');
    return { success: true };
    
  } catch (error) {
    console.error('Error accepting quote:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

// Update quote number to include project code
export async function fixQuoteNumber(params: {
  xeroQuoteId: string;
  newQuoteNumber: string;
  tenantId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { access_token } = await ensureValidToken();
    const { xeroQuoteId, newQuoteNumber, tenantId } = params;
    
    // Get current quote
    const getQuoteUrl = 'https://api.xero.com/api.xro/2.0/Quotes/' + xeroQuoteId;
    const getResponse = await fetch(getQuoteUrl, {
      headers: {
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + access_token,
        'Xero-tenant-id': tenantId
      }
    });
    
    if (!getResponse.ok) {
      return { success: false, error: 'Failed to fetch quote: ' + getResponse.status };
    }
    
    const quoteData = await getResponse.json();
    let currentQuote = quoteData.Quotes?.[0];
    
    if (!currentQuote) {
      return { success: false, error: 'Quote not found' };
    }
    
    const currentStatus = currentQuote.Status;
    let needsStatusChange = false;
    
    // INVOICED quotes cannot be edited
    if (currentStatus === 'INVOICED') {
      console.log('Cannot update quote number for INVOICED quote');
      return { success: false, error: 'Cannot modify quote number for invoiced quotes' };
    }
    
    // For ACCEPTED quotes, change to SENT first
    if (currentStatus === 'ACCEPTED') {
      console.log('Quote is ACCEPTED, changing to SENT to allow quote number update...');
      needsStatusChange = true;
      
      const sentQuote = Object.assign({}, currentQuote, { Status: 'SENT' });
      
      delete sentQuote.QuoteID;
      delete sentQuote.UpdatedDateUTC;
      delete sentQuote.HasAttachments;
      delete sentQuote.IsDeleted;
      delete sentQuote.ValidationErrors;
      
      const statusResponse = await fetch(getQuoteUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + access_token,
          'Xero-tenant-id': tenantId
        },
        body: JSON.stringify({ Quotes: [sentQuote] })
      });
      
      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        console.error('Failed to change status to SENT:', errorText);
        return { success: false, error: 'Failed to change quote status for update' };
      }
      
      const statusData = await statusResponse.json();
      if (statusData.Quotes && statusData.Quotes.length > 0) {
        currentQuote = statusData.Quotes[0];
      }
    }
    
    // Update quote number
    const updatedQuote = Object.assign({}, currentQuote, { QuoteNumber: newQuoteNumber });
    
    delete updatedQuote.QuoteID;
    delete updatedQuote.UpdatedDateUTC;
    delete updatedQuote.HasAttachments;
    delete updatedQuote.IsDeleted;
    delete updatedQuote.ValidationErrors;
    
    const updateResponse = await fetch(getQuoteUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + access_token,
        'Xero-tenant-id': tenantId
      },
      body: JSON.stringify({ Quotes: [updatedQuote] })
    });
    
    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error('Failed to update quote number:', errorText);
      return { success: false, error: 'Failed to update quote number: ' + updateResponse.status };
    }
    
    // If we changed status, change it back
    if (needsStatusChange) {
      console.log('Changing quote status back to ACCEPTED...');
      
      const responseData = await updateResponse.json();
      const updatedQuoteData = responseData.Quotes?.[0] || updatedQuote;
      
      const acceptedQuote = Object.assign({}, updatedQuoteData, { Status: 'ACCEPTED' });
      
      delete acceptedQuote.QuoteID;
      delete acceptedQuote.UpdatedDateUTC;
      delete acceptedQuote.HasAttachments;
      delete acceptedQuote.IsDeleted;
      delete acceptedQuote.ValidationErrors;
      
      const finalResponse = await fetch(getQuoteUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + access_token,
          'Xero-tenant-id': tenantId
        },
        body: JSON.stringify({ Quotes: [acceptedQuote] })
      });
      
      if (!finalResponse.ok) {
        return { success: true, error: 'Quote number updated but status could not be restored to ACCEPTED' };
      }
    }
    
    return { success: true };
    
  } catch (error) {
    console.error('Error updating quote number:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}