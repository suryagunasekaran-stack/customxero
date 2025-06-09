import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    // Call the check-project-tasks API to get the latest report
    const baseUrl = req.nextUrl.origin;
    const response = await fetch(`${baseUrl}/api/xero/check-project-tasks`);
    
    if (!response.ok) {
      throw new Error('Failed to generate standardization report');
    }
    
    const data = await response.json();
    const reportContent = data.downloadableReport;
    
    if (!reportContent) {
      throw new Error('No report content available');
    }
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = `xero-standardization-report-${timestamp}.txt`;
    
    // Return the report as a downloadable file
    return new NextResponse(reportContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    });
    
  } catch (error) {
    console.error('[Download Report API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate report', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 