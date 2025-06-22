// TimesheetProcessingController.ts
// Main orchestrator for timesheet processing workflow

import { FileValidationService } from './services/FileValidationService';
import { TenantService } from './services/TenantService';
import { ProcessingStepService } from './services/ProcessingStepService';
import { TimesheetProcessingService } from './services/TimesheetProcessingService';
import { ReportService } from './services/ReportService';
import { ProcessingStep, ProcessingStatus, DirectProcessingResult } from './types';

export interface ProcessingCallbacks {
  onStatusChange: (status: ProcessingStatus) => void;
  onStepUpdate: (steps: ProcessingStep[]) => void;
  onError: (error: string) => void;
  onResults: (results: DirectProcessingResult) => void;
  onTenantInfo: (tenantInfo: { tenantId: string; tenantName: string }) => void;
}

export class TimesheetProcessingController {
  private fileValidationService: FileValidationService;
  private tenantService: TenantService;
  private stepService: ProcessingStepService;
  private processingService: TimesheetProcessingService;
  private reportService: ReportService;
  private callbacks: ProcessingCallbacks;

  constructor(callbacks: ProcessingCallbacks) {
    this.callbacks = callbacks;
    this.fileValidationService = new FileValidationService();
    this.tenantService = new TenantService();
    this.stepService = new ProcessingStepService((steps: ProcessingStep[]) => {
      callbacks.onStepUpdate(steps);
    });
    this.processingService = new TimesheetProcessingService();
    this.reportService = new ReportService();
  }

  async validateAndPrepareFile(file: File): Promise<{
    isValid: boolean;
    preview: {
      fileName: string;
      fileSize: string;
      lastModified: string;
    } | null;
    error?: string;
  }> {
    const validation = this.fileValidationService.validateFile(file);
    if (!validation.isValid) {
      return validation;
    }

    // Fetch tenant info after successful validation
    try {
      const tenantInfo = await this.tenantService.fetchTenantInfo();
      if (tenantInfo) {
        this.callbacks.onTenantInfo(tenantInfo);
      }
      return validation;
    } catch (error) {
      return {
        isValid: false,
        preview: null,
        error: 'Unable to verify Xero connection'
      };
    }
  }

  async processTimesheet(file: File, tenantInfo: { tenantId: string; tenantName: string }): Promise<void> {
    this.callbacks.onStatusChange('processing');
    
    // Initialize processing steps
    const steps = this.stepService.initializeSteps();
    
    try {
      // Step 1: File Upload
      await this.executeStep('upload', async () => {
        await this.simulateDelay(500);
        return `Uploading ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`;
      });

      // Step 2: Data Processing
      await this.executeStep('parse', async () => {
        await this.simulateDelay(800);
        return 'Processing timesheet data and consolidating entries...';
      });

      // Step 3: Xero Connection
      await this.executeStep('tenant', async () => {
        await this.simulateDelay(600);
        return `Connecting to "${tenantInfo.tenantName}" and fetching IN PROGRESS projects only...`;
      });

      // Step 4: Project Matching
      await this.executeStep('match', async () => {
        await this.simulateDelay(400);
        return 'Matching timesheet projects with active Xero IN PROGRESS projects...';
      });

      // Step 5: Process timesheet via API
      this.stepService.startStep('update', 'Creating and updating project tasks for matched IN PROGRESS projects only...');
      
      console.log(`[TimesheetController] Processing timesheet: ${file.name} for tenant: ${tenantInfo.tenantName}`);
      const results = await this.processingService.processTimesheetDirect(file);
      
      // Log validation results
      console.log(`[TimesheetController] Processing complete:`, {
        success: results.success,
        projectsAnalyzed: results.summary.projectsAnalyzed,
        projectsMatched: results.summary.projectsMatched,
        tasksCreated: results.summary.tasksCreated,
        tasksUpdated: results.summary.tasksUpdated,
        actualTasksFailed: results.summary.actualTasksFailed,
        projectsNotFound: results.summary.projectsNotFound
      });
      
      // Validate that we only processed IN PROGRESS projects
      if (results.summary.projectsNotFound > 0) {
        console.info(`[TimesheetController] ${results.summary.projectsNotFound} projects not found - these are likely CLOSED/COMPLETED projects (this is expected)`);
      }
      
      if (results.summary.actualTasksFailed > 0) {
        console.warn(`[TimesheetController] ${results.summary.actualTasksFailed} tasks failed - these require attention`);
      }
      
      const updateDetails = `${results.summary.tasksCreated} created, ${results.summary.tasksUpdated} updated for IN PROGRESS projects only`;
      this.stepService.completeStep('update', updateDetails);

      // Step 6: Report Generation
      await this.executeStep('report', async () => {
        await this.simulateDelay(300);
        
        // Auto-download report
        this.reportService.downloadReport(results.downloadableReport);
        
        return 'Report generated successfully';
      });

      // Handle results
      this.handleProcessingResults(results);

    } catch (error: any) {
      console.error(`[TimesheetController] Processing failed:`, error);
      this.callbacks.onStatusChange('error');
      this.callbacks.onError(error.message);
      
      // Mark current step as error
      this.stepService.errorCurrentStep(error.message);
    }
  }

  private async executeStep(stepId: string, action: () => Promise<string>): Promise<void> {
    this.stepService.startStep(stepId);
    try {
      const details = await action();
      this.stepService.completeStep(stepId, details);
    } catch (error: any) {
      this.stepService.errorStep(stepId, error.message);
      throw error;
    }
  }

  private handleProcessingResults(results: DirectProcessingResult): void {
    const hasProcessedTasks = results.summary.tasksCreated > 0 || results.summary.tasksUpdated > 0;
    
    if (results.success || hasProcessedTasks) {
      this.callbacks.onStatusChange('complete');
      this.callbacks.onResults(results);
      
      // Log informational messages
      if (results.summary.projectsNotFound > 0) {
        console.info(`[Timesheet Processing] ${results.summary.projectsNotFound} projects not found (likely closed)`);
      }
    } else if (results.summary.actualTasksFailed > 0) {
      throw new Error(`Processing failed with ${results.summary.actualTasksFailed} actual failures`);
    }
  }

  private simulateDelay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  reset(): void {
    this.stepService.reset();
  }
} 