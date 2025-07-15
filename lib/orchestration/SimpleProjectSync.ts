export interface PipedriveDeal {
  id: number;
  title: string;
  status: string;
  value: number;
  currency: string;
  org_name?: string;
  pipeline_id: number;
  stage_id: number;
  won_time?: string;
}

export interface XeroProject {
  projectId: string;
  name: string;
  contactName: string;
  status: string;
  totalAmount?: {
    value: number;
    currency: string;
  };
}

export class SimpleProjectSync {
  private tenantId: string;
  private apiKey: string;

  constructor(tenantId: string, apiKey: string) {
    this.tenantId = tenantId;
    this.apiKey = apiKey;
  }

  /**
   * Fetch won deals from Pipedrive v2 API
   */
  async fetchPipedriveWonDeals(): Promise<PipedriveDeal[]> {
    console.log(`\n=== FETCHING PIPEDRIVE WON DEALS FOR TENANT: ${this.tenantId} ===`);
    
    try {
      // Using Pipedrive v2 API with won status filter
      const url = `https://api.pipedrive.com/v2/deals?api_token=${this.apiKey}&status=won`;
      console.log('Fetching from URL:', url.replace(this.apiKey, 'REDACTED'));
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`Total deals received: ${data.data?.length || 0}`);
      
      // Filter for won deals only (double-check)
      const wonDeals = data.data?.filter((deal: any) => deal.status === 'won') || [];
      console.log(`Won deals count: ${wonDeals.length}`);
      
      // Log first 3 deals for debugging
      console.log('\nFirst 3 won deals:');
      wonDeals.slice(0, 3).forEach((deal: any, index: number) => {
        console.log(`${index + 1}. ID: ${deal.id}, Title: "${deal.title}", Value: ${deal.value} ${deal.currency}`);
      });
      
      return wonDeals;
    } catch (error) {
      console.error('Error fetching Pipedrive deals:', error);
      throw error;
    }
  }

  /**
   * Generate matching key from title
   * Format: jobcode - vessel name
   * Example: "NY25202 - LST 207 RSS ENDURANCE" -> "ny25202-lst207rssendurance"
   */
  generateMatchingKey(title: string): string {
    if (!title) return '';
    
    // Match pattern: JOBCODE - VESSEL NAME
    const match = title.match(/^([A-Z]+\d+)\s*[-\s]+\s*(.+)$/i);
    
    if (match) {
      const jobCode = match[1].toLowerCase(); // e.g., "ny25202"
      const vesselName = match[2]
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ''); // Remove all non-alphanumeric
      
      const key = `${jobCode}-${vesselName}`;
      console.log(`Title: "${title}" -> Key: "${key}"`);
      return key;
    }
    
    // Fallback: normalize entire title
    const fallbackKey = title.toLowerCase().replace(/[^a-z0-9]+/g, '');
    console.log(`Title: "${title}" -> Fallback Key: "${fallbackKey}"`);
    return fallbackKey;
  }

  /**
   * Process Pipedrive deals and generate matching keys
   */
  async processPipedriveDeals(): Promise<any[]> {
    console.log('\n=== PROCESSING PIPEDRIVE DEALS ===');
    
    const deals = await this.fetchPipedriveWonDeals();
    
    console.log('\nGenerating matching keys for all deals:');
    console.log('=====================================');
    
    const processedDeals = deals.map((deal: PipedriveDeal) => {
      const matchingKey = this.generateMatchingKey(deal.title);
      return {
        id: deal.id,
        title: deal.title,
        matchingKey: matchingKey,
        value: deal.value,
        currency: deal.currency,
        org_name: deal.org_name
      };
    });
    
    // Log all processed deals
    processedDeals.forEach((deal, index) => {
      console.log(`${index + 1}. "${deal.title}"`);
      console.log(`   Key: ${deal.matchingKey}`);
      console.log(`   Value: ${deal.value} ${deal.currency}`);
      console.log(`   Org: ${deal.org_name || 'N/A'}`);
      console.log('');
    });
    
    console.log(`\nTotal processed deals: ${processedDeals.length}`);
    
    // Group by job code prefix (NY, ME, etc.)
    const groupedByPrefix: { [key: string]: number } = {};
    processedDeals.forEach(deal => {
      const prefix = deal.matchingKey.match(/^([a-z]+)/)?.[1] || 'other';
      groupedByPrefix[prefix] = (groupedByPrefix[prefix] || 0) + 1;
    });
    
    console.log('\nDeals grouped by prefix:');
    Object.entries(groupedByPrefix).forEach(([prefix, count]) => {
      console.log(`  ${prefix.toUpperCase()}: ${count} deals`);
    });
    
    return processedDeals;
  }
}