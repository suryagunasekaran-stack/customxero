import { NextResponse } from 'next/server';

/**
 * GET /api/pipedrive/projects - Fetches won deals (projects) from Pipedrive API
 * Retrieves all won deals with pagination and includes stage mapping for status
 * @returns {Promise<NextResponse>} JSON response with projects array or error
 */
export async function GET() {
  const apiKey = process.env.PIPEDRIVE_KEY;

  if (!apiKey) {
    console.error('API Error: PIPEDRIVE_KEY is not set in .env.local');
    return NextResponse.json(
      { message: 'Pipedrive API key is not configured. Please set PIPEDRIVE_KEY in .env.local.' },
      { status: 500 }
    );
  }

  let allDeals: any[] = [];
  let start = 0;
  const limit = 100; // Pipedrive API limit per page, can be up to 500
  let moreItemsInCollection = true;

  console.log('API: Attempting to fetch all won projects (deals) from Pipedrive with pagination...');

  try {
    // Fetch all deals
    while (moreItemsInCollection) {
      const dealsApiUrl = `https://api.pipedrive.com/v1/deals?api_token=${apiKey}&status=won&start=${start}&limit=${limit}`;
      console.log(`API: Fetching deals from Pipedrive: start=${start}, limit=${limit}`);
      const response = await fetch(dealsApiUrl, { headers: { 'Accept': 'application/json' } });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`API Error fetching Pipedrive deals: ${response.status} ${response.statusText}`, errorBody);
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
          console.log('API: All Pipedrive deals fetched.');
        }
      } else {
        console.warn('API Warning: No pagination data in Pipedrive deals response. Assuming no more items.');
        moreItemsInCollection = false;
      }
    }

    // Fetch all stages to map stage_id to stage_name
    console.log('API: Fetching Pipedrive stages...');
    const stagesApiUrl = `https://api.pipedrive.com/v1/stages?api_token=${apiKey}`;
    const stagesResponse = await fetch(stagesApiUrl, { headers: { 'Accept': 'application/json' } });

    if (!stagesResponse.ok) {
      const errorBody = await stagesResponse.text();
      console.error(`API Error fetching Pipedrive stages: ${stagesResponse.status} ${stagesResponse.statusText}`, errorBody);
      // Continue without stage names if this fails, or throw error
      throw new Error(`Pipedrive API request for stages failed with status ${stagesResponse.status}: ${errorBody}`);
    }

    const stagesData = await stagesResponse.json();
    const stageMap = new Map<number, string>();
    if (stagesData && stagesData.data) {
      stagesData.data.forEach((stage: any) => {
        stageMap.set(stage.id, stage.name);
      });
      console.log('API: Pipedrive stages fetched and mapped.');
    } else {
      console.warn('API Warning: No data in Pipedrive stages response or invalid structure.');
    }

    const projects = allDeals.map((deal: any) => ({
      id: deal.id,
      name: deal.title,
      status: deal.status,
      stage_id: deal.stage_id,
      stage_name: stageMap.get(deal.stage_id) || 'Unknown Stage', // Add stage_name
      // value: deal.value,
      // currency: deal.currency,
      // add_time: deal.add_time,
      // update_time: deal.update_time
    }));

    console.log(`API: Successfully processed a total of ${projects.length} projects from Pipedrive.`);
    return NextResponse.json({ message: 'Pipedrive projects fetched successfully', projects });

  } catch (error) {
    console.error('API Error fetching Pipedrive projects or stages:', error);
    return NextResponse.json(
      { message: 'Error fetching Pipedrive projects or stages', error: (error as Error).message },
      { status: 500 }
    );
  }
}
