interface Pipeline {
  id: number;
  name: string;
  url_title: string;
  order_nr: number;
  active: boolean;
  deal_probability: boolean;
  add_time: string;
  update_time: string;
  selected: boolean;
}

interface PipedriveDealsResponse {
  success: boolean;
  data: any[];
  additional_data?: {
    pagination?: {
      start: number;
      limit: number;
      more_items_in_collection: boolean;
      next_start?: number;
    };
  };
}

interface PipedriveDealFieldsResponse {
  success: boolean;
  data: Array<{
    id: string;
    key: string;
    name: string;
    order_nr: number;
    picklist_data?: any;
    field_type: string;
    json_column_flag: boolean;
    active_flag: boolean;
    edit_flag: boolean;
    bulk_edit_allowed: boolean;
    filtering_allowed: boolean;
    sortable_flag: boolean;
    searchable_flag: boolean;
    mandatory_flag: boolean;
  }>;
}

export class PipedriveService {
  private apiKey: string;
  private baseUrl = 'https://api.pipedrive.com/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Fetch all pipelines
   */
  async getPipelines(): Promise<Pipeline[]> {
    const url = `${this.baseUrl}/pipelines?api_token=${this.apiKey}`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch pipelines: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data || [];
  }

  /**
   * Get pipelines with names starting with "WIP"
   */
  async getWIPPipelines(): Promise<Pipeline[]> {
    const pipelines = await this.getPipelines();
    return pipelines.filter(pipeline => 
      pipeline.name.startsWith('WIP') && pipeline.active
    );
  }

  /**
   * Fetch won deals from specific pipelines using v1 API
   */
  async getWonDealsFromPipelines(pipelineIds: number[]): Promise<any[]> {
    let allDeals: any[] = [];

    for (const pipelineId of pipelineIds) {
      let start = 0;
      const limit = 100;
      let moreItemsInCollection = true;
      let pageCount = 0;

      console.log(`Fetching won deals from pipeline ${pipelineId}...`);

      while (moreItemsInCollection) {
        // Use v1 API endpoint which is more reliable
        const url = `https://api.pipedrive.com/v1/deals?api_token=${this.apiKey}&status=won&pipeline_id=${pipelineId}&start=${start}&limit=${limit}`;

        pageCount++;
        console.log(`Fetching page ${pageCount} for pipeline ${pipelineId}...`);

        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json'
          }
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to fetch deals from pipeline ${pipelineId}: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        
        if (!data.success) {
          throw new Error(`Pipedrive API error: ${data.error || 'Unknown error'}`);
        }
        
        const pageDeals = data.data || [];
        
        console.log(`Found ${pageDeals.length} deals in page ${pageCount} of pipeline ${pipelineId}`);
        allDeals = allDeals.concat(pageDeals);

        // Check for next page using v1 pagination
        if (data.additional_data?.pagination) {
          moreItemsInCollection = data.additional_data.pagination.more_items_in_collection;
          if (moreItemsInCollection && data.additional_data.pagination.next_start !== undefined) {
            start = data.additional_data.pagination.next_start;
          }
        } else {
          moreItemsInCollection = false;
        }
      }

      console.log(`Total deals found in pipeline ${pipelineId}: ${allDeals.filter(d => d.pipeline_id === pipelineId).length}`);
    }

    console.log(`Total deals found across all pipelines: ${allDeals.length}`);
    return allDeals;
  }

  /**
   * Get all won deals from WIP pipelines
   */
  async getWonDealsFromWIPPipelines(): Promise<any[]> {
    const wipPipelines = await this.getWIPPipelines();
    const pipelineIds = wipPipelines.map(p => p.id);
    
    console.log(`Found ${wipPipelines.length} WIP pipelines:`, wipPipelines.map(p => p.name));
    
    return this.getWonDealsFromPipelines(pipelineIds);
  }

  /**
   * Get deal details with custom fields
   */
  async getDealDetails(dealId: number): Promise<any> {
    const url = `https://api.pipedrive.com/v1/deals/${dealId}?api_token=${this.apiKey}`;
    const response = await fetch(url, {
      headers: { 
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch deal ${dealId}: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(`Pipedrive API error for deal ${dealId}: ${data.error || 'Unknown error'}`);
    }
    
    return data.data;
  }

  /**
   * Get deal custom field definitions
   */
  async getDealFields(): Promise<any[]> {
    const url = `${this.baseUrl}/dealFields?api_token=${this.apiKey}`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch deal fields: ${response.statusText}`);
    }

    const data: PipedriveDealFieldsResponse = await response.json();
    return data.data || [];
  }

  /**
   * Find custom field key by name
   */
  async findCustomFieldKeyByName(fieldName: string): Promise<string | null> {
    const fields = await this.getDealFields();
    const field = fields.find(f => f.name === fieldName);
    return field ? field.key : null;
  }

  /**
   * Batch fetch deal details
   */
  async batchGetDealDetails(dealIds: number[]): Promise<Map<number, any>> {
    const dealDetailsMap = new Map<number, any>();
    
    // Process in batches of 10 to avoid rate limits
    for (let i = 0; i < dealIds.length; i += 10) {
      const batch = dealIds.slice(i, i + 10);
      
      await Promise.all(batch.map(async (dealId) => {
        try {
          const details = await this.getDealDetails(dealId);
          dealDetailsMap.set(dealId, details);
        } catch (error) {
          console.error(`Failed to fetch deal ${dealId}:`, error);
        }
      }));
      
      // Small delay between batches
      if (i + 10 < dealIds.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return dealDetailsMap;
  }
}