import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import * as XLSX from 'xlsx';

interface ProjectAnalysisResult {
  project_id: string;
  project_name: string;
  job_code: string;
  found_in_excel: boolean;
  rows_found: number;
  latest_date: string | null;
  date_column: string | null;
  days_since: number | null;
}

interface ExportRequest {
  analysis: {
    total_projects: number;
    projects_found_in_excel: number;
    projects_not_found: number;
    results: ProjectAnalysisResult[];
  };
  fileName?: string;
  tenant?: {
    tenant_id: string;
    tenant_name: string;
  };
  timestamp?: string;
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: ExportRequest = await request.json();
    const { analysis, fileName, tenant, timestamp } = body;

    if (!analysis || !analysis.results) {
      return NextResponse.json({ error: 'Invalid analysis data' }, { status: 400 });
    }

    // Create workbook with Xero-style formatting
    const wb = XLSX.utils.book_new();

    // 1. Summary Sheet
    const summaryData = [
      ['PROJECT AGEING ANALYSIS REPORT'],
      [`Generated on: ${new Date().toLocaleDateString()}`],
      [`Tenant: ${tenant?.tenant_name || 'Unknown'}`],
      [`Source File: ${fileName || 'Not specified'}`],
      [],
      ['SUMMARY'],
      ['', ''],
      ['Total Projects', analysis.total_projects],
      ['Projects with Activity', analysis.projects_found_in_excel],
      ['Projects without Activity', analysis.projects_not_found],
      [],
      ['AGEING CATEGORIES'],
      ['', ''],
      ['Active (≤30 days)', analysis.results.filter(p => p.found_in_excel && p.days_since !== null && p.days_since <= 30).length],
      ['31-60 days', analysis.results.filter(p => p.found_in_excel && p.days_since !== null && p.days_since > 30 && p.days_since <= 60).length],
      ['61-90 days', analysis.results.filter(p => p.found_in_excel && p.days_since !== null && p.days_since > 60 && p.days_since <= 90).length],
      ['Over 90 days', analysis.results.filter(p => p.found_in_excel && p.days_since !== null && p.days_since > 90).length],
      ['No Activity', analysis.projects_not_found],
    ];

    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    
    // Apply Xero-style formatting to summary
    summaryWs['!cols'] = [{ wch: 30 }, { wch: 20 }];
    
    // Style the header
    if (summaryWs['A1']) summaryWs['A1'].s = { font: { bold: true, sz: 16 } };
    if (summaryWs['A6']) summaryWs['A6'].s = { font: { bold: true, sz: 14 } };
    if (summaryWs['A12']) summaryWs['A12'].s = { font: { bold: true, sz: 14 } };
    
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

    // 2. Detailed Analysis Sheet
    const headers = [
      'Project Name',
      'Job Code',
      'Status',
      'Last Activity Date',
      'Days Since Activity',
      'Ageing Category',
      'Rows in Timesheet',
    ];

    // Sort projects by days_since (oldest first, then no activity)
    const sortedProjects = [...analysis.results].sort((a, b) => {
      if (a.days_since === null && b.days_since === null) return 0;
      if (a.days_since === null) return 1;
      if (b.days_since === null) return -1;
      return b.days_since - a.days_since;
    });

    const detailData = [
      headers,
      ...sortedProjects.map(project => [
        project.project_name,
        project.job_code,
        project.found_in_excel ? 'Active' : 'No Activity',
        project.latest_date || '-',
        project.days_since !== null ? project.days_since : '-',
        project.days_since !== null ? 
          (project.days_since <= 30 ? 'Active' :
           project.days_since <= 60 ? '31-60 days' :
           project.days_since <= 90 ? '61-90 days' : 'Over 90 days') : 'No Activity',
        project.rows_found || 0,
      ]),
    ];

    const detailWs = XLSX.utils.aoa_to_sheet(detailData);
    
    // Apply column widths
    detailWs['!cols'] = [
      { wch: 40 }, // Project Name
      { wch: 15 }, // Job Code
      { wch: 12 }, // Status
      { wch: 15 }, // Last Activity
      { wch: 15 }, // Days Since
      { wch: 15 }, // Category
      { wch: 15 }, // Rows
    ];

    XLSX.utils.book_append_sheet(wb, detailWs, 'Project Details');

    // 3. Ageing Distribution Sheet
    const ageingData = [
      ['AGEING DISTRIBUTION'],
      [],
      ['Category', 'Count', 'Percentage'],
      ['Active (≤30 days)', 
       analysis.results.filter(p => p.found_in_excel && p.days_since !== null && p.days_since <= 30).length,
       `${((analysis.results.filter(p => p.found_in_excel && p.days_since !== null && p.days_since <= 30).length / analysis.total_projects) * 100).toFixed(1)}%`],
      ['31-60 days', 
       analysis.results.filter(p => p.found_in_excel && p.days_since !== null && p.days_since > 30 && p.days_since <= 60).length,
       `${((analysis.results.filter(p => p.found_in_excel && p.days_since !== null && p.days_since > 30 && p.days_since <= 60).length / analysis.total_projects) * 100).toFixed(1)}%`],
      ['61-90 days', 
       analysis.results.filter(p => p.found_in_excel && p.days_since !== null && p.days_since > 60 && p.days_since <= 90).length,
       `${((analysis.results.filter(p => p.found_in_excel && p.days_since !== null && p.days_since > 60 && p.days_since <= 90).length / analysis.total_projects) * 100).toFixed(1)}%`],
      ['Over 90 days', 
       analysis.results.filter(p => p.found_in_excel && p.days_since !== null && p.days_since > 90).length,
       `${((analysis.results.filter(p => p.found_in_excel && p.days_since !== null && p.days_since > 90).length / analysis.total_projects) * 100).toFixed(1)}%`],
      ['No Activity', 
       analysis.projects_not_found,
       `${((analysis.projects_not_found / analysis.total_projects) * 100).toFixed(1)}%`],
      [],
      ['Total', analysis.total_projects, '100.0%'],
    ];

    const ageingWs = XLSX.utils.aoa_to_sheet(ageingData);
    ageingWs['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 15 }];
    
    XLSX.utils.book_append_sheet(wb, ageingWs, 'Ageing Distribution');

    // 4. Projects Requiring Attention (Over 60 days)
    const attentionProjects = sortedProjects.filter(p => 
      p.found_in_excel && p.days_since !== null && p.days_since > 60
    );

    if (attentionProjects.length > 0) {
      const attentionData = [
        ['PROJECTS REQUIRING ATTENTION (Over 60 Days)'],
        [],
        ['Project Name', 'Job Code', 'Last Activity', 'Days Since', 'Category'],
        ...attentionProjects.map(project => [
          project.project_name,
          project.job_code,
          project.latest_date || '-',
          project.days_since,
          project.days_since! > 90 ? 'Over 90 days' : '61-90 days',
        ]),
      ];

      const attentionWs = XLSX.utils.aoa_to_sheet(attentionData);
      attentionWs['!cols'] = [
        { wch: 40 }, // Project Name
        { wch: 15 }, // Job Code
        { wch: 15 }, // Last Activity
        { wch: 15 }, // Days Since
        { wch: 15 }, // Category
      ];
      
      XLSX.utils.book_append_sheet(wb, attentionWs, 'Attention Required');
    }

    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Return response
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="project-ageing-analysis-${new Date().toISOString().split('T')[0]}.xlsx"`,
      },
    });
  } catch (error) {
    console.error('Error generating Excel:', error);
    return NextResponse.json(
      { error: 'Failed to generate Excel', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}