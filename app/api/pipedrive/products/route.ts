import { NextResponse } from 'next/server';
import { ensureValidToken } from '@/lib/ensureXeroToken';

// Tenant-specific Pipedrive configuration
const TENANT_PIPEDRIVE_CONFIG = {
  '6dd39ea4-e6a6-4993-a37a-21482ccf8d22': {
    apiKey: process.env.PIPEDRIVE_KEY,
    enabled: true,
    description: 'Tenant 1'
  },
  'ea67107e-c352-40a9-a8b8-24d81ae3fc85': {
    apiKey: process.env.PIPEDRIVE_KEY_2,
    enabled: true,
    description: 'Tenant 2'
  },
  'ab4b2a02-e700-4fe8-a32d-5419d4195e1b': {
    apiKey: null,
    enabled: false,
    description: 'Tenant 3 (Pipedrive disabled)'
  }
};

/**
 * GET /api/pipedrive/products - Fetches all products from Pipedrive API
 * Retrieves product list with pagination
 * Uses tenant-specific API keys
 * @returns {Promise<NextResponse>} JSON response with products array or error
 */
export async function GET() {
  try {
    // Get the current tenant information
    const { effective_tenant_id } = await ensureValidToken();
    
    // Get tenant-specific Pipedrive configuration
    const tenantConfig = TENANT_PIPEDRIVE_CONFIG[effective_tenant_id as keyof typeof TENANT_PIPEDRIVE_CONFIG];
    
    if (!tenantConfig) {
      return NextResponse.json(
        { message: 'Pipedrive integration not configured for this tenant.' },
        { status: 403 }
      );
    }

    if (!tenantConfig.enabled) {
      return NextResponse.json(
        { message: 'Pipedrive integration is disabled for this organization.' },
        { status: 403 }
      );
    }

    const apiKey = tenantConfig.apiKey;

    if (!apiKey) {
      return NextResponse.json(
        { message: 'Pipedrive API key is not configured for this tenant.' },
        { status: 500 }
      );
    }

    let allProducts: any[] = [];
    let start = 0;
    const limit = 100;
    let moreItemsInCollection = true;

    // Fetch all products with pagination
    while (moreItemsInCollection) {
      const productsApiUrl = `https://api.pipedrive.com/v1/products?api_token=${apiKey}&start=${start}&limit=${limit}`;
      const response = await fetch(productsApiUrl, { 
        headers: { 'Accept': 'application/json' } 
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`API Error fetching Pipedrive products: ${response.status} ${response.statusText}`, errorBody);
        return NextResponse.json(
          { message: 'Error fetching Pipedrive products', error: errorBody },
          { status: response.status }
        );
      }

      const productsData = await response.json();
      
      if (!productsData.success) {
        return NextResponse.json(
          { message: 'Pipedrive API returned unsuccessful response', error: productsData },
          { status: 500 }
        );
      }

      if (productsData.data && productsData.data.length > 0) {
        allProducts = allProducts.concat(productsData.data);
      }

      if (productsData.additional_data && productsData.additional_data.pagination) {
        moreItemsInCollection = productsData.additional_data.pagination.more_items_in_collection;
        if (moreItemsInCollection) {
          start = productsData.additional_data.pagination.next_start;
        }
      } else {
        moreItemsInCollection = false;
      }
    }

    // Simplify product data for frontend
    const simplifiedProducts = allProducts.map(product => ({
      id: product.id,
      name: product.name,
      code: product.code || '',
      description: product.description || '',
      prices: product.prices || [],
      isActive: product.active_flag
    }));

    return NextResponse.json({ 
      success: true,
      data: simplifiedProducts,
      count: simplifiedProducts.length
    });

  } catch (error) {
    console.error('API Error in Pipedrive products route:', error);
    return NextResponse.json(
      { message: 'Internal server error', error: (error as Error).message },
      { status: 500 }
    );
  }
} 