import { NextResponse } from 'next/server';
import { ensureValidToken } from '@/lib/ensureXeroToken'; // Ensure this path is correct

export async function GET() {
  console.log('[Xero API Route] Received GET request for projects.');

  try {
    const { access_token, effective_tenant_id } = await ensureValidToken();
    console.log('[Xero API Route] Successfully obtained Xero token and tenant ID.');

    const projectStates = 'INPROGRESS,CLOSED'; // Fetch both in-progress and closed projects
    let allProjects: any[] = [];
    let page = 1;
    const pageSize = 50; // Xero API default is 50, max is 50 for projects
    let hasMorePages = true;

    while (hasMorePages) {
      // Corrected Xero Projects API endpoint to version 2.0
      const url = `https://api.xero.com/projects.xro/2.0/projects?states=${projectStates}&page=${page}&pageSize=${pageSize}`;
      console.log(`[Xero API Route] Fetching projects from Xero: ${url}`);

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Xero-Tenant-Id': effective_tenant_id, // Corrected header name
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        let errorBody = '';
        try {
          // Try to parse as JSON first, as Xero API errors are often JSON
          const jsonError = await response.json();
          errorBody = JSON.stringify(jsonError);
          console.error('[Xero API Route] Xero API Error (JSON):', errorBody);
        } catch (e) {
          // Fallback to text if JSON parsing fails
          errorBody = await response.text();
          console.error('[Xero API Route] Xero API Error (Text):', errorBody);
        }
        // Ensure a default message if errorBody is still empty
        const errorMessage = errorBody || response.statusText || 'Unknown Xero API error';
        console.error('[Xero API Route] Error fetching Xero projects. Status:', response.status, 'Body:', errorMessage);
        throw new Error(`Xero API error: ${response.status} - ${errorMessage}`);
      }

      const data = await response.json();
      // console.log('[Xero API Route] Raw Xero projects data (page ${page}):', JSON.stringify(data, null, 2));

      if (data && data.items && Array.isArray(data.items)) {
        allProjects = allProjects.concat(data.items);
        console.log(`[Xero API Route] Fetched ${data.items.length} projects from page ${page}. Total fetched so far: ${allProjects.length}`);
        
        // Check for pagination: Xero typically includes pagination info
        // For the Projects API, it seems `page` and `pageSize` control it, and if `items` is less than `pageSize` or empty, it's the last page.
        if (data.items.length < pageSize) {
          hasMorePages = false;
        } else {
          page++;
        }
      } else {
        console.warn('[Xero API Route] No items array in Xero response or data is not as expected:', data);
        hasMorePages = false; // Stop if no items are found or structure is wrong
      }
    }

    console.log(`[Xero API Route] Successfully fetched a total of ${allProjects.length} projects from Xero.`);
    return NextResponse.json({ projects: allProjects });

  } catch (error) {
    console.error('[Xero API Route] Overall error in GET projects:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ message: 'Failed to fetch Xero projects', error: errorMessage }, { status: 500 });
  }
}
