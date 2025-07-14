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
 * GET /api/pipedrive/projects - Fetches won deals (projects) from Pipedrive API
 * Retrieves all won deals with pagination and includes stage mapping for status
 * Uses tenant-specific API keys and blocks access for tenants that don't use Pipedrive
 * @returns {Promise<NextResponse>} JSON response with projects array or error
 */
export async function GET() {
  try {
    // Get the current tenant information
    const { effective_tenant_id } = await ensureValidToken();
    
    // Get tenant-specific Pipedrive configuration
    const tenantConfig = TENANT_PIPEDRIVE_CONFIG[effective_tenant_id as keyof typeof TENANT_PIPEDRIVE_CONFIG];
    
    if (!tenantConfig) {
      console.error(`API Error: No Pipedrive configuration found for tenant: ${effective_tenant_id}`);
      return NextResponse.json(
        { message: 'Pipedrive integration not configured for this tenant.' },
        { status: 403 }
      );
    }

    if (!tenantConfig.enabled) {
      console.log(`API Info: Pipedrive integration is disabled for tenant: ${effective_tenant_id} (${tenantConfig.description})`);
      return NextResponse.json(
        { message: 'Pipedrive integration is disabled for this organization.' },
        { status: 403 }
      );
    }

    const apiKey = tenantConfig.apiKey;

    if (!apiKey) {
      console.error(`API Error: PIPEDRIVE_KEY is not set for tenant: ${effective_tenant_id} (${tenantConfig.description})`);
      return NextResponse.json(
        { message: 'Pipedrive API key is not configured for this tenant.' },
        { status: 500 }
      );
    }

    let allDeals: any[] = [];
    let start = 0;
    const limit = 100; // Pipedrive API limit per page, can be up to 500
    let moreItemsInCollection = true;

    console.log(`API: Attempting to fetch all won projects (deals) from Pipedrive for tenant ${effective_tenant_id} (${tenantConfig.description})...`);

    try {
      // Fetch all deals
      while (moreItemsInCollection) {
        const dealsApiUrl = `https://api.pipedrive.com/v1/deals?api_token=${apiKey}&status=won&start=${start}&limit=${limit}`;
        console.log(`API: Fetching deals from Pipedrive: start=${start}, limit=${limit} for tenant ${effective_tenant_id}`);
        const response = await fetch(dealsApiUrl, { headers: { 'Accept': 'application/json' } });

        if (!response.ok) {
          const errorBody = await response.text();
          console.error(`API Error fetching Pipedrive deals for tenant ${effective_tenant_id}: ${response.status} ${response.statusText}`, errorBody);
          throw new Error(`Pipedrive API request for deals failed at start=${start} with status ${response.status}: ${errorBody}`);
        }
        const pipedriveData = await response.json();
        if (pipedriveData.data && pipedriveData.data.length > 0) {
          allDeals = allDeals.concat(pipedriveData.data);
        }
        if (pipedriveData.additional_data && pipedriveData.additional_data.pagination) {
          moreItemsInCollection = pipedriveData.additional_data.pagination.more_items_in_collection;
          if (moreItemsInCollection) {
            start = pipedriveData.additional_data.pagination.next_start;
          } else {
            console.log(`API: All Pipedrive deals fetched for tenant ${effective_tenant_id}.`);
          }
        } else {
          console.warn(`API Warning: No pagination data in Pipedrive deals response for tenant ${effective_tenant_id}. Assuming no more items.`);
          moreItemsInCollection = false;
        }
      }

      // Fetch all stages to map stage_id to stage_name
      console.log(`API: Fetching Pipedrive stages for tenant ${effective_tenant_id}...`);
      const stagesApiUrl = `https://api.pipedrive.com/v1/stages?api_token=${apiKey}`;
      const stagesResponse = await fetch(stagesApiUrl, { headers: { 'Accept': 'application/json' } });

      if (!stagesResponse.ok) {
        const errorBody = await stagesResponse.text();
        console.error(`API Error fetching Pipedrive stages for tenant ${effective_tenant_id}: ${stagesResponse.status} ${stagesResponse.statusText}`, errorBody);
        // Continue without stage names if this fails, or throw error
        throw new Error(`Pipedrive API request for stages failed with status ${stagesResponse.status}: ${errorBody}`);
      }

      const stagesData = await stagesResponse.json();
      const stageMap = new Map<number, string>();
      if (stagesData && stagesData.data) {
        stagesData.data.forEach((stage: any) => {
          stageMap.set(stage.id, stage.name);
        });
        console.log(`API: Pipedrive stages fetched and mapped for tenant ${effective_tenant_id}.`);
      } else {
        console.warn(`API Warning: No data in Pipedrive stages response for tenant ${effective_tenant_id} or invalid structure.`);
      }

      const projects = allDeals.map((deal: any) => ({
        id: deal.id,
        name: deal.title,
        title: deal.title, // Add title field for compatibility
        status: deal.status,
        stage_id: deal.stage_id,
        stage_name: stageMap.get(deal.stage_id) || 'Unknown Stage', // Add stage_name
        value: deal.value,
        currency: deal.currency,
        org_name: deal.org_name,
        person_name: deal.person_name,
        add_time: deal.add_time,
        update_time: deal.update_time,
        won_time: deal.won_time
      }));

      console.log(`API: Successfully processed a total of ${projects.length} projects from Pipedrive for tenant ${effective_tenant_id} (${tenantConfig.description}).`);
      return NextResponse.json({ 
        message: `Pipedrive projects fetched successfully for ${tenantConfig.description}`, 
        projects,
        tenantId: effective_tenant_id,
        tenantDescription: tenantConfig.description
      });

    } catch (error) {
      console.error(`API Error fetching Pipedrive projects or stages for tenant ${effective_tenant_id}:`, error);
      return NextResponse.json(
        { message: 'Error fetching Pipedrive projects or stages', error: (error as Error).message },
        { status: 500 }
      );
    }
  } catch (tokenError) {
    console.error('API Error: Failed to validate token or get tenant info:', tokenError);
    return NextResponse.json(
      { message: 'Authentication error. Please log in again.', error: (tokenError as Error).message },
      { status: 401 }
    );
  }
}
