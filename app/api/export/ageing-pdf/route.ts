import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

interface AgeingData {
  projectCode: string;
  projectName: string;
  clientName: string;
  current: number;
  days30: number;
  days60: number;
  days90: number;
  over90: number;
  total: number;
}

interface AgeingSummary {
  totalCurrent: number;
  total30Days: number;
  total60Days: number;
  total90Days: number;
  totalOver90: number;
  grandTotal: number;
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, summary }: { data: AgeingData[]; summary: AgeingSummary } = await request.json();

    if (!data || !Array.isArray(data)) {
      return NextResponse.json({ error: 'Invalid data format' }, { status: 400 });
    }

    // Generate HTML content with Xero styling
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Ageing Summary Report</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      color: #333;
      margin: 0;
      padding: 20px;
      background-color: #fff;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 2px solid #0077C5;
      padding-bottom: 20px;
    }
    .header h1 {
      color: #0077C5;
      margin: 0;
      font-size: 28px;
    }
    .header p {
      color: #666;
      margin: 5px 0 0 0;
    }
    .summary-section {
      margin-bottom: 40px;
      background-color: #f8f9fa;
      padding: 20px;
      border-radius: 8px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin-bottom: 20px;
    }
    .summary-item {
      text-align: center;
    }
    .summary-item .label {
      color: #666;
      font-size: 14px;
      margin-bottom: 5px;
    }
    .summary-item .value {
      color: #0077C5;
      font-size: 20px;
      font-weight: bold;
    }
    .grand-total {
      text-align: center;
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
    }
    .grand-total .label {
      color: #333;
      font-size: 16px;
      margin-bottom: 5px;
    }
    .grand-total .value {
      color: #0077C5;
      font-size: 24px;
      font-weight: bold;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th {
      background-color: #0077C5;
      color: white;
      padding: 12px;
      text-align: left;
      font-weight: normal;
    }
    th.number {
      text-align: right;
    }
    td {
      padding: 10px 12px;
      border-bottom: 1px solid #e0e0e0;
    }
    td.number {
      text-align: right;
    }
    tr:hover {
      background-color: #f5f5f5;
    }
    .project-info {
      font-weight: 500;
    }
    .project-name {
      font-size: 12px;
      color: #666;
    }
    .footer {
      margin-top: 40px;
      text-align: center;
      color: #666;
      font-size: 12px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
    }
    @media print {
      body {
        margin: 0;
        padding: 10px;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Ageing Summary Report</h1>
    <p>Generated on ${new Date().toLocaleDateString()}</p>
  </div>

  <div class="summary-section">
    <div class="summary-grid">
      <div class="summary-item">
        <div class="label">Current</div>
        <div class="value">$${summary.totalCurrent.toFixed(2)}</div>
      </div>
      <div class="summary-item">
        <div class="label">1-30 Days</div>
        <div class="value">$${summary.total30Days.toFixed(2)}</div>
      </div>
      <div class="summary-item">
        <div class="label">31-60 Days</div>
        <div class="value">$${summary.total60Days.toFixed(2)}</div>
      </div>
      <div class="summary-item">
        <div class="label">61-90 Days</div>
        <div class="value">$${summary.total90Days.toFixed(2)}</div>
      </div>
      <div class="summary-item">
        <div class="label">Over 90 Days</div>
        <div class="value">$${summary.totalOver90.toFixed(2)}</div>
      </div>
    </div>
    <div class="grand-total">
      <div class="label">Grand Total</div>
      <div class="value">$${summary.grandTotal.toFixed(2)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Project</th>
        <th class="number">Current</th>
        <th class="number">1-30 Days</th>
        <th class="number">31-60 Days</th>
        <th class="number">61-90 Days</th>
        <th class="number">Over 90 Days</th>
        <th class="number">Total</th>
      </tr>
    </thead>
    <tbody>
      ${data.map(item => `
        <tr>
          <td>
            <div class="project-info">${item.projectCode}</div>
            <div class="project-name">${item.projectName}</div>
          </td>
          <td class="number">$${item.current.toFixed(2)}</td>
          <td class="number">$${item.days30.toFixed(2)}</td>
          <td class="number">$${item.days60.toFixed(2)}</td>
          <td class="number">$${item.days90.toFixed(2)}</td>
          <td class="number">$${item.over90.toFixed(2)}</td>
          <td class="number"><strong>$${item.total.toFixed(2)}</strong></td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="footer">
    <p>This report was generated automatically from Xero project data.</p>
  </div>
</body>
</html>
    `;

    // For now, we'll return HTML that can be printed to PDF
    // In production, you might want to use a proper PDF generation library like puppeteer or jsPDF
    return new NextResponse(htmlContent, {
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': `attachment; filename="ageing-summary-${new Date().toISOString().split('T')[0]}.html"`,
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