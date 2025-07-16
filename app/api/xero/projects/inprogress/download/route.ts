import { NextRequest, NextResponse } from 'next/server';
import { ensureValidToken } from '@/lib/ensureXeroToken';
import { trackXeroApiCall } from '@/lib/xeroApiTracker';
import { SmartRateLimit } from '@/lib/smartRateLimit';
import * as XLSX from 'xlsx';

interface XeroProject {
  projectId: string;
  contactId: string;
  name: string;
  currencyCode: string;
  minutesLogged: number;
  totalTaskAmount?: {
    currency: string;
    value: number;
  };
  totalExpenseAmount?: {
    currency: string;
    value: number;
  };
  minutesToBeInvoiced?: number;
  taskAmountToBeInvoiced?: {
    currency: string;
    value: number;
  };
  taskAmountInvoiced?: {
    currency: string;
    value: number;
  };
  expenseAmountToBeInvoiced?: {
    currency: string;
    value: number;
  };
  expenseAmountInvoiced?: {
    currency: string;
    value: number;
  };
  projectAmountInvoiced?: {
    currency: string;
    value: number;
  };
  deposit?: {
    currency: string;
    value: number;
  };
  depositApplied?: {
    currency: string;
    value: number;
  };
  creditNoteAmount?: {
    currency: string;
    value: number;
  };
  totalInvoiced?: {
    currency: string;
    value: number;
  };
  totalToBeInvoiced?: {
    currency: string;
    value: number;
  };
  estimate?: {
    currency: string;
    value: number;
  };
  status: string;
  deadlineUtc?: string;
}

interface PaginationInfo {
  page: number;
  pageSize: number;
  pageCount: number;
  itemCount: number;
}

interface ProjectsResponse {
  pagination: PaginationInfo;
  items: XeroProject[];
}

export async function GET(request: NextRequest) {
  try {
    const tokenData = await ensureValidToken();
    const allProjects: XeroProject[] = [];
    let currentPage = 1;
    let totalPages = 1;

    // Fetch all pages of projects
    do {
      const url = `https://api.xero.com/projects.xro/2.0/Projects?states=INPROGRESS&page=${currentPage}`;
      
      await SmartRateLimit.waitIfNeeded();
      
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'Xero-tenant-id': tokenData.effective_tenant_id,
          Accept: 'application/json',
        },
      });

      await trackXeroApiCall(tokenData.effective_tenant_id);
      SmartRateLimit.updateFromHeaders(res.headers);

      if (!res.ok) {
        const errorData = await res.json();
        return NextResponse.json(
          { error: `Failed to fetch projects: ${res.status}`, details: errorData },
          { status: res.status }
        );
      }

      const data: ProjectsResponse = await res.json();
      
      // Add projects from this page
      if (data.items && data.items.length > 0) {
        allProjects.push(...data.items);
      }
      
      // Update pagination info
      totalPages = data.pagination.pageCount;
      currentPage++;
      
    } while (currentPage <= totalPages);

    // Create Excel workbook
    const wb = XLSX.utils.book_new();
    
    // Transform projects data for Excel
    const excelData = allProjects.map(project => ({
      'Project ID': project.projectId,
      'Project Name': project.name,
      'Status': project.status,
      'Currency': project.currencyCode,
      'Estimate': project.estimate?.value || 0,
      'Total Task Amount': project.totalTaskAmount?.value || 0,
      'Total Expense Amount': project.totalExpenseAmount?.value || 0,
      'Total Invoiced': project.totalInvoiced?.value || 0,
      'Total To Be Invoiced': project.totalToBeInvoiced?.value || 0,
      'Task Amount Invoiced': project.taskAmountInvoiced?.value || 0,
      'Task Amount To Be Invoiced': project.taskAmountToBeInvoiced?.value || 0,
      'Expense Amount Invoiced': project.expenseAmountInvoiced?.value || 0,
      'Expense Amount To Be Invoiced': project.expenseAmountToBeInvoiced?.value || 0,
      'Minutes Logged': project.minutesLogged || 0,
      'Hours Logged': (project.minutesLogged || 0) / 60,
      'Minutes To Be Invoiced': project.minutesToBeInvoiced || 0,
      'Hours To Be Invoiced': (project.minutesToBeInvoiced || 0) / 60,
      'Deposit': project.deposit?.value || 0,
      'Deposit Applied': project.depositApplied?.value || 0,
      'Credit Note Amount': project.creditNoteAmount?.value || 0,
      'Deadline': project.deadlineUtc ? new Date(project.deadlineUtc).toLocaleDateString() : '',
      'Contact ID': project.contactId
    }));

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(excelData);

    // Auto-fit columns
    const colWidths = [
      { wch: 36 }, // Project ID
      { wch: 40 }, // Project Name
      { wch: 12 }, // Status
      { wch: 10 }, // Currency
      { wch: 12 }, // Estimate
      { wch: 15 }, // Total Task Amount
      { wch: 18 }, // Total Expense Amount
      { wch: 15 }, // Total Invoiced
      { wch: 20 }, // Total To Be Invoiced
      { wch: 18 }, // Task Amount Invoiced
      { wch: 22 }, // Task Amount To Be Invoiced
      { wch: 20 }, // Expense Amount Invoiced
      { wch: 25 }, // Expense Amount To Be Invoiced
      { wch: 15 }, // Minutes Logged
      { wch: 12 }, // Hours Logged
      { wch: 20 }, // Minutes To Be Invoiced
      { wch: 18 }, // Hours To Be Invoiced
      { wch: 10 }, // Deposit
      { wch: 15 }, // Deposit Applied
      { wch: 18 }, // Credit Note Amount
      { wch: 12 }, // Deadline
      { wch: 36 }  // Contact ID
    ];
    ws['!cols'] = colWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Projects In Progress');

    // Create summary sheet
    const summaryData = [{
      'Total Projects': allProjects.length,
      'Total Estimate Value': allProjects.reduce((sum, p) => sum + (p.estimate?.value || 0), 0),
      'Total Invoiced': allProjects.reduce((sum, p) => sum + (p.totalInvoiced?.value || 0), 0),
      'Total To Be Invoiced': allProjects.reduce((sum, p) => sum + (p.totalToBeInvoiced?.value || 0), 0),
      'Total Hours Logged': allProjects.reduce((sum, p) => sum + (p.minutesLogged || 0), 0) / 60,
      'Projects with Deadlines': allProjects.filter(p => p.deadlineUtc).length,
      'Export Date': new Date().toLocaleString(),
      'Tenant ID': tokenData.effective_tenant_id
    }];

    const summaryWs = XLSX.utils.json_to_sheet(summaryData);
    summaryWs['!cols'] = [
      { wch: 20 }, // Metric name
      { wch: 20 }  // Value
    ];
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

    // Generate Excel buffer
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

    // Create filename with timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `xero-projects-inprogress-${timestamp}.xlsx`;

    // Return Excel file
    return new NextResponse(excelBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (err: any) {
    if (err.message.includes('No authenticated session') || 
        err.message.includes('Please login') || 
        err.message.includes('re-authenticate')) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json({ error: `Internal Server Error: ${err.message}` }, { status: 500 });
  }
}