import { NextResponse } from 'next/server';

// Helper function to extract the comparison key (IPC number)
const getComparisonKey = (name: string | undefined | null): string => {
  if (!name) return 'UNKNOWN_PROJECT_NAME';
  const parts = name.split(' - ');
  if (parts.length > 1) {
    return parts[0].replace(/\s+/g, '').toLowerCase(); // Remove spaces and lowercase
  }
  // Fallback: if " - " is not present, use the whole name, remove spaces, and lowercase
  return name.replace(/\s+/g, '').toLowerCase(); 
};

export async function POST(request: Request) {
  console.log('[Compare API Route] Received POST request for project comparison.');
  try {
    const { pipedriveProjects, xeroProjects } = await request.json();

    if (!Array.isArray(pipedriveProjects) || !Array.isArray(xeroProjects)) {
      console.error('[Compare API Route] Invalid or missing Pipedrive or Xero projects data in the request.');
      return NextResponse.json({ message: 'Invalid or missing project data. Expected arrays.' }, { status: 400 });
    }

    console.log(`[Compare API Route] Comparing ${pipedriveProjects.length} Pipedrive projects with ${xeroProjects.length} Xero projects.`);

    const pipedriveProjectMap = new Map(
      pipedriveProjects.map((p: any) => [getComparisonKey(p.name || p.title), p]) // p.title for Pipedrive deals
    );
    const xeroProjectMap = new Map(
      xeroProjects.map((x: any) => [getComparisonKey(x.name), x])
    );

    const matchedProjects: { pipedrive: any, xero: any }[] = [];
    const onlyInPipedrive: any[] = [];
    const onlyInXero: any[] = [];

    // Check projects in Pipedrive
    for (const [pdKey, pdProject] of pipedriveProjectMap.entries()) {
      if (xeroProjectMap.has(pdKey)) {
        matchedProjects.push({ pipedrive: pdProject, xero: xeroProjectMap.get(pdKey) });
      } else {
        onlyInPipedrive.push(pdProject);
      }
    }

    // Check projects in Xero that were not matched
    for (const [xKey, xProject] of xeroProjectMap.entries()) {
      if (!pipedriveProjectMap.has(xKey)) {
        onlyInXero.push(xProject);
      }
    }
    
    const comparisonResult = {
      matchedCount: matchedProjects.length,
      onlyInPipedriveCount: onlyInPipedrive.length,
      onlyInXeroCount: onlyInXero.length,
      // Include names for reporting
      projectsOnlyInPipedrive: onlyInPipedrive.map(p => ({ name: p.name || p.title, key: getComparisonKey(p.name || p.title) })),
      projectsOnlyInXero: onlyInXero.map(x => ({ name: x.name, key: getComparisonKey(x.name) })),
      // matchedProjectDetails: matchedProjects.map(m => ({ pdName: m.pipedrive.name || m.pipedrive.title, xeroName: m.xero.name, key: getComparisonKey(m.pipedrive.name || m.pipedrive.title) })),
      summary: `Matched: ${matchedProjects.length}, Pipedrive only: ${onlyInPipedrive.length}, Xero only: ${onlyInXero.length}`
    };

    console.log('[Compare API Route] Comparison complete. Result:', comparisonResult.summary);
    // console.log('[Compare API Route] Only in Pipedrive:', JSON.stringify(comparisonResult.projectsOnlyInPipedrive, null, 2));
    // console.log('[Compare API Route] Only in Xero:', JSON.stringify(comparisonResult.projectsOnlyInXero, null, 2));


    // Simulate a delay
    // await new Promise(resolve => setTimeout(resolve, 100)); // Reduced delay

    return NextResponse.json({ comparisonResult });

  } catch (error) {
    console.error('[Compare API Route] Error during project comparison:', error);
    return NextResponse.json({ message: 'Error comparing projects', error: (error as Error).message }, { status: 500 });
  }
}
