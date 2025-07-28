import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

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

    // Calculate ageing categories
    const activeCount = analysis.results.filter(p => p.found_in_excel && p.days_since !== null && p.days_since <= 30).length;
    const days31to60 = analysis.results.filter(p => p.found_in_excel && p.days_since !== null && p.days_since > 30 && p.days_since <= 60).length;
    const days61to90 = analysis.results.filter(p => p.found_in_excel && p.days_since !== null && p.days_since > 60 && p.days_since <= 90).length;
    const over90Days = analysis.results.filter(p => p.found_in_excel && p.days_since !== null && p.days_since > 90).length;

    // Sort projects by days_since (oldest first)
    const sortedProjects = [...analysis.results].sort((a, b) => {
      if (a.days_since === null && b.days_since === null) return 0;
      if (a.days_since === null) return 1;
      if (b.days_since === null) return -1;
      return b.days_since - a.days_since;
    });

    // Generate HTML content with Xero styling
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Project Ageing Analysis Report</title>
  <style>
    @page {
      size: A4;
      margin: 20mm;
    }
    
    body {
      font-family: Arial, Helvetica, sans-serif;
      color: #333;
      margin: 0;
      padding: 0;
      background-color: #fff;
      font-size: 14px;
      line-height: 1.5;
    }
    
    .header {
      background: linear-gradient(135deg, #0077C5 0%, #0095E8 100%);
      color: white;
      padding: 30px;
      margin: -20px -20px 30px -20px;
      text-align: center;
    }
    
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 300;
      letter-spacing: 1px;
    }
    
    .header .subtitle {
      margin-top: 10px;
      font-size: 16px;
      opacity: 0.9;
    }
    
    .metadata {
      background-color: #f8f9fa;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
      border: 1px solid #e0e0e0;
    }
    
    .metadata-item {
      display: flex;
      margin-bottom: 8px;
    }
    
    .metadata-label {
      font-weight: 600;
      color: #666;
      width: 150px;
    }
    
    .metadata-value {
      color: #333;
    }
    
    .section {
      margin-bottom: 40px;
    }
    
    .section-title {
      color: #0077C5;
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 2px solid #0077C5;
    }
    
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin-bottom: 30px;
    }
    
    .summary-card {
      background-color: #f8f9fa;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
      border: 1px solid #e0e0e0;
    }
    
    .summary-card .label {
      color: #666;
      font-size: 14px;
      margin-bottom: 10px;
    }
    
    .summary-card .value {
      color: #0077C5;
      font-size: 32px;
      font-weight: 600;
    }
    
    .ageing-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 15px;
      margin-bottom: 30px;
    }
    
    .ageing-card {
      padding: 15px;
      border-radius: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .ageing-card.active {
      background-color: #e8f5e9;
      border: 1px solid #4caf50;
    }
    
    .ageing-card.warning {
      background-color: #fff3e0;
      border: 1px solid #ff9800;
    }
    
    .ageing-card.danger {
      background-color: #ffebee;
      border: 1px solid #f44336;
    }
    
    .ageing-card.inactive {
      background-color: #f5f5f5;
      border: 1px solid #9e9e9e;
    }
    
    .ageing-label {
      font-weight: 500;
      color: #333;
    }
    
    .ageing-value {
      font-size: 24px;
      font-weight: 600;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
      background-color: white;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    
    th {
      background-color: #0077C5;
      color: white;
      padding: 12px;
      text-align: left;
      font-weight: 500;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    th.text-center {
      text-align: center;
    }
    
    td {
      padding: 12px;
      border-bottom: 1px solid #e0e0e0;
      font-size: 13px;
    }
    
    td.text-center {
      text-align: center;
    }
    
    tr:hover {
      background-color: #f5f5f5;
    }
    
    tr:last-child td {
      border-bottom: none;
    }
    
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
    }
    
    .status-active {
      background-color: #e8f5e9;
      color: #2e7d32;
    }
    
    .status-inactive {
      background-color: #f5f5f5;
      color: #616161;
    }
    
    .days-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }
    
    .days-active {
      background-color: #e8f5e9;
      color: #2e7d32;
    }
    
    .days-warning {
      background-color: #fff3e0;
      color: #f57c00;
    }
    
    .days-danger {
      background-color: #ffebee;
      color: #c62828;
    }
    
    .footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
      text-align: center;
      color: #666;
      font-size: 12px;
    }
    
    .page-break {
      page-break-after: always;
    }
    
    @media print {
      body {
        margin: 0;
        padding: 20px;
      }
      .header {
        margin: -20px -20px 30px -20px;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Project Ageing Analysis Report</h1>
    <div class="subtitle">Comprehensive Project Activity Analysis</div>
  </div>

  <div class="metadata">
    <div class="metadata-item">
      <span class="metadata-label">Report Date:</span>
      <span class="metadata-value">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
    </div>
    <div class="metadata-item">
      <span class="metadata-label">Organization:</span>
      <span class="metadata-value">${tenant?.tenant_name || 'Unknown'}</span>
    </div>
    <div class="metadata-item">
      <span class="metadata-label">Source File:</span>
      <span class="metadata-value">${fileName || 'Not specified'}</span>
    </div>
    <div class="metadata-item">
      <span class="metadata-label">Analysis Date:</span>
      <span class="metadata-value">${timestamp ? new Date(timestamp).toLocaleDateString() : new Date().toLocaleDateString()}</span>
    </div>
  </div>

  <div class="section">
    <h2 class="section-title">Executive Summary</h2>
    <div class="summary-grid">
      <div class="summary-card">
        <div class="label">Total Projects</div>
        <div class="value">${analysis.total_projects}</div>
      </div>
      <div class="summary-card">
        <div class="label">Projects with Activity</div>
        <div class="value" style="color: #4caf50;">${analysis.projects_found_in_excel}</div>
      </div>
      <div class="summary-card">
        <div class="label">Projects without Activity</div>
        <div class="value" style="color: #f44336;">${analysis.projects_not_found}</div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2 class="section-title">Ageing Distribution</h2>
    <div class="ageing-grid">
      <div class="ageing-card active">
        <span class="ageing-label">Active (≤30 days)</span>
        <span class="ageing-value" style="color: #4caf50;">${activeCount}</span>
      </div>
      <div class="ageing-card warning">
        <span class="ageing-label">31-60 days</span>
        <span class="ageing-value" style="color: #ff9800;">${days31to60}</span>
      </div>
      <div class="ageing-card danger">
        <span class="ageing-label">61-90 days</span>
        <span class="ageing-value" style="color: #ff5722;">${days61to90}</span>
      </div>
      <div class="ageing-card danger">
        <span class="ageing-label">Over 90 days</span>
        <span class="ageing-value" style="color: #f44336;">${over90Days}</span>
      </div>
    </div>
  </div>

  <div class="section">
    <h2 class="section-title">Project Details</h2>
    <table>
      <thead>
        <tr>
          <th>Project Name</th>
          <th>Job Code</th>
          <th class="text-center">Status</th>
          <th class="text-center">Last Activity</th>
          <th class="text-center">Days Since</th>
        </tr>
      </thead>
      <tbody>
        ${sortedProjects.slice(0, 30).map(project => `
          <tr>
            <td>${project.project_name}</td>
            <td style="font-weight: 500;">${project.job_code}</td>
            <td class="text-center">
              ${project.found_in_excel ? 
                '<span class="status-badge status-active">Active</span>' : 
                '<span class="status-badge status-inactive">No Activity</span>'}
            </td>
            <td class="text-center">${project.latest_date || '-'}</td>
            <td class="text-center">
              ${project.days_since !== null ? 
                `<span class="days-badge ${
                  project.days_since <= 30 ? 'days-active' :
                  project.days_since <= 60 ? 'days-warning' : 'days-danger'
                }">${project.days_since} days</span>` : '-'}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ${sortedProjects.length > 30 ? `
      <p style="text-align: center; margin-top: 20px; color: #666; font-style: italic;">
        Showing 30 of ${sortedProjects.length} projects. Full details available in Excel export.
      </p>
    ` : ''}
  </div>

  ${over90Days + days61to90 > 0 ? `
    <div class="page-break"></div>
    <div class="section">
      <h2 class="section-title">Projects Requiring Attention (Over 60 Days)</h2>
      <table>
        <thead>
          <tr>
            <th>Project Name</th>
            <th>Job Code</th>
            <th class="text-center">Last Activity</th>
            <th class="text-center">Days Since</th>
          </tr>
        </thead>
        <tbody>
          ${sortedProjects
            .filter(p => p.found_in_excel && p.days_since !== null && p.days_since > 60)
            .map(project => `
              <tr>
                <td>${project.project_name}</td>
                <td style="font-weight: 500;">${project.job_code}</td>
                <td class="text-center">${project.latest_date || '-'}</td>
                <td class="text-center">
                  <span class="days-badge days-danger">${project.days_since} days</span>
                </td>
              </tr>
            `).join('')}
        </tbody>
      </table>
    </div>
  ` : ''}

  <div class="footer">
    <p>This report was generated automatically from project timesheet data.</p>
    <p>© ${new Date().getFullYear()} - Project Ageing Analysis Report</p>
  </div>
</body>
</html>
    `;

    // Return HTML that can be printed to PDF
    return new NextResponse(htmlContent, {
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': `attachment; filename="project-ageing-analysis-${new Date().toISOString().split('T')[0]}.html"`,
      },
    });
  } catch (error) {
    console.error('Error generating PDF:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}