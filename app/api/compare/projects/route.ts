import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  console.log('API: Comparing projects (simulated)');
  try {
    const { pipedriveProjects, xeroProjects } = await request.json();
    // Simulate comparison logic
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('API: Received Pipedrive Projects:', pipedriveProjects);
    console.log('API: Received Xero Projects:', xeroProjects);
    const comparisonResult = {
      matched: [{ pipedriveId: 'pipe_1', xeroId: 'xero_A', name: 'Project Alpha' }],
      onlyInPipedrive: [{ id: 'pipe_2', name: 'Pipedrive Project Beta' }],
      onlyInXero: [{ id: 'xero_B', name: 'Xero Project Charlie' }],
    };
    console.log('API: Projects compared successfully (simulated)');
    return NextResponse.json({ message: 'Projects compared successfully (simulated)', comparisonResult });
  } catch (error) {
    console.error('API Error comparing projects:', error);
    return NextResponse.json({ message: 'Error comparing projects', error: (error as Error).message }, { status: 500 });
  }
}
