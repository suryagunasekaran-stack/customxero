import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { ensureValidToken } from '@/lib/ensureXeroToken';

interface ProcessProjectsRequest {
  blobUrl: string;
  fileName: string;
  projects: any[];
  projectCount: number;
  timestamp: string;
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get Xero token info for tenant details
    const { effective_tenant_id, available_tenants } = await ensureValidToken();
    const selectedTenant = available_tenants?.find(t => t.tenantId === effective_tenant_id);

    const body: ProcessProjectsRequest = await request.json();
    const { blobUrl, fileName, projects, projectCount, timestamp } = body;

    if (!blobUrl || !fileName) {
      return NextResponse.json({ error: 'Missing blob URL or file name' }, { status: 400 });
    }

    if (!projects || !Array.isArray(projects) || projects.length === 0) {
      return NextResponse.json({ error: 'Invalid or empty projects data' }, { status: 400 });
    }

    console.log(`Processing ${projectCount} projects with file: ${fileName}`);

    // Prepare payload for Python backend
    const pythonPayload = {
      blob_url: blobUrl,
      file_name: fileName,
      projects: projects,
      project_count: projectCount,
      tenant_id: effective_tenant_id,
      tenant_name: selectedTenant?.tenantName || 'Unknown',
      user_id: session.user.id,
      user_email: session.user.email,
      timestamp: timestamp,
    };

    // Get Python backend URL from environment
    const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:5001';
    
    // Send to Python backend for processing
    const pythonResponse = await fetch(`${pythonBackendUrl}/api/process-projects`, {
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
        { error: 'Failed to process projects', details: errorData }, 
        { status: 500 }
      );
    }

    const result = await pythonResponse.json();

    // Log the response structure for debugging
    console.log('Python backend response structure:', {
      hasSuccess: 'success' in result,
      hasProjectAnalysis: 'project_analysis' in result,
      projectAnalysisKeys: result.project_analysis ? Object.keys(result.project_analysis) : null,
      resultsSampleLength: result.project_analysis?.results?.length || 0,
    });

    // Process and format the response
    // Check if the Python backend returned the expected structure
    const formattedResult = {
      success: result.success || true,
      message: result.message || 'Processing complete',
      file_name: result.file_name || fileName,
      tenant_info: result.tenant_info || {
        tenant_id: effective_tenant_id,
        tenant_name: selectedTenant?.tenantName || 'Unknown',
      },
      user_info: result.user_info || {
        user_id: session.user.id,
        user_email: session.user.email,
      },
      excel_data: result.excel_data || null,
      project_analysis: result.project_analysis || null,
      timestamp: result.timestamp || new Date().toISOString(),
    };

    console.log(`Successfully processed ${projectCount} projects`);
    console.log(`Analysis summary: ${formattedResult.project_analysis?.total_projects || 0} total, ${formattedResult.project_analysis?.projects_found_in_excel || 0} with activity`);

    return NextResponse.json(formattedResult);
  } catch (error) {
    console.error('Error in process-projects route:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}