/**
 * Pipedrive Fix Functions
 * Handles updating Pipedrive data based on Xero information
 */

export interface UpdateOrganizationParams {
  dealId: string;
  orgId: number;
  newOrgName: string;
  apiKey: string;
  companyDomain: string;
}

/**
 * Update Pipedrive organization name from Xero contact
 * Uses Xero as the source of truth for organization names
 */
export async function updatePipedriveOrganization({
  dealId,
  orgId,
  newOrgName,
  apiKey,
  companyDomain
}: UpdateOrganizationParams): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`Updating Pipedrive organization ${orgId} to: ${newOrgName}`);
    
    // Update organization using Pipedrive v1 API (v2 doesn't support org updates yet)
    const updateUrl = `https://api.pipedrive.com/v1/organizations/${orgId}?api_token=${apiKey}`;
    
    const response = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: newOrgName
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Failed to update organization:', errorData);
      return { 
        success: false, 
        error: `Failed to update organization: ${errorData.error || response.status}` 
      };
    }
    
    const result = await response.json();
    
    if (result.success) {
      console.log(`Organization ${orgId} updated successfully`);
      return { success: true };
    } else {
      return { 
        success: false, 
        error: result.error || 'Update failed' 
      };
    }
    
  } catch (error) {
    console.error('Error updating Pipedrive organization:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Sync products from Xero to Pipedrive deal
 * Updates existing products and adds new ones to match Xero
 */
export async function syncProductsToPipedrive({
  dealId,
  xeroLineItems,
  apiKey,
  companyDomain
}: {
  dealId: string;
  xeroLineItems: any[];
  apiKey: string;
  companyDomain: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`Syncing ${xeroLineItems.length} products from Xero to Pipedrive deal ${dealId}`);
    
    // Step 1: Get current products on the deal
    const productsUrl = `https://api.pipedrive.com/v1/deals/${dealId}/products?api_token=${apiKey}`;
    const productsResponse = await fetch(productsUrl);
    
    if (!productsResponse.ok) {
      return { success: false, error: 'Failed to fetch current deal products' };
    }
    
    const productsData = await productsResponse.json();
    const currentProducts = productsData.data || [];
    
    console.log(`Current Pipedrive products: ${currentProducts.length}`);
    
    // Step 2: Delete existing products (we'll replace them with Xero data)
    for (const product of currentProducts) {
      const deleteUrl = `https://api.pipedrive.com/v1/deals/${dealId}/products/${product.id}?api_token=${apiKey}`;
      const deleteResponse = await fetch(deleteUrl, {
        method: 'DELETE'
      });
      
      if (!deleteResponse.ok) {
        console.error(`Failed to delete product ${product.id}`);
      }
    }
    
    // Step 3: Add products from Xero
    let totalAdded = 0;
    for (const xeroItem of xeroLineItems) {
      const productData = {
        item_price: xeroItem.UnitAmount || 0,
        quantity: xeroItem.Quantity || 1,
        discount: xeroItem.DiscountRate || 0,
        comments: xeroItem.Description || 'Synced from Xero',
        enabled_flag: 1
      };
      
      // Note: This requires having products set up in Pipedrive
      // For now, we'll add as adhoc products
      const addProductUrl = `https://api.pipedrive.com/v1/deals/${dealId}/products?api_token=${apiKey}`;
      const addResponse = await fetch(addProductUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(productData)
      });
      
      if (addResponse.ok) {
        totalAdded++;
      } else {
        const errorData = await addResponse.json();
        console.error(`Failed to add product: ${errorData.error || 'Unknown error'}`);
      }
    }
    
    console.log(`Added ${totalAdded} products to Pipedrive`);
    
    // Step 4: Update deal value to match total
    const newTotal = xeroLineItems.reduce((sum, item) => sum + (item.LineAmount || 0), 0);
    const updateDealUrl = `https://api.pipedrive.com/v1/deals/${dealId}?api_token=${apiKey}`;
    const updateDealResponse = await fetch(updateDealUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        value: newTotal
      })
    });
    
    if (!updateDealResponse.ok) {
      return { 
        success: false, 
        error: 'Products synced but failed to update deal value' 
      };
    }
    
    return { 
      success: true
    };
    
  } catch (error) {
    console.error('Error syncing products to Pipedrive:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Update deal value in Pipedrive
 */
export async function updateDealValue({
  dealId,
  newValue,
  apiKey
}: {
  dealId: string;
  newValue: number;
  apiKey: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`Updating deal ${dealId} value to ${newValue}`);
    
    const updateUrl = `https://api.pipedrive.com/v1/deals/${dealId}?api_token=${apiKey}`;
    const response = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        value: newValue
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      return { 
        success: false, 
        error: `Failed to update deal value: ${errorData.error || response.status}` 
      };
    }
    
    return { success: true };
    
  } catch (error) {
    console.error('Error updating deal value:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}