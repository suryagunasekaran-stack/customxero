interface PipedriveDealsResponse {
  data: Array<{
    id: number;
    title: string;
    status: string;
    pipeline_id: number;
    value: number;
    currency: string;
    won_time: string;
    [key: string]: any; // For custom fields
  }>;
  success?: boolean;
  additional_data?: {
    pagination?: {
      start: number;
      limit: number;
      more_items_in_collection: boolean;
      next_start?: number;
    };
  };
}

export class PipedriveServiceV2 {
  private apiKey: string;
  private companyDomain: string;

  // Define the WIP pipeline IDs we need to check
  private readonly WIP_PIPELINE_IDS = [6, 7, 8, 3, 5, 4, 9, 16];

  constructor(apiKey: string, companyDomain: string = 'api') {
    this.apiKey = apiKey;
    this.companyDomain = companyDomain;
  }

  /**
   * Get pipeline name mapping
   */
  getPipelineNames(): { [key: number]: string } {
    return {
      6: 'WIP - Afloat Repairs',
      7: 'WIP - Engine Overhauling', 
      8: 'WIP - Electricals',
      3: 'WIP - Engine Recon',
      5: 'WIP - Laser Cladding',
      4: 'WIP - Machine Shop',
      9: 'WIP - Mechanical',
      16: 'WIP - Navy'
    };
  }

  /**
   * Fetch won deals from a single pipeline
   */
  async getWonDealsFromPipeline(pipelineId: number): Promise<any[]> {
    const deals: any[] = [];
    let cursor: string | null = null;
    const limit = 100;
    let moreItemsInCollection = true;
    let pageCount = 0;

    console.log(`Fetching won deals from pipeline ${pipelineId}...`);

    while (moreItemsInCollection) {
      // Use the correct URL format with company domain
      const url = new URL(`https://${this.companyDomain}.pipedrive.com/api/v2/deals`);
      url.searchParams.append('limit', limit.toString());
      url.searchParams.append('status', 'won');
      url.searchParams.append('pipeline_id', pipelineId.toString());
      if (cursor) {
        url.searchParams.append('cursor', cursor);
      }
      
      try {
        const response = await fetch(url.toString(), {
          headers: {
            'Accept': 'application/json',
            'x-api-token': this.apiKey
          }
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Failed to fetch deals from pipeline ${pipelineId}: ${response.status} - ${errorText}`);
          throw new Error(`Failed to fetch deals from pipeline ${pipelineId}: ${response.status}`);
        }

        const data = await response.json();
        
        if (!data.success) {
          throw new Error(`Pipedrive API error: ${data.error || 'Unknown error'}`);
        }
        
        if (data.data && Array.isArray(data.data)) {
          deals.push(...data.data);
          pageCount++;
          console.log(`Fetched ${data.data.length} deals from pipeline ${pipelineId} (page ${pageCount})`);
        }

        // Check for next cursor (v2 pagination)
        if (data.additional_data?.next_cursor) {
          cursor = data.additional_data.next_cursor;
          moreItemsInCollection = true;
        } else {
          moreItemsInCollection = false;
        }

      } catch (error) {
        console.error(`Error fetching deals from pipeline ${pipelineId}:`, error);
        throw error;
      }
    }

    console.log(`Total deals fetched from pipeline ${pipelineId}: ${deals.length}`);
    return deals;
  }

  /**
   * Process all WIP pipelines one by one
   */
  async processAllWIPPipelines(
    onPipelineProgress: (pipelineId: number, pipelineName: string, status: string, deals?: any[]) => void
  ): Promise<Map<number, any[]>> {
    const pipelineNames = this.getPipelineNames();
    const allDealsByPipeline = new Map<number, any[]>();

    for (const pipelineId of this.WIP_PIPELINE_IDS) {
      const pipelineName = pipelineNames[pipelineId] || `Pipeline ${pipelineId}`;
      
      try {
        onPipelineProgress(pipelineId, pipelineName, 'fetching');
        
        const deals = await this.getWonDealsFromPipeline(pipelineId);
        allDealsByPipeline.set(pipelineId, deals);
        
        onPipelineProgress(pipelineId, pipelineName, 'completed', deals);
        
      } catch (error) {
        onPipelineProgress(pipelineId, pipelineName, 'error');
        console.error(`Failed to process pipeline ${pipelineId}:`, error);
        // Continue with next pipeline
        allDealsByPipeline.set(pipelineId, []);
      }
    }

    return allDealsByPipeline;
  }

  /**
   * Get all WIP pipeline IDs
   */
  getWIPPipelineIds(): number[] {
    return this.WIP_PIPELINE_IDS;
  }
}