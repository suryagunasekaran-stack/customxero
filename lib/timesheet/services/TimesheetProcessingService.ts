// TimesheetProcessingService.ts
// Service for handling timesheet processing API calls

import { DirectProcessingResult } from '../types';

export class TimesheetProcessingService {
  private readonly API_ENDPOINT = '/api/xero/process-timesheet-direct';

  async processTimesheetDirect(file: File): Promise<DirectProcessingResult> {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(this.API_ENDPOINT, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(errorData.error || `Server responded with ${response.status}`);
      }

      const data: DirectProcessingResult = await response.json();
      
      // Log processing results
      this.logProcessingResults(data);
      
      return data;
    } catch (error: any) {
      console.error('[Timesheet Processing] API Error:', error);
      throw error;
    }
  }

  private logProcessingResults(data: DirectProcessingResult): void {
    console.log('[Timesheet Processing] Results:', {
      success: data.success,
      summary: data.summary
    });

    if (!data.success && (data.summary.tasksCreated > 0 || data.summary.tasksUpdated > 0)) {
      console.warn('[Timesheet Processing] Partial success with some failures:', {
        created: data.summary.tasksCreated,
        updated: data.summary.tasksUpdated,
        actualFailures: data.summary.actualTasksFailed,
        projectsNotFound: data.summary.projectsNotFound
      });
    }

    if (data.summary.projectsNotFound > 0) {
      console.info(
        `[Timesheet Processing] ${data.summary.projectsNotFound} projects not found ` +
        `(likely moved to CLOSED/COMPLETED status - this is normal)`
      );
    }
  }
} 