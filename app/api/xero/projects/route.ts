import { NextResponse } from 'next/server';

export async function GET() {
  console.log('API: Fetching projects from Xero (simulated)');
  // In a real scenario, you would fetch data from Xero here
  try {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    const projects = [{ id: 'xero_A', name: 'Xero Project Alpha' }, { id: 'xero_B', name: 'Xero Project Charlie' }];
    console.log('API: Xero projects fetched successfully (simulated)');
    return NextResponse.json({ message: 'Xero projects fetched successfully (simulated)', projects });
  } catch (error) {
    console.error('API Error fetching Xero projects:', error);
    return NextResponse.json({ message: 'Error fetching Xero projects', error: (error as Error).message }, { status: 500 });
  }
}
