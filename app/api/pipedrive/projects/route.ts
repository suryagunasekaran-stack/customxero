import { NextResponse } from 'next/server';

export async function GET() {
  console.log('API: Fetching projects from Pipedrive (simulated)');
  // In a real scenario, you would fetch data from Pipedrive here
  try {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    const projects = [{ id: 'pipe_1', name: 'Pipedrive Project Alpha' }, { id: 'pipe_2', name: 'Pipedrive Project Beta' }];
    console.log('API: Pipedrive projects fetched successfully (simulated)');
    return NextResponse.json({ message: 'Pipedrive projects fetched successfully (simulated)', projects });
  } catch (error) {
    console.error('API Error fetching Pipedrive projects:', error);
    return NextResponse.json({ message: 'Error fetching Pipedrive projects', error: (error as Error).message }, { status: 500 });
  }
}
