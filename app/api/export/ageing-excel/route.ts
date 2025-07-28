import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import * as XLSX from 'xlsx';

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

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Create summary sheet
    const summaryData = [
      ['Ageing Summary Report'],
      ['Generated on:', new Date().toLocaleDateString()],
      [],
      ['Period', 'Amount'],
      ['Current', summary.totalCurrent],
      ['1-30 Days', summary.total30Days],
      ['31-60 Days', summary.total60Days],
      ['61-90 Days', summary.total90Days],
      ['Over 90 Days', summary.totalOver90],
      ['', ''],
      ['Grand Total', summary.grandTotal],
    ];

    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    
    // Apply Xero-style formatting to summary sheet
    summaryWs['!cols'] = [{ wch: 20 }, { wch: 15 }];
    
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

    // Create detailed data sheet
    const headers = [
      'Project Code',
      'Project Name',
      'Client',
      'Current',
      '1-30 Days',
      '31-60 Days',
      '61-90 Days',
      'Over 90 Days',
      'Total',
    ];

    const detailData = [
      headers,
      ...data.map(item => [
        item.projectCode,
        item.projectName,
        item.clientName,
        item.current,
        item.days30,
        item.days60,
        item.days90,
        item.over90,
        item.total,
      ]),
      [],
      ['', '', 'TOTALS:', summary.totalCurrent, summary.total30Days, summary.total60Days, summary.total90Days, summary.totalOver90, summary.grandTotal],
    ];

    const detailWs = XLSX.utils.aoa_to_sheet(detailData);
    
    // Apply column widths
    detailWs['!cols'] = [
      { wch: 15 }, // Project Code
      { wch: 30 }, // Project Name
      { wch: 25 }, // Client
      { wch: 12 }, // Current
      { wch: 12 }, // 1-30 Days
      { wch: 12 }, // 31-60 Days
      { wch: 12 }, // 61-90 Days
      { wch: 12 }, // Over 90 Days
      { wch: 15 }, // Total
    ];

    XLSX.utils.book_append_sheet(wb, detailWs, 'Ageing Details');

    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Return response
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="ageing-summary-${new Date().toISOString().split('T')[0]}.xlsx"`,
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