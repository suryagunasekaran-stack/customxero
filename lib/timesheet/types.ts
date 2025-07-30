// types.ts
// Shared types for timesheet processing

export type ProcessingStatus = 'idle' | 'processing' | 'complete' | 'error';

export interface ProcessingStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'current' | 'completed' | 'error';
  startTime?: number;
  completedTime?: number;
  details?: string;
}

// Updated interfaces to use strings for monetary values
export interface TimeEntry {
  cost: string;           // was: number
  hours: string;          // was: number  
  cost_per_hour: string;  // was: number
}

export interface CostVerification {
  our_navy_total: string;     // was: number
  excel_navy_total: string;   // was: number
  difference: string;         // was: number
}

// Rate structure with string values
export interface Rate {
  currency: string;
  value: string;  // was: number
}

// Task interfaces with string monetary values
export interface ConsolidatedTask {
  name: string;
  rate: Rate;
  chargeType: string;
  estimateMinutes: number;
  idempotencyKey: string;
}

export interface XeroTask {
  taskId: string;
  name: string;
  rate: Rate;
  chargeType: string;
  estimateMinutes: number;
}

export interface ClosedProjectWithChanges {
  projectId: string;
  projectCode: string;
  projectName: string;
  status: string;
  tasksToUpdate: number;
  tasksToCreate: number;
}

export interface DirectProcessingResult {
  success: boolean;
  summary: {
    entriesProcessed: number;
    projectsAnalyzed: number;
    projectsMatched: number;
    tasksCreated: number;
    tasksUpdated: number;
    tasksFailed: number;
    actualTasksFailed: number;
    projectsNotFound: number;
    processingTimeMs: number;
    closedProjectsAffected?: number;
  };
  results: Array<{
    projectCode: string;
    projectName: string;
    taskName: string;
    action: 'created' | 'updated' | 'failed';
    success: boolean;
    error?: string;
    details?: string;
  }>;
  closedProjectsWithChanges?: ClosedProjectWithChanges[];
  downloadableReport: {
    filename: string;
    content: string;
    contentType?: string;
  };
  error?: string;
}

export interface FilePreview {
  fileName: string;
  fileSize: string;
  lastModified: string;
}

export interface TenantInfo {
  tenantId: string;
  tenantName: string;
}

export const PROCESSING_STEPS: Omit<ProcessingStep, 'status' | 'startTime' | 'completedTime' | 'details'>[] = [
  {
    id: 'upload',
    title: 'File Upload',
    description: 'Uploading and validating timesheet file'
  },
  {
    id: 'parse',
    title: 'Data Processing',
    description: 'Parsing timesheet data and consolidating entries'
  },
  {
    id: 'tenant',
    title: 'Xero Connection',
    description: 'Verifying Xero organisation and fetching active projects'
  },
  {
    id: 'match',
    title: 'Project Matching',
    description: 'Matching timesheet projects with Xero projects'
  },
  {
    id: 'update',
    title: 'Task Updates',
    description: 'Creating and updating project tasks in Xero'
  },
  {
    id: 'report',
    title: 'Report Generation',
    description: 'Generating comprehensive processing report'
  }
]; 