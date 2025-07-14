export interface SyncStep {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'error' | 'skipped';
  progress?: number;
  error?: string;
  result?: any;
  startTime?: Date;
  endTime?: Date;
}

export interface SyncSession {
  id: string;
  tenantId: string;
  tenantName: string;
  startTime: Date;
  endTime?: Date;
  status: 'initializing' | 'running' | 'completed' | 'failed' | 'cancelled';
  steps: SyncStep[];
  summary?: SyncSummary;
  error?: string;
}

export interface SyncSummary {
  pipedriveDealsCount: number;
  xeroProjectsCount: number;
  matchedCount: number;
  unmatchedPipedriveCount: number;
  unmatchedXeroCount: number;
  valueDiscrepancies: ValueDiscrepancy[];
  recommendations: string[];
  rawPipedriveDeals?: PipedriveWonDeal[];
  rawXeroProjects?: XeroProject[];
  matchedProjects?: ProjectMatch[];
  unmatchedPipedriveDeals?: PipedriveWonDeal[];
  unmatchedXeroProjects?: XeroProject[];
}

export interface ValueDiscrepancy {
  projectName: string;
  projectKey: string;
  pipedriveValue: number;
  xeroValue: number;
  difference: number;
  differencePercentage: number;
}

export interface PipedriveWonDeal {
  id: string;
  title: string;
  value: number;
  currency: string;
  won_time: string;
  status: string;
  pipeline_id: number;
  pipeline_name?: string;
  org_name?: string;
  person_name?: string;
  custom_fields?: Record<string, any>;
}

export interface XeroProject {
  projectId: string;
  name: string;
  contactId: string;
  contactName: string;
  startDate: string;
  deadlineDate?: string;
  status: string;
  totalTaskAmount?: {
    value: number;
    currency: string;
  };
  totalExpenseAmount?: {
    value: number;
    currency: string;
  };
  totalAmount?: {
    value: number;
    currency: string;
  };
  estimate?: {
    value: number;
    currency: string;
  };
}

export interface ProjectMatch {
  pipedriveProject: PipedriveWonDeal;
  xeroProject: XeroProject;
  matchKey: string;
  valueMatch: boolean;
  valueDifference?: number;
  valueDifferencePercentage?: number;
}

export interface SyncProgressCallback {
  (step: SyncStep): void;
}

export interface OrchestrationConfig {
  enableValueComparison: boolean;
  valueTolerancePercentage: number;
  includeArchivedProjects: boolean;
  workInProgressPipelineId?: number;
}

export const DEFAULT_ORCHESTRATION_CONFIG: OrchestrationConfig = {
  enableValueComparison: true,
  valueTolerancePercentage: 5, // 5% tolerance for value differences
  includeArchivedProjects: false,
};