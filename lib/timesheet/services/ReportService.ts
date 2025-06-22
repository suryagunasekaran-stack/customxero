// ReportService.ts
// Service for handling report generation and downloads

export class ReportService {
  downloadReport(report: { filename: string; content: string }): void {
    try {
      const blob = new Blob([report.content], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = report.filename;
      link.style.display = 'none';
      
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log(`[Report Service] Downloaded report: ${report.filename}`);
    } catch (error) {
      console.error('[Report Service] Failed to download report:', error);
      throw new Error('Failed to download report. Please try again.');
    }
  }

  generateReportFilename(baseName: string = 'timesheet-report'): string {
    const timestamp = new Date().toISOString().replace(/[:.-]/g, '');
    return `${baseName}-${timestamp}.csv`;
  }
} 