/**
 * Utility functions for Pipedrive API interactions
 */

import { logger } from '@/lib/logger';

export interface PipedriveDeal {
  id: number;
  title?: string;
  name?: string; // API returns 'name' field
  value: number;
  currency: string;
  status: string;
  pipeline_id: number;
  stage_id: number;
  org_id?: number;
  org_name?: string;
  person_id?: number;
  person_name?: string;
  won_time?: string;
  add_time: string;
  update_time: string;
  stage_order_nr?: number;
  active?: boolean;
  deleted?: boolean;
  [key: string]: any; // For custom fields
}

export interface DetailedDeal extends PipedriveDeal {
  organization?: PipedriveOrganization;
  customFieldValues?: Record<string, any>;
}

export interface PipedriveOrganization {
  id: number;
  name: string;
  address?: string;
  active_flag?: boolean;
  [key: string]: any;
}

export interface PipedriveApiResponse<T> {
  success: boolean;
  data: T;
  additional_data?: {
    pagination?: {
      start: number;
      limit: number;
      more_items_in_collection: boolean;
      next_start?: number;
    };
  };
  error?: string;
  error_info?: string;
}

/**
 * Constructs a complete Pipedrive API URL with query parameters
 * 
 * @description Builds the full API URL by combining the domain, endpoint, and optional
 * query parameters. Handles URL encoding and filters out undefined/null values.
 * 
 * @param {string} domain - The Pipedrive company domain (e.g., 'api', 'bseni')
 * @param {string} endpoint - The API endpoint path (e.g., 'deals', 'organizations/123')
 * @param {Record<string, string | number | boolean>} [params] - Optional query parameters
 * @returns {string} Complete Pipedrive API URL with query string
 * 
 * @example
 * ```typescript
 * // Basic URL without parameters
 * const url1 = buildPipedriveApiUrl('api', 'deals');
 * // Returns: "https://api.pipedrive.com/api/v1/deals"
 * 
 * // URL with query parameters
 * const url2 = buildPipedriveApiUrl('bseni', 'deals', {
 *   api_token: 'abc123',
 *   status: 'won',
 *   limit: 100
 * });
 * // Returns: "https://bseni.pipedrive.com/api/v1/deals?api_token=abc123&status=won&limit=100"
 * ```
 * 
 * @since 1.0.0
 */
export function buildPipedriveApiUrl(
  domain: string,
  endpoint: string,
  params?: Record<string, string | number | boolean>
): string {
  const baseUrl = `https://${domain}.pipedrive.com/api/v1/${endpoint}`;
  
  if (!params || Object.keys(params).length === 0) {
    return baseUrl;
  }
  
  const queryString = Object.entries(params)
    .filter(([_, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join('&');
  
  return `${baseUrl}?${queryString}`;
}

/**
 * Fetches all deals from a specific Pipedrive pipeline with automatic pagination handling
 * 
 * @description Retrieves all deals from a pipeline by handling Pipedrive's pagination automatically.
 * Filters results by pipeline ID and applies rate limiting through logging. Continues fetching
 * until all pages are retrieved.
 * 
 * @param {string} apiKey - The Pipedrive API token for authentication
 * @param {string} companyDomain - The Pipedrive company domain (e.g., 'api', 'bseni')
 * @param {number} pipelineId - The specific pipeline ID to fetch deals from
 * @param {'won' | 'lost' | 'all_not_deleted'} [status='won'] - Deal status filter
 * @returns {Promise<PipedriveDeal[]>} Promise resolving to array of all deals in the pipeline
 * 
 * @throws {Error} When API request fails or returns error response
 * 
 * @example
 * ```typescript
 * // Fetch won deals from pipeline 2
 * const wonDeals = await fetchPipedriveDealsWithPagination(
 *   'your-api-key',
 *   'api', 
 *   2,
 *   'won'
 * );
 * console.log(`Found ${wonDeals.length} won deals`);
 * 
 * // Fetch all deals (won, lost, open) from multiple status
 * const allDeals = await fetchPipedriveDealsWithPagination(
 *   'your-api-key',
 *   'bseni',
 *   5,
 *   'all_not_deleted'
 * );
 * ```
 * 
 * @since 1.0.0
 */
export async function fetchPipedriveDealsWithPagination(
  apiKey: string,
  companyDomain: string,
  pipelineId: number,
  status: 'won' | 'lost' | 'all_not_deleted' = 'won'
): Promise<PipedriveDeal[]> {
  const allDeals: PipedriveDeal[] = [];
  let start = 0;
  const limit = 100;
  let moreItems = true;
  
  logger.info({ companyDomain, pipelineId, status }, 'Fetching Pipedrive deals');
  
  while (moreItems) {
    try {
      const url = buildPipedriveApiUrl(companyDomain, 'deals', {
        api_token: apiKey,
        status,
        start,
        limit,
        filter_id: pipelineId // This filters by pipeline
      });
      
      const response = await fetch(url);
      
      if (!response.ok) {
        logger.error({ 
          status: response.status, 
          statusText: response.statusText 
        }, 'Pipedrive API request failed');
        throw new Error(`Pipedrive API error: ${response.status} ${response.statusText}`);
      }
      
      const data: PipedriveApiResponse<PipedriveDeal[]> = await response.json();
      
      if (!data.success) {
        logger.error({ error: data.error }, 'Pipedrive API returned error');
        throw new Error(data.error || 'Pipedrive API request failed');
      }
      
      if (data.data && Array.isArray(data.data)) {
        // Filter by pipeline_id since filter_id might not work as expected
        const pipelineDeals = data.data.filter(deal => deal.pipeline_id === pipelineId);
        allDeals.push(...pipelineDeals);
      }
      
      // Check pagination
      if (data.additional_data?.pagination) {
        moreItems = data.additional_data.pagination.more_items_in_collection;
        if (moreItems && data.additional_data.pagination.next_start !== undefined) {
          start = data.additional_data.pagination.next_start;
        } else {
          moreItems = false;
        }
      } else {
        moreItems = false;
      }
      
      logger.debug({ 
        fetched: data.data?.length || 0, 
        total: allDeals.length, 
        moreItems 
      }, 'Fetched batch of deals');
      
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : error }, 'Failed to fetch deals');
      throw error;
    }
  }
  
  logger.info({ totalDeals: allDeals.length, pipelineId }, 'Completed fetching all deals');
  return allDeals;
}

/**
 * Fetches deals from multiple Pipedrive pipelines concurrently with error resilience
 * 
 * @description Retrieves deals from multiple pipelines in sequence, continuing even if
 * individual pipelines fail. Aggregates results from all successful pipeline fetches.
 * Each pipeline is fetched with full pagination support.
 * 
 * @param {string} apiKey - The Pipedrive API token for authentication
 * @param {string} companyDomain - The Pipedrive company domain
 * @param {number[]} pipelineIds - Array of pipeline IDs to fetch deals from
 * @param {'won' | 'lost' | 'all_not_deleted'} [status='won'] - Deal status filter applied to all pipelines
 * @returns {Promise<PipedriveDeal[]>} Promise resolving to combined array of deals from all pipelines
 * 
 * @example
 * ```typescript
 * // Fetch won deals from multiple work-in-progress pipelines
 * const pipelineIds = [2, 3, 4, 5];
 * const allWipDeals = await fetchDealsFromMultiplePipelines(
 *   'your-api-key',
 *   'bseni',
 *   pipelineIds,
 *   'won'
 * );
 * 
 * console.log(`Total deals across ${pipelineIds.length} pipelines: ${allWipDeals.length}`);
 * 
 * // Group deals by pipeline for analysis
 * const dealsByPipeline = allWipDeals.reduce((acc, deal) => {
 *   acc[deal.pipeline_id] = (acc[deal.pipeline_id] || 0) + 1;
 *   return acc;
 * }, {});
 * ```
 * 
 * @since 1.0.0
 */
export async function fetchDealsFromMultiplePipelines(
  apiKey: string,
  companyDomain: string,
  pipelineIds: number[],
  status: 'won' | 'lost' | 'all_not_deleted' = 'won'
): Promise<PipedriveDeal[]> {
  const allDeals: PipedriveDeal[] = [];
  
  for (const pipelineId of pipelineIds) {
    try {
      const pipelineDeals = await fetchPipedriveDealsWithPagination(
        apiKey,
        companyDomain,
        pipelineId,
        status
      );
      allDeals.push(...pipelineDeals);
    } catch (error) {
      logger.error({ 
        pipelineId, 
        error: error instanceof Error ? error.message : error 
      }, 'Failed to fetch deals from pipeline');
      // Continue with other pipelines even if one fails
    }
  }
  
  return allDeals;
}

/**
 * Fetches comprehensive details for a single Pipedrive deal including organization data
 * 
 * @description Retrieves detailed information for a specific deal, including custom fields
 * and associated organization details. Extracts custom field values and enhances the
 * deal object with additional metadata.
 * 
 * @param {string} apiKey - The Pipedrive API token for authentication
 * @param {string} companyDomain - The Pipedrive company domain
 * @param {number} dealId - The unique ID of the deal to fetch
 * @returns {Promise<DetailedDeal | null>} Promise resolving to detailed deal object or null if not found
 * 
 * @example
 * ```typescript
 * // Fetch detailed information for a specific deal
 * const dealDetails = await fetchDealDetails('your-api-key', 'api', 12345);
 * 
 * if (dealDetails) {
 *   console.log(`Deal: ${dealDetails.title}`);
 *   console.log(`Value: ${dealDetails.value} ${dealDetails.currency}`);
 *   
 *   // Access custom field values
 *   console.log('Custom fields:', dealDetails.customFieldValues);
 *   
 *   // Access organization details
 *   if (dealDetails.organization) {
 *     console.log(`Organization: ${dealDetails.organization.name}`);
 *   }
 * } else {
 *   console.log('Deal not found or access denied');
 * }
 * ```
 * 
 * @since 1.0.0
 */
export async function fetchDealDetails(
  apiKey: string,
  companyDomain: string,
  dealId: number
): Promise<DetailedDeal | null> {
  try {
    const url = buildPipedriveApiUrl(companyDomain, `deals/${dealId}`, {
      api_token: apiKey
    });
    
    const response = await fetch(url);
    
    if (!response.ok) {
      logger.error({ 
        dealId, 
        status: response.status 
      }, 'Failed to fetch deal details');
      return null;
    }
    
    const data: PipedriveApiResponse<PipedriveDeal> = await response.json();
    
    if (!data.success || !data.data) {
      return null;
    }
    
    const deal = data.data;
    const detailedDeal: DetailedDeal = {
      ...deal,
      customFieldValues: extractCustomFields(deal)
    };
    
    // Fetch organization details if available
    if (deal.org_id) {
      const org = await fetchOrganizationDetails(apiKey, companyDomain, deal.org_id);
      if (org) {
        detailedDeal.organization = org;
      }
    }
    
    return detailedDeal;
    
  } catch (error) {
    logger.error({ 
      dealId, 
      error: error instanceof Error ? error.message : error 
    }, 'Error fetching deal details');
    return null;
  }
}

/**
 * Fetches detailed information for a Pipedrive organization by ID
 * 
 * @description Retrieves organization details from Pipedrive API. Used to enhance deal
 * objects with complete organization information including name, address, and status.
 * 
 * @param {string} apiKey - The Pipedrive API token for authentication
 * @param {string} companyDomain - The Pipedrive company domain
 * @param {number} orgId - The unique ID of the organization to fetch
 * @returns {Promise<PipedriveOrganization | null>} Promise resolving to organization object or null if not found
 * 
 * @example
 * ```typescript
 * // Fetch organization details
 * const org = await fetchOrganizationDetails('your-api-key', 'api', 456);
 * 
 * if (org) {
 *   console.log(`Organization: ${org.name}`);
 *   console.log(`Active: ${org.active_flag}`);
 *   if (org.address) {
 *     console.log(`Address: ${org.address}`);
 *   }
 * }
 * ```
 * 
 * @since 1.0.0
 */
export async function fetchOrganizationDetails(
  apiKey: string,
  companyDomain: string,
  orgId: number
): Promise<PipedriveOrganization | null> {
  try {
    const url = buildPipedriveApiUrl(companyDomain, `organizations/${orgId}`, {
      api_token: apiKey
    });
    
    const response = await fetch(url);
    
    if (!response.ok) {
      return null;
    }
    
    const data: PipedriveApiResponse<PipedriveOrganization> = await response.json();
    
    if (!data.success || !data.data) {
      return null;
    }
    
    return data.data;
    
  } catch (error) {
    logger.error({ 
      orgId, 
      error: error instanceof Error ? error.message : error 
    }, 'Error fetching organization');
    return null;
  }
}

/**
 * Fetches detailed information for multiple deals in batches with rate limiting
 * 
 * @description Processes multiple deal IDs in batches to retrieve detailed information
 * while respecting API rate limits. Includes automatic delays between batches and
 * handles individual deal fetch failures gracefully.
 * 
 * @param {string} apiKey - The Pipedrive API token for authentication
 * @param {string} companyDomain - The Pipedrive company domain
 * @param {number[]} dealIds - Array of deal IDs to fetch details for
 * @param {number} [batchSize=10] - Number of deals to process concurrently per batch
 * @returns {Promise<(DetailedDeal | null)[]>} Promise resolving to array of detailed deals (null for failed fetches)
 * 
 * @example
 * ```typescript
 * // Fetch details for multiple deals with default batch size
 * const dealIds = [123, 456, 789, 101112];
 * const dealDetails = await fetchBatchDealDetails(
 *   'your-api-key',
 *   'api',
 *   dealIds
 * );
 * 
 * // Filter out failed fetches and process successful ones
 * const successfulDeals = dealDetails.filter(deal => deal !== null);
 * console.log(`Successfully fetched ${successfulDeals.length}/${dealIds.length} deals`);
 * 
 * // Use smaller batch size for rate limit sensitive operations
 * const sensitiveDetails = await fetchBatchDealDetails(
 *   'your-api-key',
 *   'api',
 *   largeArrayOfIds,
 *   5 // Smaller batches
 * );
 * ```
 * 
 * @since 1.0.0
 */
export async function fetchBatchDealDetails(
  apiKey: string,
  companyDomain: string,
  dealIds: number[],
  batchSize: number = 10
): Promise<(DetailedDeal | null)[]> {
  const results: (DetailedDeal | null)[] = [];
  
  // Process in batches to avoid rate limiting
  for (let i = 0; i < dealIds.length; i += batchSize) {
    const batch = dealIds.slice(i, i + batchSize);
    const batchPromises = batch.map(id => 
      fetchDealDetails(apiKey, companyDomain, id)
    );
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Add small delay between batches to respect rate limits
    if (i + batchSize < dealIds.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  return results;
}

/**
 * Extract custom fields from deal object
 */
function extractCustomFields(deal: PipedriveDeal): Record<string, any> {
  const customFields: Record<string, any> = {};
  
  // Pipedrive custom fields are included directly in the deal object
  // They have hash-like field IDs
  for (const [key, value] of Object.entries(deal)) {
    // Custom field IDs are typically 40-character hashes
    if (key.length === 40 && /^[a-f0-9]+$/.test(key)) {
      customFields[key] = value;
    }
  }
  
  return customFields;
}