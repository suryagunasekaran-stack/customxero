import { NextRequest, NextResponse } from 'next/server';
import { ensureValidToken } from '@/lib/ensureXeroToken';
import { trackXeroApiCall, waitForXeroRateLimit, updateXeroRateLimitFromHeaders } from '@/lib/xeroApiTracker';
import { auth } from '@/lib/auth';
import { ExcelReportService } from '@/lib/timesheet/services/ExcelReportService';

interface ConsolidatedTask {
  name: string;
  rate: {
    currency: string;
    value: string;  // was: number
  };
  chargeType: string;
  estimateMinutes: number;
  idempotencyKey: string;
}

interface ConsolidatedPayload {
  [projectCode: string]: ConsolidatedTask[];
}

interface TaskPayload {
  name: string;
  rate: {
    currency: string;
    value: number;
  };
  chargeType: string;
  estimateMinutes: number;
}

interface TaskUpdate {
  projectId: string;
  taskId: string;
  payload: TaskPayload;
}

interface TaskCreate {
  projectId: string;
  payload: TaskPayload;
}

interface ProcessedTimesheet {
  success: boolean;
  message?: string;
  metadata: {
    creation_date?: string;
    period_range: string;
    entries_processed: number;
    entries_grouped?: number;
    projects_consolidated?: number;
    projects_processed?: number;
    total_changes?: number;
  };
  changes?: {
    updates: TaskUpdate[];
    creates: TaskCreate[];
  };
  consolidated_payload?: ConsolidatedPayload; // Keep for backward compatibility
  summary?: {
    total_projects_processed: number;
    tasks_to_update: number;
    tasks_to_create: number;
    total_changes: number;
  };
  cost_verification?: {
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
  };
}

interface XeroProject {
  projectId: string;
  name: string;
  projectCode: string;
  status: string;
}

interface XeroTask {
  taskId: string;
  name: string;
  rate: {
    currency: string;
    value: string;  // was: number
  };
  chargeType: string;
  estimateMinutes: number;
}

interface TaskUpdateResult {
  projectCode: string;
  projectName: string;
  taskName: string;
  action: 'created' | 'updated' | 'failed' | 'skipped';
  success: boolean;
  error?: string;
  details?: string;
}

interface DirectProcessingResult {
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
  };
  results: TaskUpdateResult[];
  downloadableReport: {
    filename: string;
    content: string;
  };
  error?: string;
}

// Extract project code from project name (same logic as in XeroProjectService)
function extractProjectCode(projectName: string | undefined | null): string {
  // Handle undefined or null project names
  if (!projectName || typeof projectName !== 'string') {
    return '';
  }
  
  // Common patterns for project codes:
  // 1. "NY250388 - USS SAVANNAH (LCS 28)" -> "NY250388"
  // 2. "ED25002 - Titanic" -> "ED25002"
  // 3. "ABC123: Description" -> "ABC123"
  
  const patterns = [
    /^([A-Z]{2}\d{3,6})/, // NY250388 (8 chars), ED25002 (7 chars), etc.
    /^([A-Z]{3}\d{3})/,   // ABC123, etc.
    /^([A-Z]+\d+)/,       // Any letters followed by numbers
  ];

  for (const pattern of patterns) {
    const match = projectName.match(pattern);
    if (match) {
      return match[1];
    }
  }

  // If no pattern matches, return the first word (before any separator)
  const firstWord = projectName.split(/[\s\-_:]/)[0];
  return firstWord || projectName;
}

// Get tenant-specific task configuration
function getTaskConfigForTenant(tenantId: string, tenantName: string) {
  if (tenantId === "017d3bc6-65b9-4588-9746-acb7167a59f1" || tenantName.includes("Demo Company")) {
    return { currency: "USD" };
  }
  if (tenantId === "6dd39ea4-e6a6-4993-a37a-21482ccf8d22" || tenantName.includes("BS E&I SERVICE")) {
    return { currency: "SGD" };
  }
  return { currency: "USD" };
}

// Process timesheet with Python backend
async function processTimesheetWithPython(blobUrl: string, fileName: string, tenantId: string): Promise<ProcessedTimesheet> {
  const flaskUrl = `${process.env.NEXT_PUBLIC_FLASK_SERVER_URL}/api/process-timesheet`;
  console.log('[API] Calling Python backend:', flaskUrl);
  
  const response = await fetch(flaskUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      blobUrl,
      fileName,
      tenantId
    }),
  });

  if (!response.ok) {
    // Try to get error text first, as it might be too large for JSON parsing
    const errorText = await response.text();
    console.error('[API] Python backend error response:', errorText.substring(0, 500)); // Log first 500 chars
    
    // Check if the error is about text length
    if (errorText.includes('Text length must not exceed 32767')) {
      throw new Error('The timesheet data is too large. The backend response exceeds the maximum allowed size. Please try processing a smaller timesheet or contact support.');
    }
    
    // Try to parse as JSON
    try {
      const errorData = JSON.parse(errorText);
      throw new Error(errorData.error || `Python backend error: ${response.status}`);
    } catch (e) {
      throw new Error(`Python backend error: ${response.status} - ${errorText.substring(0, 200)}`);
    }
  }

  // Get response text first to check size
  const responseText = await response.text();
  console.log('[API] Python backend response size:', responseText.length, 'characters');
  
  // Check if response is too large
  if (responseText.length > 30000) {
    console.warn('[API] Warning: Large response from Python backend:', responseText.length, 'characters');
  }
  
  let data;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    console.error('[API] Failed to parse Python backend response:', e);
    throw new Error('Invalid JSON response from Python backend');
  }
  
  // Handle empty response from backend
  if (Object.keys(data).length === 0) {
    console.log('[API] Backend returned empty response - using mock data for now');
    return {
      success: true,
      metadata: {
        entries_processed: 0,
        projects_consolidated: 0,
        period_range: 'N/A'
      },
      consolidated_payload: {}
    };
  }
  
  // Transform the backend response structure to match expected format
  // Backend returns: {tasks, costVerificationSummary, statistics}
  // We need: {success, metadata, consolidated_payload, changes, cost_verification, summary}
  
  console.log('[API] Backend response structure:', Object.keys(data));
  
  // Handle error responses from backend
  if (data.error) {
    throw new Error(data.error || 'Timesheet processing failed');
  }
  
  // Transform tasks array into consolidated_payload and changes
  let consolidated_payload: ConsolidatedPayload = {};
  let changes = { updates: [], creates: [] } as any;
  
  if (data.tasks && Array.isArray(data.tasks)) {
    console.log('[API] Processing', data.tasks.length, 'tasks from backend');
    
    // Group tasks by project code
    data.tasks.forEach((task: any) => {
      const projectCode = task.projectCode || task.project_code || 'UNKNOWN';
      
      if (!consolidated_payload[projectCode]) {
        consolidated_payload[projectCode] = [];
      }
      
      // Transform task to expected format
      const transformedTask: ConsolidatedTask = {
        name: task.name || task.taskName || 'Unnamed Task',
        rate: {
          currency: task.currency || 'SGD',
          value: String(task.rate || task.hourlyRate || 0)
        },
        chargeType: task.chargeType || 'TIME',
        estimateMinutes: task.estimateMinutes || task.minutes || 0,
        idempotencyKey: task.idempotencyKey || `${projectCode}-${Date.now()}-${Math.random()}`
      };
      
      consolidated_payload[projectCode].push(transformedTask);
      
      // Add to changes for tracking
      if (task.isNew) {
        changes.creates.push({
          projectId: projectCode,
          payload: {
            name: transformedTask.name,
            rate: {
              currency: transformedTask.rate.currency,
              value: Number(transformedTask.rate.value)
            },
            chargeType: transformedTask.chargeType,
            estimateMinutes: transformedTask.estimateMinutes
          }
        });
      } else {
        changes.updates.push({
          projectId: projectCode,
          taskId: task.taskId || 'unknown',
          payload: {
            name: transformedTask.name,
            rate: {
              currency: transformedTask.rate.currency,
              value: Number(transformedTask.rate.value)
            },
            chargeType: transformedTask.chargeType,
            estimateMinutes: transformedTask.estimateMinutes
          }
        });
      }
    });
  }
  
  // Build the response in expected format
  const processedData: ProcessedTimesheet = {
    success: true,
    message: 'Timesheet processed successfully',
    metadata: {
      creation_date: data.statistics?.processingDate || new Date().toISOString(),
      period_range: data.statistics?.periodRange || 'Unknown',
      entries_processed: data.statistics?.entriesProcessed || data.tasks?.length || 0,
      entries_grouped: data.statistics?.entriesGrouped || 0,
      projects_consolidated: Object.keys(consolidated_payload).length,
      projects_processed: data.statistics?.projectsProcessed || Object.keys(consolidated_payload).length,
      total_changes: changes.updates.length + changes.creates.length
    },
    consolidated_payload,
    changes,
    summary: {
      total_projects_processed: Object.keys(consolidated_payload).length,
      tasks_to_update: changes.updates.length,
      tasks_to_create: changes.creates.length,
      total_changes: changes.updates.length + changes.creates.length
    },
    cost_verification: data.costVerificationSummary ? {
      verification_performed: true,
      calculations_match: data.costVerificationSummary.calculationsMatch || false,
      our_total_all_depts_ny_jobs: data.costVerificationSummary.ourTotal || 0,
      excel_total_all_depts_ny_jobs: data.costVerificationSummary.excelTotal || 0,
      excel_navy_only_ny_jobs: data.costVerificationSummary.navyTotal || 0,
      excel_non_navy_ny_jobs: data.costVerificationSummary.nonNavyTotal || 0,
      difference: data.costVerificationSummary.difference || 0,
      excel_all_jobs_all_depts: data.costVerificationSummary.allJobsTotal || 0,
      discrepancies: data.costVerificationSummary.discrepancies || []
    } : undefined
  };
  
  // Truncate large fields if necessary
  if (processedData.consolidated_payload) {
    const payloadStr = JSON.stringify(processedData.consolidated_payload);
    if (payloadStr.length > 20000) {
      console.warn('[API] Truncating large consolidated_payload:', payloadStr.length, 'characters');
      const projectCodes = Object.keys(processedData.consolidated_payload);
      const truncatedPayload: any = {};
      let currentSize = 0;
      for (const code of projectCodes) {
        const projectStr = JSON.stringify(processedData.consolidated_payload[code]);
        if (currentSize + projectStr.length > 15000) break;
        truncatedPayload[code] = processedData.consolidated_payload[code];
        currentSize += projectStr.length;
      }
      processedData.consolidated_payload = truncatedPayload;
      // Add truncation info to metadata
      (processedData.metadata as any).truncated = true;
      (processedData.metadata as any).original_projects_count = projectCodes.length;
      (processedData.metadata as any).truncated_projects_count = Object.keys(truncatedPayload).length;
    }
  }

  return processedData;
}

// Fetch active Xero projects directly (no caching)
async function getActiveXeroProjects(accessToken: string, tenantId: string): Promise<{ projects: XeroProject[], tenantName: string }> {
  const response = await fetch('https://api.xero.com/projects.xro/2.0/Projects?status=INPROGRESS', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Xero-Tenant-Id': tenantId,
      'Accept': 'application/json'
    }
  });

  await trackXeroApiCall(tenantId);
  await updateXeroRateLimitFromHeaders(response.headers, tenantId);

  if (!response.ok) {
    throw new Error(`Failed to fetch Xero projects: ${response.status}`);
  }

  const data = await response.json();
  
  // Get tenant info from organizations API
  const orgResponse = await fetch('https://api.xero.com/api.xro/2.0/Organisation', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Xero-Tenant-Id': tenantId,
      'Accept': 'application/json'
    }
  });

  await trackXeroApiCall(tenantId);
  
  let tenantName = 'Unknown';
  if (orgResponse.ok) {
    const orgData = await orgResponse.json();
    tenantName = orgData.Organisations?.[0]?.Name || 'Unknown';
  }

  // Extract project codes from project names
  const projects = (data.items || []).map((project: any) => {
    const extractedCode = extractProjectCode(project.name);
    return {
      ...project,
      projectCode: extractedCode
    };
  });

  return {
    projects,
    tenantName
  };
}

// Fetch existing tasks for a project
async function getProjectTasks(projectId: string, accessToken: string, tenantId: string): Promise<XeroTask[]> {
  await waitForXeroRateLimit(tenantId);
  
  const response = await fetch(`https://api.xero.com/projects.xro/2.0/projects/${projectId}/tasks`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Xero-Tenant-Id': tenantId,
      'Accept': 'application/json'
    }
  });

  await trackXeroApiCall(tenantId);
  await updateXeroRateLimitFromHeaders(response.headers, tenantId);

  if (!response.ok) {
    throw new Error(`Failed to fetch tasks for project ${projectId}: ${response.status}`);
  }

  const data = await response.json();
  return data.items || [];
}

// Batch fetch tasks for multiple projects
async function getBatchProjectTasks(
  projectIds: string[],
  accessToken: string,
  tenantId: string
): Promise<Map<string, XeroTask[]>> {
  const tasksByProject = new Map<string, XeroTask[]>();
  
  // Process in batches of 5 to respect rate limits
  const batchSize = 5;
  for (let i = 0; i < projectIds.length; i += batchSize) {
    const batch = projectIds.slice(i, i + batchSize);
    
    // Execute batch requests in parallel
    const promises = batch.map(async (projectId) => {
      try {
        const tasks = await getProjectTasks(projectId, accessToken, tenantId);
        return { projectId, tasks };
      } catch (error) {
        console.error(`[Error] Failed to fetch tasks for project ${projectId}:`, error);
        return { projectId, tasks: [] };
      }
    });
    
    const results = await Promise.all(promises);
    results.forEach(({ projectId, tasks }) => {
      tasksByProject.set(projectId, tasks);
    });
  }
  
  return tasksByProject;
}

// Create or update a task
async function createOrUpdateTask(
  projectId: string,
  task: ConsolidatedTask,
  existingTask: XeroTask | null,
  accessToken: string,
  tenantId: string,
  currency: string
): Promise<{ success: boolean; action: string; error?: string }> {
  await waitForXeroRateLimit(tenantId);

  const taskPayload = {
    name: task.name,
    rate: {
      currency,
      value: Number(task.rate.value) / 100 // Convert cents to dollars
    },
    chargeType: task.chargeType,
    estimateMinutes: task.estimateMinutes
  };

  try {
    if (existingTask) {
      // Update existing task
      const response = await fetch(`https://api.xero.com/projects.xro/2.0/projects/${projectId}/tasks/${existingTask.taskId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Xero-Tenant-Id': tenantId,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(taskPayload)
      });

      await trackXeroApiCall(tenantId);
      await updateXeroRateLimitFromHeaders(response.headers, tenantId);

      if (response.ok) {
        return { success: true, action: 'updated' };
      } else {
        const errorText = await response.text();
        return { success: false, action: 'failed', error: `Update failed: ${response.status} - ${errorText}` };
      }
    } else {
      // Create new task
      const response = await fetch(`https://api.xero.com/projects.xro/2.0/projects/${projectId}/tasks`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Xero-Tenant-Id': tenantId,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Idempotency-Key': task.idempotencyKey
        },
        body: JSON.stringify(taskPayload)
      });

      await trackXeroApiCall(tenantId);
      await updateXeroRateLimitFromHeaders(response.headers, tenantId);

      if (response.ok) {
        return { success: true, action: 'created' };
      } else {
        const errorText = await response.text();
        return { success: false, action: 'failed', error: `Create failed: ${response.status} - ${errorText}` };
      }
    }
  } catch (error) {
    return { 
      success: false, 
      action: 'failed', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// Process all tasks for all matching projects
async function batchUpdateXeroTasks(
  payload: ConsolidatedPayload,
  projects: XeroProject[],
  accessToken: string,
  tenantId: string,
  currency: string
): Promise<TaskUpdateResult[]> {
  const results: TaskUpdateResult[] = [];
  
  // Create project code lookup
  const projectsByCode = new Map<string, XeroProject>();
  projects.forEach(project => {
    if (project.projectCode) {
      projectsByCode.set(project.projectCode, project);
    }
  });

  const payloadProjectCodes = Object.keys(payload);
  const matchingProjectsCount = payloadProjectCodes.filter(code => projectsByCode.has(code)).length;
  
  console.log(`[Processing Stats] Projects in payload: ${payloadProjectCodes.length}, Active in Xero: ${projects.length}, Matches: ${matchingProjectsCount}`);

  // Get all matching projects and batch fetch their tasks
  const matchingProjectsList = payloadProjectCodes
    .map(code => projectsByCode.get(code))
    .filter((project): project is XeroProject => project !== undefined);
  
  const projectTasksMap = matchingProjectsList.length > 0 
    ? await getBatchProjectTasks(
        matchingProjectsList.map(p => p.projectId), 
        accessToken, 
        tenantId
      )
    : new Map();

  // Process each project in the payload
  for (const [projectCode, tasks] of Object.entries(payload)) {
    const project = projectsByCode.get(projectCode);
    
    if (!project) {
      // Project not found in active Xero projects
      tasks.forEach(task => {
        results.push({
          projectCode,
          projectName: 'Not Found',
          taskName: task.name,
          action: 'failed',
          success: false,
          error: `Project ${projectCode} not found in active Xero projects`
        });
      });
      continue;
    }

    try {
      // Get existing tasks from batch result
      const existingTasks = projectTasksMap.get(project.projectId) || [];
      const existingTasksMap = new Map<string, XeroTask>(
        existingTasks.map((task: XeroTask) => [task.name.toLowerCase(), task])
      );

      // Process each task
      for (const task of tasks) {
        const existingTask = existingTasksMap.get(task.name.toLowerCase()) || null;
        
        const updateResult = await createOrUpdateTask(
          project.projectId,
          task,
          existingTask,
          accessToken,
          tenantId,
          currency
        );

        results.push({
          projectCode,
          projectName: project.name,
          taskName: task.name,
          action: updateResult.action as any,
          success: updateResult.success,
          error: updateResult.error,
          details: existingTask ? 
            `Updated from ${existingTask.estimateMinutes}min/$${(Number(existingTask.rate.value)/100).toFixed(2)} to ${task.estimateMinutes}min/$${(Number(task.rate.value)/100).toFixed(2)}` :
            `Created with ${task.estimateMinutes}min/$${(Number(task.rate.value)/100).toFixed(2)}`
        });
      }
    } catch (error) {
      console.error(`[Error] Processing project ${projectCode}:`, error);
      // If we can't process the project at all, mark all tasks as failed
      tasks.forEach(task => {
        results.push({
          projectCode,
          projectName: project.name,
          taskName: task.name,
          action: 'failed',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown project error'
        });
      });
    }
  }

  return results;
}

// Generate comprehensive processing report
function generateProcessingReport(
  timesheetData: ProcessedTimesheet,
  results: TaskUpdateResult[],
  summary: any
): { filename: string; content: string } {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const filename = `timesheet-processing-report-${timestamp}.csv`;
  
  // Filter out "not found" projects as they're common when projects move to closed
  const successfulResults = results.filter(r => r.success);
  const actualFailures = results.filter(r => !r.success && !r.error?.includes('not found in active Xero projects'));
  const notFoundResults = results.filter(r => !r.success && r.error?.includes('not found in active Xero projects'));
  
  const csvLines = [
    'Section,Project Code,Project Name,Task Name,Action,Status,Details,Error'
  ];
  
  // Add enhanced metadata
  csvLines.push(`# Report Generated: ${new Date().toISOString()}`);
  csvLines.push(`# Period: ${timesheetData.metadata.period_range}`);
  csvLines.push(`# Entries Processed: ${timesheetData.metadata.entries_processed}`);
  csvLines.push(`# Projects Analyzed: ${summary.projectsAnalyzed}`);
  csvLines.push(`# Projects Matched: ${summary.projectsMatched}`);
  csvLines.push(`# Tasks Created: ${summary.tasksCreated}`);
  csvLines.push(`# Tasks Updated: ${summary.tasksUpdated}`);
  csvLines.push(`# Actual Task Failures: ${actualFailures.length}`);
  csvLines.push(`# Projects Not Found (Likely Closed): ${notFoundResults.length}`);
  csvLines.push(`# Processing Time: ${summary.processingTimeMs}ms`);
  csvLines.push('');
  
  // Add alert for actual failures
  if (actualFailures.length > 0) {
    csvLines.push(`# ⚠️  ALERT: ${actualFailures.length} actual failures detected that require attention!`);
    csvLines.push('');
  }
  
  // Section 1: Successful Operations (Created/Updated)
  if (successfulResults.length > 0) {
    csvLines.push('# ✅ SUCCESSFUL OPERATIONS');
    csvLines.push('# These tasks were successfully created or updated');
    successfulResults.forEach(result => {
      csvLines.push(
        `"Success","${result.projectCode}","${result.projectName}","${result.taskName}","${result.action}","${result.success ? 'Success' : 'Failed'}","${result.details || 'N/A'}","${result.error || 'N/A'}"`
      );
    });
    csvLines.push('');
  }
  
  // Section 2: Actual Failures (Rate limits, API errors, etc.)
  if (actualFailures.length > 0) {
    csvLines.push('# ❌ ACTUAL FAILURES REQUIRING ATTENTION');
    csvLines.push('# These are real failures that need investigation');
    actualFailures.forEach(result => {
      csvLines.push(
        `"Failure","${result.projectCode}","${result.projectName}","${result.taskName}","${result.action}","${result.success ? 'Success' : 'Failed'}","${result.details || 'N/A'}","${result.error || 'N/A'}"`
      );
    });
    csvLines.push('');
  }
  
  // Section 3: Projects Not Found (informational only)
  if (notFoundResults.length > 0) {
    csvLines.push('# ℹ️  PROJECTS NOT FOUND (LIKELY CLOSED/COMPLETED)');
    csvLines.push('# These projects are not in active status - this is normal');
    
    // Group by project code to avoid repetition
    const projectGroups = new Map<string, TaskUpdateResult[]>();
    notFoundResults.forEach(result => {
      if (!projectGroups.has(result.projectCode)) {
        projectGroups.set(result.projectCode, []);
      }
      projectGroups.get(result.projectCode)!.push(result);
    });
    
    projectGroups.forEach((tasks, projectCode) => {
      csvLines.push(`"Info","${projectCode}","Not Found","${tasks.length} tasks","skipped","Info","Project likely moved to CLOSED/COMPLETED status","Normal - no action required"`);
    });
    csvLines.push('');
  }
  
  // Add summary
  csvLines.push('# 📊 SUMMARY');
  csvLines.push(`# Total Operations: ${results.length}`);
  csvLines.push(`# Successful: ${successfulResults.length}`);
  csvLines.push(`# Actual Failures: ${actualFailures.length}`);
  csvLines.push(`# Projects Not Found: ${notFoundResults.length}`);
  csvLines.push(`# Success Rate (excluding not found): ${actualFailures.length === 0 ? '100%' : ((successfulResults.length / (successfulResults.length + actualFailures.length)) * 100).toFixed(1)}%`);
  
  return { filename, content: csvLines.join('\n') };
}

export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds for Vercel Pro

// Helper function to safely stringify large objects
function safeStringify(obj: any, maxLength: number = 30000): string {
  const str = JSON.stringify(obj);
  if (str.length > maxLength) {
    console.warn(`[API] Object too large (${str.length} chars), truncating to ${maxLength}`);
    return str.substring(0, maxLength) + '... [truncated]';
  }
  return str;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[API] Starting timesheet processing');

  // Get authentication and tenant info
  const session = await auth();
  const { access_token, effective_tenant_id, available_tenants } = await ensureValidToken();
  const selectedTenant = available_tenants?.find(t => t.tenantId === effective_tenant_id);

  try {
    const contentType = request.headers.get('content-type');
    let blobUrl: string;
    let fileName: string;
    let tenantId = effective_tenant_id; // Use the tenant from auth
    
    // Handle both FormData (file upload) and JSON (blob URL) requests
    if (contentType?.includes('multipart/form-data')) {
      // Handle FormData with file upload
      const formData = await request.formData();
      const file = formData.get('file') as File;
      
      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }
      
      fileName = file.name;
      
      // For now, create a data URL from the file to pass to Python backend
      // In production, this should upload to blob storage first
      const arrayBuffer = await file.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const mimeType = file.type || 'application/octet-stream';
      blobUrl = `data:${mimeType};base64,${base64}`;
      
      console.log('[API] Processing file upload:', fileName, 'size:', file.size);
      
    } else if (contentType?.includes('application/json')) {
      // Handle JSON with blob URL
      const body = await request.json();
      blobUrl = body.blobUrl;
      fileName = body.fileName;
      tenantId = body.tenantId || effective_tenant_id;
      
      if (!blobUrl || !fileName) {
        return NextResponse.json({ error: 'blobUrl and fileName are required' }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: 'Request must be either JSON or FormData' }, { status: 400 });
    }

    console.log('[API] Processing file:', fileName);

    // Step 1: Process timesheet with Python backend
    const timesheetData = await processTimesheetWithPython(blobUrl, fileName, tenantId);
    console.log(`[Stats] Processed: ${timesheetData.metadata.entries_processed} entries, ${timesheetData.metadata.projects_processed || timesheetData.metadata.projects_consolidated || 0} projects`);
    console.log('[API] Timesheet data structure:', {
      hasMetadata: !!timesheetData.metadata,
      hasChanges: !!timesheetData.changes,
      hasSummary: !!timesheetData.summary,
      hasCostVerification: !!timesheetData.cost_verification,
      hasConsolidatedPayload: !!timesheetData.consolidated_payload,
      changesCount: timesheetData.changes ? {
        updates: timesheetData.changes.updates?.length || 0,
        creates: timesheetData.changes.creates?.length || 0
      } : null
    });

    // Create mock results for Excel report (since we're not processing with Xero yet)
    const mockResults: any[] = [];
    
    // Generate Excel report
    const excelReportService = new ExcelReportService();
    const excelBuffer = excelReportService.generateTimesheetReport({
      metadata: timesheetData.metadata,
      summary: {
        entriesProcessed: timesheetData.metadata.entries_processed,
        projectsAnalyzed: timesheetData.metadata.projects_processed || timesheetData.metadata.projects_consolidated || 0,
        projectsMatched: 0,
        tasksCreated: 0,
        tasksUpdated: 0,
        tasksFailed: 0,
        actualTasksFailed: 0,
        projectsNotFound: 0,
        processingTimeMs: Date.now() - startTime
      },
      results: mockResults,
      costVerification: timesheetData.cost_verification,
      changes: timesheetData.changes
    });
    
    // Convert buffer to base64 for download
    const excelBase64 = excelBuffer.toString('base64');
    
    // Check if any field is too large and truncate if necessary
    if (timesheetData.changes) {
      const changesStr = JSON.stringify(timesheetData.changes);
      if (changesStr.length > 20000) {
        console.warn('[API] Changes data too large:', changesStr.length, 'characters, truncating...');
        // Truncate the changes to a reasonable size
        const truncatedChanges = {
          updates: timesheetData.changes.updates?.slice(0, 50) || [],
          creates: timesheetData.changes.creates?.slice(0, 50) || [],
          truncated: true,
          original_updates_count: timesheetData.changes.updates?.length || 0,
          original_creates_count: timesheetData.changes.creates?.length || 0
        };
        timesheetData.changes = truncatedChanges as any;
      }
    }
    
    // Prepare the response data - ensure it matches DirectProcessingResult interface
    const responseData: any = {
      success: timesheetData.success,
      message: timesheetData.message || 'Timesheet processed successfully',
      metadata: timesheetData.metadata,
      // Include the changes data from Python backend (possibly truncated)
      changes: timesheetData.changes,
      // Build summary in the expected format for frontend
      summary: {
        entriesProcessed: timesheetData.metadata.entries_processed || 0,
        projectsAnalyzed: timesheetData.metadata.projects_processed || timesheetData.metadata.projects_consolidated || 0,
        projectsMatched: timesheetData.summary?.total_projects_processed || Object.keys(timesheetData.consolidated_payload || {}).length || 0,
        tasksCreated: timesheetData.summary?.tasks_to_create || timesheetData.changes?.creates?.length || 0,
        tasksUpdated: timesheetData.summary?.tasks_to_update || timesheetData.changes?.updates?.length || 0,
        tasksFailed: 0, // Since we're not actually updating Xero yet
        actualTasksFailed: 0,
        projectsNotFound: 0,
        processingTimeMs: Date.now() - startTime
      },
      // Include cost verification if present
      cost_verification: timesheetData.cost_verification,
      // Results array for compatibility
      results: [],
      downloadableReport: {
        filename: excelReportService.generateReportFilename(),
        content: excelBase64,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }
    };
    
    // Final check on response size
    const responseStr = JSON.stringify(responseData);
    console.log('[API] Final response size:', responseStr.length, 'characters');
    console.log('[API] Response summary:', {
      success: responseData.success,
      entriesProcessed: responseData.summary.entriesProcessed,
      projectsMatched: responseData.summary.projectsMatched,
      tasksCreated: responseData.summary.tasksCreated,
      tasksUpdated: responseData.summary.tasksUpdated,
      hasDownloadableReport: !!responseData.downloadableReport
    });
    
    if (responseStr.length > 32000) {
      console.error('[API] Response too large, removing downloadable report');
      delete responseData.downloadableReport;
      responseData.error = 'Response data was too large. Excel report generation was skipped.';
    }
    
    return NextResponse.json(responseData);

    /* COMMENTED OUT - Xero processing
    // When re-enabling Xero processing, replace the Excel report generation above with:
    // const excelBuffer = excelReportService.generateTimesheetReport({
    //   metadata: timesheetData.metadata,
    //   summary: summary, // Use the actual summary from Xero processing
    //   results: results, // Use the actual results from Xero processing
    //   costVerification: timesheetData.cost_verification,
    //   changes: timesheetData.changes
    // });
    
    // Step 2: Get active Xero projects and verify tenant
    const { projects, tenantName } = await getActiveXeroProjects(access_token, effective_tenant_id);
    console.log(`[Stats] Found ${projects.length} active IN PROGRESS Xero projects for: ${tenantName}`);
    
    // Log the project codes we found in Xero
    const xeroProjectCodes = projects.map(p => p.projectCode).filter(Boolean);
    console.log(`[Validation] Xero IN PROGRESS project codes: [${xeroProjectCodes.join(', ')}]`);
    
    // Log the project codes from the timesheet
    const timesheetProjectCodes = Object.keys(timesheetData.consolidated_payload);
    console.log(`[Validation] Timesheet project codes: [${timesheetProjectCodes.join(', ')}]`);
    
    // Find matches and log them
    const matchingCodes = timesheetProjectCodes.filter(code => xeroProjectCodes.includes(code));
    const nonMatchingCodes = timesheetProjectCodes.filter(code => !xeroProjectCodes.includes(code));
    
    console.log(`[Validation] ✅ Matching IN PROGRESS projects: ${matchingCodes.length} [${matchingCodes.join(', ')}]`);
    console.log(`[Validation] ❌ Non-matching projects (likely CLOSED/COMPLETED): ${nonMatchingCodes.length} [${nonMatchingCodes.join(', ')}]`);

    // Verify we have a valid tenant before proceeding
    if (!tenantName || tenantName === 'Unknown') {
      
      return NextResponse.json({
        success: false,
        error: 'Unable to verify Xero organisation. Please check your connection.',
        summary: {
          entriesProcessed: timesheetData.metadata.entries_processed,
          projectsAnalyzed: 0,
          projectsMatched: 0,
          tasksCreated: 0,
          tasksUpdated: 0,
          tasksFailed: 0,
          actualTasksFailed: 0,
          projectsNotFound: 0,
          processingTimeMs: Date.now() - startTime
        },
        results: []
      }, { status: 400 });
    }


    // Step 3: Get tenant configuration
    const config = getTaskConfigForTenant(effective_tenant_id, tenantName);

    // Step 4: Batch update Xero tasks

    const results = await batchUpdateXeroTasks(
      timesheetData.consolidated_payload,
      projects,
      access_token,
      effective_tenant_id,
      config.currency
    );

    // Calculate summary
    const projectCodes = Object.keys(timesheetData.consolidated_payload);
    const matchedProjects = projectCodes.filter(code => 
      projects.some(p => p.projectCode === code)
    ).length;

    // Separate actual failures from "not found" projects
    const actualFailures = results.filter(r => !r.success && !r.error?.includes('not found in active Xero projects'));
    const notFoundFailures = results.filter(r => !r.success && r.error?.includes('not found in active Xero projects'));

    const summary = {
      entriesProcessed: timesheetData.metadata.entries_processed,
      projectsAnalyzed: projectCodes.length,
      projectsMatched: matchedProjects,
      tasksCreated: results.filter(r => r.action === 'created' && r.success).length,
      tasksUpdated: results.filter(r => r.action === 'updated' && r.success).length,
      tasksFailed: results.filter(r => !r.success).length, // Total failures (for compatibility)
      actualTasksFailed: actualFailures.length, // Actual failures needing attention
      projectsNotFound: notFoundFailures.length, // Informational
      processingTimeMs: Date.now() - startTime
    };


    // Generate report
    const report = generateProcessingReport(timesheetData, results, summary);

    const response: DirectProcessingResult = {
      success: summary.actualTasksFailed === 0,
      summary,
      results,
      downloadableReport: report
    };

    // Final validation logging
    console.log(`[Final Validation] ============ PROCESSING SUMMARY ============`);
    console.log(`[Final Validation] Timesheet entries processed: ${summary.entriesProcessed}`);
    console.log(`[Final Validation] Total projects in timesheet: ${summary.projectsAnalyzed}`);
    console.log(`[Final Validation] Projects matched with IN PROGRESS Xero projects: ${summary.projectsMatched}`);
    console.log(`[Final Validation] Tasks created: ${summary.tasksCreated}`);
    console.log(`[Final Validation] Tasks updated: ${summary.tasksUpdated}`);
    console.log(`[Final Validation] Actual task failures: ${summary.actualTasksFailed}`);
    console.log(`[Final Validation] Projects not found (likely CLOSED): ${summary.projectsNotFound}`);
    
    // Validate successful operations were only for IN PROGRESS projects
    const successfulOperations = results.filter(r => r.success);
    const failedNotFound = results.filter(r => !r.success && r.error?.includes('not found in active Xero projects'));
    
    console.log(`[Final Validation] ✅ Successful operations: ${successfulOperations.length} (only for IN PROGRESS projects)`);
    console.log(`[Final Validation] ℹ️  Not found operations: ${failedNotFound.length} (expected for CLOSED projects)`);
    
    if (summary.actualTasksFailed === 0) {
      console.log(`[Final Validation] ✅ SUCCESS: No actual failures - all operations completed successfully`);
    } else {
      console.log(`[Final Validation] ⚠️  WARNING: ${summary.actualTasksFailed} actual failures need attention`);
    }
    
    console.log(`[Final Validation] ================================================`);

    console.log('[Stats] Complete - Created:', summary.tasksCreated, 'Updated:', summary.tasksUpdated, 'Failed:', summary.actualTasksFailed);

    return NextResponse.json(response);
    */ // END OF COMMENTED OUT Xero processing

  } catch (error: any) {
    console.error('[API Error]:', error.message || error);
    
    // Check if it's the text length error
    if (error.message?.includes('too large') || error.message?.includes('32767')) {
      return NextResponse.json({
        success: false,
        error: 'The timesheet contains too much data to process in a single request. Please try processing a smaller date range or fewer projects.',
        details: error.message,
        summary: {
          entriesProcessed: 0,
          projectsAnalyzed: 0,
          projectsMatched: 0,
          tasksCreated: 0,
          tasksUpdated: 0,
          tasksFailed: 0,
          actualTasksFailed: 0,
          projectsNotFound: 0,
          processingTimeMs: Date.now() - startTime
        },
        results: []
      }, { status: 413 }); // 413 Payload Too Large
    }

    return NextResponse.json({
      success: false,
      error: error.message || 'Processing failed',
      summary: {
        entriesProcessed: 0,
        projectsAnalyzed: 0,
        projectsMatched: 0,
        tasksCreated: 0,
        tasksUpdated: 0,
        tasksFailed: 0,
        actualTasksFailed: 0,
        projectsNotFound: 0,
        processingTimeMs: Date.now() - startTime
      },
      results: []
    }, { status: 500 });
  }
} 