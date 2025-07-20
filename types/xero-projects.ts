export interface XeroAmount {
  currency: string;
  value: number;
}

export interface XeroProjectResponse {
  projectId: string;
  contactId: string;
  name: string;
  currencyCode: string;
  minutesLogged: number;
  totalTaskAmount: XeroAmount;
  totalExpenseAmount: XeroAmount;
  minutesToBeInvoiced: number;
  taskAmountToBeInvoiced: XeroAmount;
  taskAmountInvoiced: XeroAmount;
  expenseAmountToBeInvoiced: XeroAmount;
  expenseAmountInvoiced: XeroAmount;
  projectAmountInvoiced: XeroAmount;
  deposit: XeroAmount;
  depositApplied: XeroAmount;
  creditNoteAmount: XeroAmount;
  totalInvoiced: XeroAmount;
  totalToBeInvoiced: XeroAmount;
  deadlineUtc?: string;
  estimate?: XeroAmount;
  status: 'INPROGRESS' | 'CLOSED';
}

export interface XeroTaskResponse {
  name: string;
  rate: XeroAmount;
  chargeType: 'FIXED' | 'TIME' | 'NON_CHARGEABLE';
  status: 'ACTIVE' | 'INVOICED' | 'LOCKED';
  estimateMinutes: number;
  taskId: string;
  projectId: string;
  totalMinutes: number;
  totalAmount: XeroAmount;
  minutesToBeInvoiced: number;
  minutesInvoiced: number;
  nonChargeableMinutes: number;
  fixedMinutes: number;
  amountToBeInvoiced: XeroAmount;
  amountInvoiced: XeroAmount;
}

export interface XeroPaginatedResponse<T> {
  pagination: {
    page: number;
    pageSize: number;
    pageCount: number;
    itemCount: number;
  };
  items: T[];
}

export interface XeroProjectsResponse extends XeroPaginatedResponse<XeroProjectResponse> {}
export interface XeroTasksResponse extends XeroPaginatedResponse<XeroTaskResponse> {}

export interface XeroProjectWithTasks extends XeroProjectResponse {
  tasks: XeroTaskResponse[];
  projectCode?: string;
  totalTasks: number;
  totalProjectValue: number;
}

export interface XeroProjectsDocument {
  _id?: string;
  tenantId: string;
  projectId: string;
  lastSyncedAt: Date;
  projectData: XeroProjectResponse;
  tasks: XeroTaskResponse[];
  projectCode?: string;
  totalTasks: number;
  totalProjectValue: number;
  syncStatus?: 'pending' | 'synced' | 'failed';
  syncError?: string;
}

export interface XeroProjectsSyncResult {
  success: boolean;
  projectsSynced: number;
  projectsFailed: number;
  tasksSynced: number;
  errors: Array<{
    projectId: string;
    projectName: string;
    error: string;
  }>;
  syncDuration: number;
  tenantId: string;
}