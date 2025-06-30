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

interface DealData {
  'Deal - Value': string;
  'Deal - ID': string;
  'Deal - IPC': string;
}

interface UpdateRequest {
  productId: number;
  deals: DealData[];
  dealIds?: string[]; // Optional specific deal IDs to update
}

/**
 * POST /api/pipedrive/deals/update-products - Updates Pipedrive deals with product information
 * Adds products to specified deals with their values
 * @returns {Promise<NextResponse>} JSON response with update results
 */
export async function POST(request: Request) {
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

    const body: UpdateRequest = await request.json();
    const { productId, deals, dealIds } = body;

    if (!productId || !deals || deals.length === 0) {
      return NextResponse.json(
        { message: 'Product ID and deals data are required' },
        { status: 400 }
      );
    }

    // Filter deals based on provided dealIds if specified
    const dealsToUpdate = dealIds && dealIds.length > 0
      ? deals.filter(deal => dealIds.includes(deal['Deal - ID']))
      : deals;

    const results = {
      successful: [] as any[],
      failed: [] as any[],
      totalProcessed: 0,
      totalSuccess: 0,
      totalFailed: 0
    };

    // Process deals in batches to respect rate limits
    // Power plan: 100 requests per 2 seconds
    const BATCH_SIZE = 80; // Conservative batch size
    const BATCH_DELAY = 2100; // 2.1 seconds between batches
    
    for (let i = 0; i < dealsToUpdate.length; i += BATCH_SIZE) {
      const batch = dealsToUpdate.slice(i, i + BATCH_SIZE);
      
      // Process current batch in parallel
      const batchPromises = batch.map(async (deal) => {
        results.totalProcessed++;
        
        try {
          const dealId = deal['Deal - ID'];
          const dealValue = parseFloat(deal['Deal - Value'].replace(/[^0-9.-]+/g, '')); // Remove currency symbols
          
          // Add product to deal
          const addProductUrl = `https://api.pipedrive.com/v1/deals/${dealId}/products?api_token=${apiKey}`;
          
          const productData = {
            product_id: productId,
            item_price: dealValue,
            quantity: 1
          };

          const response = await fetch(addProductUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify(productData)
          });

          const responseData = await response.json();

          if (response.ok && responseData.success) {
            results.successful.push({
              dealId,
              dealIPC: deal['Deal - IPC'],
              value: dealValue,
              message: 'Product added successfully'
            });
            results.totalSuccess++;
          } else {
            // Handle rate limit errors specifically
            if (response.status === 429) {
              throw new Error('Rate limit exceeded - will retry in next batch');
            }
            results.failed.push({
              dealId,
              dealIPC: deal['Deal - IPC'],
              value: dealValue,
              error: responseData.error || 'Failed to add product',
              details: responseData
            });
            results.totalFailed++;
          }
        } catch (error) {
          results.failed.push({
            dealId: deal['Deal - ID'],
            dealIPC: deal['Deal - IPC'],
            value: deal['Deal - Value'],
            error: (error as Error).message,
            details: 'Exception occurred during processing'
          });
          results.totalFailed++;
        }
      });

      // Wait for current batch to complete
      await Promise.all(batchPromises);

      // Add delay between batches (except for the last batch)
      if (i + BATCH_SIZE < dealsToUpdate.length) {
        console.log(`Completed batch ${Math.floor(i / BATCH_SIZE) + 1}, waiting ${BATCH_DELAY}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }

    const estimatedTime = Math.ceil(dealsToUpdate.length / BATCH_SIZE) * (BATCH_DELAY / 1000);
    
    return NextResponse.json({
      success: true,
      message: `Processed ${results.totalProcessed} deals`,
      results,
      timestamp: new Date().toISOString(),
      batchInfo: {
        batchSize: BATCH_SIZE,
        totalBatches: Math.ceil(dealsToUpdate.length / BATCH_SIZE),
        estimatedTimeSeconds: estimatedTime,
        tokensUsed: results.totalSuccess * 10 // 10 tokens per successful update
      }
    });

  } catch (error) {
    console.error('API Error in Pipedrive deals update route:', error);
    return NextResponse.json(
      { message: 'Internal server error', error: (error as Error).message },
      { status: 500 }
    );
  }
} 