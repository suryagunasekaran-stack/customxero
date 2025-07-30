// ExcelReportService.ts
// Service for generating Excel reports for timesheet processing results

import * as XLSX from 'xlsx';

interface TaskResult {
  projectCode: string;
  projectName: string;
  taskName: string;
  action: 'created' | 'updated' | 'failed' | 'skipped';
  success: boolean;
  error?: string;
  details?: string;
}

interface ProcessingSummary {
  entriesProcessed: number;
  projectsAnalyzed: number;
  projectsMatched: number;
  tasksCreated: number;
  tasksUpdated: number;
  tasksFailed: number;
  actualTasksFailed: number;
  projectsNotFound: number;
  processingTimeMs: number;
}

interface TimesheetMetadata {
  creation_date?: string;
  period_range: string;
  entries_processed: number;
  entries_grouped?: number;
  projects_consolidated?: number;
  projects_processed?: number;
  total_changes?: number;
}

interface CostVerification {
  verification_performed: boolean;
  calculations_match: boolean;
  our_total_all_depts_ny_jobs: number;
  excel_total_all_depts_ny_jobs: number;
  excel_navy_only_ny_jobs: number;
  excel_non_navy_ny_jobs: number;
  difference: number;
  excel_all_jobs_all_depts: number;
  discrepancies: Array<{
    job_code: string;
    our_calculated: number;
    excel_total: number;
    difference: number;
  }>;
}

interface ExcelReportData {
  metadata: TimesheetMetadata;
  summary: ProcessingSummary;
  results: TaskResult[];
  costVerification?: CostVerification;
  changes?: any;
}

export class ExcelReportService {
  generateTimesheetReport(data: ExcelReportData): Buffer {
    const workbook = XLSX.utils.book_new();
    
    // Add Overview sheet
    this.addOverviewSheet(workbook, data);
    
    // Add Successful Operations sheet
    this.addSuccessfulOperationsSheet(workbook, data);
    
    // Add Failed Operations sheet
    this.addFailedOperationsSheet(workbook, data);
    
    // Add Projects Not Found sheet
    this.addProjectsNotFoundSheet(workbook, data);
    
    // Add Cost Verification sheet if available
    if (data.costVerification) {
      this.addCostVerificationSheet(workbook, data.costVerification);
    }
    
    // Add Raw Data sheet for reference
    this.addRawDataSheet(workbook, data);
    
    // Write to buffer
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    return Buffer.from(buffer);
  }

  private addOverviewSheet(workbook: XLSX.WorkBook, data: ExcelReportData) {
    const overviewData = [
      ['Timesheet Processing Report'],
      [],
      ['Report Generated:', new Date().toISOString()],
      ['Period:', data.metadata.period_range],
      [],
      ['Summary Statistics'],
      ['Metric', 'Value'],
      ['Entries Processed', data.metadata.entries_processed],
      ['Projects Analyzed', data.summary.projectsAnalyzed],
      ['Projects Matched', data.summary.projectsMatched],
      ['Tasks Created', data.summary.tasksCreated],
      ['Tasks Updated', data.summary.tasksUpdated],
      ['Actual Failures', data.summary.actualTasksFailed],
      ['Projects Not Found', data.summary.projectsNotFound],
      ['Processing Time (ms)', data.summary.processingTimeMs],
      [],
      ['Success Rate', this.calculateSuccessRate(data.summary)],
    ];

    const ws = XLSX.utils.aoa_to_sheet(overviewData);
    
    // Apply formatting
    ws['A1'].s = { font: { bold: true, sz: 16 } };
    ws['A6'].s = { font: { bold: true, sz: 14 } };
    
    // Set column widths
    ws['!cols'] = [{ wch: 25 }, { wch: 20 }];
    
    XLSX.utils.book_append_sheet(workbook, ws, 'Overview');
  }

  private addSuccessfulOperationsSheet(workbook: XLSX.WorkBook, data: ExcelReportData) {
    const successfulResults = data.results.filter(r => r.success);
    
    const headers = ['Project Code', 'Project Name', 'Task Name', 'Action', 'Details'];
    const rows = successfulResults.map(r => [
      r.projectCode,
      r.projectName,
      r.taskName,
      r.action,
      r.details || 'N/A'
    ]);

    const wsData = [
      ['Successful Operations'],
      [],
      [`Total Successful: ${successfulResults.length}`],
      [],
      headers,
      ...rows
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Apply formatting
    ws['A1'].s = { font: { bold: true, sz: 14 } };
    ws['A5'].s = { font: { bold: true } };
    ws['B5'].s = { font: { bold: true } };
    ws['C5'].s = { font: { bold: true } };
    ws['D5'].s = { font: { bold: true } };
    ws['E5'].s = { font: { bold: true } };
    
    // Set column widths
    ws['!cols'] = [
      { wch: 15 },  // Project Code
      { wch: 40 },  // Project Name
      { wch: 30 },  // Task Name
      { wch: 12 },  // Action
      { wch: 50 }   // Details
    ];
    
    XLSX.utils.book_append_sheet(workbook, ws, 'Successful Operations');
  }

  private addFailedOperationsSheet(workbook: XLSX.WorkBook, data: ExcelReportData) {
    const actualFailures = data.results.filter(r => 
      !r.success && !r.error?.includes('not found in active Xero projects')
    );
    
    const headers = ['Project Code', 'Project Name', 'Task Name', 'Error', 'Details'];
    const rows = actualFailures.map(r => [
      r.projectCode,
      r.projectName,
      r.taskName,
      r.error || 'Unknown error',
      r.details || 'N/A'
    ]);

    const wsData = [
      ['Failed Operations Requiring Attention'],
      [],
      [`Total Failures: ${actualFailures.length}`],
      [],
      headers,
      ...rows
    ];

    if (actualFailures.length === 0) {
      wsData.push(['No failures - all operations completed successfully!']);
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Apply formatting
    ws['A1'].s = { font: { bold: true, sz: 14, color: { rgb: 'FF0000' } } };
    if (actualFailures.length > 0) {
      ws['A5'].s = { font: { bold: true } };
      ws['B5'].s = { font: { bold: true } };
      ws['C5'].s = { font: { bold: true } };
      ws['D5'].s = { font: { bold: true } };
      ws['E5'].s = { font: { bold: true } };
    }
    
    // Set column widths
    ws['!cols'] = [
      { wch: 15 },  // Project Code
      { wch: 40 },  // Project Name
      { wch: 30 },  // Task Name
      { wch: 50 },  // Error
      { wch: 50 }   // Details
    ];
    
    XLSX.utils.book_append_sheet(workbook, ws, 'Failed Operations');
  }

  private addProjectsNotFoundSheet(workbook: XLSX.WorkBook, data: ExcelReportData) {
    const notFoundResults = data.results.filter(r => 
      !r.success && r.error?.includes('not found in active Xero projects')
    );
    
    // Group by project code
    const projectGroups = new Map<string, TaskResult[]>();
    notFoundResults.forEach(result => {
      if (!projectGroups.has(result.projectCode)) {
        projectGroups.set(result.projectCode, []);
      }
      projectGroups.get(result.projectCode)!.push(result);
    });

    const headers = ['Project Code', 'Number of Tasks', 'Status', 'Notes'];
    const rows = Array.from(projectGroups.entries()).map(([projectCode, tasks]) => [
      projectCode,
      tasks.length,
      'Not Found',
      'Project likely moved to CLOSED/COMPLETED status - no action required'
    ]);

    const wsData = [
      ['Projects Not Found (Likely Closed)'],
      [],
      [`Total Projects: ${projectGroups.size}`],
      [`Total Tasks: ${notFoundResults.length}`],
      [],
      headers,
      ...rows
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Apply formatting
    ws['A1'].s = { font: { bold: true, sz: 14 } };
    ws['A6'].s = { font: { bold: true } };
    ws['B6'].s = { font: { bold: true } };
    ws['C6'].s = { font: { bold: true } };
    ws['D6'].s = { font: { bold: true } };
    
    // Set column widths
    ws['!cols'] = [
      { wch: 15 },  // Project Code
      { wch: 15 },  // Number of Tasks
      { wch: 12 },  // Status
      { wch: 60 }   // Notes
    ];
    
    XLSX.utils.book_append_sheet(workbook, ws, 'Projects Not Found');
  }

  private addCostVerificationSheet(workbook: XLSX.WorkBook, costVerification: CostVerification) {
    const verificationData = [
      ['Cost Verification Results'],
      [],
      ['Verification Performed:', costVerification.verification_performed ? 'Yes' : 'No'],
      ['Calculations Match:', costVerification.calculations_match ? 'Yes' : 'No'],
      [],
      ['Summary'],
      ['Description', 'Amount ($)'],
      ['Our Total (All Depts NY Jobs)', this.formatCurrency(costVerification.our_total_all_depts_ny_jobs)],
      ['Excel Total (All Depts NY Jobs)', this.formatCurrency(costVerification.excel_total_all_depts_ny_jobs)],
      ['Excel Navy Only (NY Jobs)', this.formatCurrency(costVerification.excel_navy_only_ny_jobs)],
      ['Excel Non-Navy (NY Jobs)', this.formatCurrency(costVerification.excel_non_navy_ny_jobs)],
      ['Difference', this.formatCurrency(costVerification.difference)],
      ['Excel All Jobs All Depts', this.formatCurrency(costVerification.excel_all_jobs_all_depts)],
      [],
      ['Discrepancies'],
      ['Job Code', 'Our Calculated ($)', 'Excel Total ($)', 'Difference ($)']
    ];

    // Add discrepancy rows
    costVerification.discrepancies.forEach(d => {
      verificationData.push([
        d.job_code,
        this.formatCurrency(d.our_calculated),
        this.formatCurrency(d.excel_total),
        this.formatCurrency(d.difference)
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(verificationData);
    
    // Apply formatting
    ws['A1'].s = { font: { bold: true, sz: 14 } };
    ws['A6'].s = { font: { bold: true, sz: 12 } };
    ws['A15'].s = { font: { bold: true, sz: 12 } };
    
    // Set column widths
    ws['!cols'] = [
      { wch: 30 },  // Description/Job Code
      { wch: 20 },  // Amount/Our Calculated
      { wch: 20 },  // Excel Total
      { wch: 20 }   // Difference
    ];
    
    XLSX.utils.book_append_sheet(workbook, ws, 'Cost Verification');
  }

  private addRawDataSheet(workbook: XLSX.WorkBook, data: ExcelReportData) {
    const rawData = [
      ['Raw Processing Data'],
      [],
      ['This sheet contains the complete processing data in JSON format for reference'],
      [],
      [JSON.stringify(data, null, 2)]
    ];

    const ws = XLSX.utils.aoa_to_sheet(rawData);
    
    // Apply formatting
    ws['A1'].s = { font: { bold: true, sz: 14 } };
    
    // Set column width
    ws['!cols'] = [{ wch: 100 }];
    
    XLSX.utils.book_append_sheet(workbook, ws, 'Raw Data');
  }

  private calculateSuccessRate(summary: ProcessingSummary): string {
    const totalOperations = summary.tasksCreated + summary.tasksUpdated + summary.actualTasksFailed;
    if (totalOperations === 0) return '0%';
    
    const successfulOperations = summary.tasksCreated + summary.tasksUpdated;
    const successRate = (successfulOperations / totalOperations) * 100;
    
    return `${successRate.toFixed(1)}%`;
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value / 100); // Convert cents to dollars
  }

  generateReportFilename(baseName: string = 'timesheet-processing-report'): string {
    const timestamp = new Date().toISOString().replace(/[:.-]/g, '').split('T')[0];
    return `${baseName}-${timestamp}.xlsx`;
  }

  generateXeroUpdateReport(data: {
    updateSummary: any;
    originalChanges: {
      updates: any[];
      creates: any[];
    };
    closedProjectsSkipped: any[];
  }): Buffer {
    const workbook = XLSX.utils.book_new();
    
    // Add Summary sheet
    this.addUpdateSummarySheet(workbook, data.updateSummary);
    
    // Add Successful Updates sheet
    this.addSuccessfulUpdatesSheet(workbook, data.updateSummary);
    
    // Add Failed Updates sheet
    this.addFailedUpdatesSheet(workbook, data.updateSummary, data.originalChanges);
    
    // Add Closed Projects sheet
    if (data.closedProjectsSkipped && data.closedProjectsSkipped.length > 0) {
      this.addClosedProjectsSheet(workbook, data.closedProjectsSkipped);
    }
    
    // Add Original Changes sheet
    this.addOriginalChangesSheet(workbook, data.originalChanges);
    
    // Write to buffer
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    return Buffer.from(buffer);
  }

  private addUpdateSummarySheet(workbook: XLSX.WorkBook, summary: any) {
    const summaryData = [
      ['Xero Update Report'],
      [],
      ['Report Generated:', new Date().toISOString()],
      ['Status:', summary.success ? 'All Updates Successful' : 'Updates Completed with Errors'],
      [],
      ['Summary'],
      ['Metric', 'Value'],
      ['Total Attempted', summary.totalAttempted],
      ['Successful', summary.successCount],
      ['Failed', summary.failureCount],
      ['Duration (seconds)', Math.floor(summary.duration / 1000)],
      [],
      ['Success Rate', `${((summary.successCount / summary.totalAttempted) * 100).toFixed(1)}%`]
    ];

    const ws = XLSX.utils.aoa_to_sheet(summaryData);
    
    // Apply formatting
    ws['A1'].s = { font: { bold: true, sz: 16 } };
    ws['A6'].s = { font: { bold: true, sz: 14 } };
    
    // Set column widths
    ws['!cols'] = [{ wch: 25 }, { wch: 20 }];
    
    XLSX.utils.book_append_sheet(workbook, ws, 'Summary');
  }

  private addSuccessfulUpdatesSheet(workbook: XLSX.WorkBook, summary: any) {
    const successfulResults = summary.results.filter((r: any) => r.success);
    const updates = successfulResults.filter((r: any) => r.action === 'updated');
    const creates = successfulResults.filter((r: any) => r.action === 'created');
    
    const headers = ['Project Code', 'Project Name', 'Task Name', 'Action'];
    const rows = [];
    
    // Add updates
    if (updates.length > 0) {
      rows.push(['UPDATED TASKS'], [], headers);
      updates.forEach((r: any) => {
        rows.push([
          r.projectDetails?.projectCode || 'N/A',
          r.projectDetails?.projectName || 'N/A',
          r.taskName,
          'Updated'
        ]);
      });
      rows.push([]);
    }
    
    // Add creates
    if (creates.length > 0) {
      rows.push(['CREATED TASKS'], [], headers);
      creates.forEach((r: any) => {
        rows.push([
          r.projectDetails?.projectCode || 'N/A',
          r.projectDetails?.projectName || 'N/A',
          r.taskName,
          'Created'
        ]);
      });
    }

    const wsData = [
      ['Successful Updates'],
      [],
      [`Total Successful: ${successfulResults.length}`],
      [],
      ...rows
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Apply formatting
    ws['A1'].s = { font: { bold: true, sz: 14 } };
    
    // Set column widths
    ws['!cols'] = [
      { wch: 15 },  // Project Code
      { wch: 40 },  // Project Name
      { wch: 30 },  // Task Name
      { wch: 12 }   // Action
    ];
    
    XLSX.utils.book_append_sheet(workbook, ws, 'Successful Updates');
  }

  private addFailedUpdatesSheet(workbook: XLSX.WorkBook, summary: any, originalChanges?: any) {
    const failedResults = summary.results.filter((r: any) => !r.success);
    
    const headers = ['Project Code', 'Project Name', 'Task Name', 'Action', 'Attempted Changes', 'Error'];
    const rows = failedResults.map((r: any) => {
      let attemptedChanges = 'N/A';
      
      // Find the original change details
      if (originalChanges) {
        if (r.action === 'updated' && originalChanges.updates) {
          const update = originalChanges.updates.find((u: any) => 
            u.taskId === r.taskId || (u.payload && u.payload.name === r.taskName)
          );
          if (update) {
            attemptedChanges = `Rate: $${update.payload.rate.value}, Time: ${update.payload.estimateMinutes}min, Type: ${update.payload.chargeType}`;
          }
        } else if (r.action === 'created' && originalChanges.creates) {
          const create = originalChanges.creates.find((c: any) => 
            c.payload && c.payload.name === r.taskName
          );
          if (create) {
            attemptedChanges = `Rate: $${create.payload.rate.value}, Time: ${create.payload.estimateMinutes}min, Type: ${create.payload.chargeType}`;
          }
        }
      }
      
      return [
        r.projectDetails?.projectCode || 'N/A',
        r.projectDetails?.projectName || 'N/A',
        r.taskName,
        r.action,
        attemptedChanges,
        r.error || 'Unknown error'
      ];
    });

    const wsData = [
      ['Failed Updates'],
      [],
      [`Total Failed: ${failedResults.length}`],
      [],
      headers,
      ...rows
    ];

    if (failedResults.length === 0) {
      wsData.push(['No failures - all updates completed successfully!']);
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Apply formatting
    ws['A1'].s = { font: { bold: true, sz: 14, color: { rgb: 'FF0000' } } };
    if (failedResults.length > 0) {
      ws['A5'].s = { font: { bold: true } };
      ws['B5'].s = { font: { bold: true } };
      ws['C5'].s = { font: { bold: true } };
      ws['D5'].s = { font: { bold: true } };
      ws['E5'].s = { font: { bold: true } };
      ws['F5'].s = { font: { bold: true } };
    }
    
    // Set column widths
    ws['!cols'] = [
      { wch: 15 },  // Project Code
      { wch: 40 },  // Project Name
      { wch: 30 },  // Task Name
      { wch: 12 },  // Action
      { wch: 40 },  // Attempted Changes
      { wch: 50 }   // Error
    ];
    
    XLSX.utils.book_append_sheet(workbook, ws, 'Failed Updates');
  }

  private addClosedProjectsSheet(workbook: XLSX.WorkBook, closedProjects: any[]) {
    const headers = ['Project Code', 'Project Name', 'Tasks Skipped', 'Reason'];
    const rows = closedProjects.map(p => [
      p.projectCode || 'N/A',
      p.projectName || 'N/A',
      p.taskCount || 0,
      'Project is in CLOSED status'
    ]);

    const wsData = [
      ['Closed Projects Skipped'],
      [],
      [`Total Projects: ${closedProjects.length}`],
      [],
      headers,
      ...rows
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Apply formatting
    ws['A1'].s = { font: { bold: true, sz: 14 } };
    ws['A5'].s = { font: { bold: true } };
    ws['B5'].s = { font: { bold: true } };
    ws['C5'].s = { font: { bold: true } };
    ws['D5'].s = { font: { bold: true } };
    
    // Set column widths
    ws['!cols'] = [
      { wch: 15 },  // Project Code
      { wch: 40 },  // Project Name
      { wch: 15 },  // Tasks Skipped
      { wch: 30 }   // Reason
    ];
    
    XLSX.utils.book_append_sheet(workbook, ws, 'Closed Projects');
  }

  private addOriginalChangesSheet(workbook: XLSX.WorkBook, changes: any) {
    const updates = changes.updates || [];
    const creates = changes.creates || [];
    
    const data = [
      ['Original Changes Data'],
      [],
      ['This sheet contains the detailed change requests'],
      [],
      ['UPDATES'],
      ['Project ID', 'Task ID', 'Task Name', 'Rate', 'Charge Type', 'Estimate (min)']
    ];
    
    updates.forEach((u: any) => {
      data.push([
        u.projectId,
        u.taskId,
        u.payload.name,
        `$${u.payload.rate.value}`,
        u.payload.chargeType,
        u.payload.estimateMinutes
      ]);
    });
    
    data.push([]);
    data.push(['CREATES']);
    data.push(['Project ID', 'Task Name', 'Rate', 'Charge Type', 'Estimate (min)']);
    
    creates.forEach((c: any) => {
      data.push([
        c.projectId,
        c.payload.name,
        `$${c.payload.rate.value}`,
        c.payload.chargeType,
        c.payload.estimateMinutes
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(data);
    
    // Apply formatting
    ws['A1'].s = { font: { bold: true, sz: 14 } };
    ws['A5'].s = { font: { bold: true, sz: 12 } };
    
    // Set column widths
    ws['!cols'] = [
      { wch: 40 },  // Project ID
      { wch: 40 },  // Task ID / Task Name
      { wch: 30 },  // Task Name / Rate
      { wch: 15 },  // Rate / Charge Type
      { wch: 15 },  // Charge Type / Estimate
      { wch: 15 }   // Estimate
    ];
    
    XLSX.utils.book_append_sheet(workbook, ws, 'Original Changes');
  }
}