import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

interface AgeingRequest {
  projects: any[];
  blobUrl?: string;
  timestamp: string;
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: AgeingRequest = await request.json();
    const { projects, blobUrl, timestamp } = body;

    if (!projects || !Array.isArray(projects)) {
      return NextResponse.json({ error: 'Invalid projects data' }, { status: 400 });
    }

    // Prepare payload for Python backend
    const pythonPayload = {
      projects: projects,
      blob_url: blobUrl,
      timestamp: timestamp,
      user_id: session.user.id,
    };

    // Get Python backend URL from environment
    const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:5001';
    
    // Send to Python backend for processing
    const pythonResponse = await fetch(`${pythonBackendUrl}/api/ageingipc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.PYTHON_BACKEND_API_KEY || '',
      },
      body: JSON.stringify(pythonPayload),
    });

    if (!pythonResponse.ok) {
      const errorData = await pythonResponse.text();
      console.error('Python backend error:', errorData);
      return NextResponse.json(
        { error: 'Failed to process ageing data', details: errorData }, 
        { status: 500 }
      );
    }

    const result = await pythonResponse.json();

    // Process and format the response
    const formattedResult = {
      success: true,
      data: result.ageing_data || [],
      summary: result.summary || {
        totalCurrent: 0,
        total30Days: 0,
        total60Days: 0,
        total90Days: 0,
        totalOver90: 0,
        grandTotal: 0,
      },
      metadata: {
        projectsProcessed: result.projects_processed || 0,
        processingTime: result.processing_time || 0,
        timestamp: new Date().toISOString(),
      },
    };

    return NextResponse.json(formattedResult);
  } catch (error) {
    console.error('Error in ageing IPC route:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}