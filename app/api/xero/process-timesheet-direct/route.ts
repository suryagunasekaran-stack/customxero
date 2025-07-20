import { NextRequest, NextResponse } from 'next/server';
import { ensureValidToken } from '@/lib/ensureXeroToken';
import { trackXeroApiCall } from '@/lib/xeroApiTracker';
import { SmartRateLimit } from '@/lib/smartRateLimit';
import { auth } from '@/lib/auth';

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

interface ProcessedTimesheet {
  success: boolean;
  metadata: {
    creation_date: string;
    period_range: string;
    entries_processed: number;
    projects_consolidated: number;
  };
  consolidated_payload: ConsolidatedPayload;
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
    const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(errorData.error || `Python backend error: ${response.status}`);
  }

  const data = await response.json();
  
  // Temporary: Handle empty response from backend during development
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
  
  if (!data.success) {
    throw new Error(data.error || 'Timesheet processing failed');
  }

  return data;
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
  SmartRateLimit.updateFromHeaders(response.headers);

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
  await SmartRateLimit.waitIfNeeded();
  
  const response = await fetch(`https://api.xero.com/projects.xro/2.0/projects/${projectId}/tasks`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Xero-Tenant-Id': tenantId,
      'Accept': 'application/json'
    }
  });

  await trackXeroApiCall(tenantId);
  SmartRateLimit.updateFromHeaders(response.headers);

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
  await SmartRateLimit.waitIfNeeded();

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
      SmartRateLimit.updateFromHeaders(response.headers);

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
      SmartRateLimit.updateFromHeaders(response.headers);

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

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[API] Starting timesheet processing');

  // Get authentication and tenant info
  const session = await auth();
  const { access_token, effective_tenant_id, available_tenants } = await ensureValidToken();
  const selectedTenant = available_tenants?.find(t => t.tenantId === effective_tenant_id);

  try {
    // Get JSON payload
    const contentType = request.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return NextResponse.json({ error: 'Request must be JSON' }, { status: 400 });
    }
    
    const body = await request.json();
    const { blobUrl, fileName, tenantId } = body;
    
    if (!blobUrl || !fileName || !tenantId) {
      return NextResponse.json({ error: 'blobUrl, fileName, and tenantId are required' }, { status: 400 });
    }

    console.log('[API] Processing file:', fileName);

    // Step 1: Process timesheet with Python backend
    const timesheetData = await processTimesheetWithPython(blobUrl, fileName, tenantId);
    console.log(`[Stats] Processed: ${timesheetData.metadata.entries_processed} entries, ${timesheetData.metadata.projects_consolidated} projects`);

    // Return simple success response - no Xero processing
    return NextResponse.json({
      success: true,
      metadata: timesheetData.metadata,
      summary: {
        entriesProcessed: timesheetData.metadata.entries_processed,
        projectsAnalyzed: timesheetData.metadata.projects_consolidated,
        projectsMatched: 0,
        tasksCreated: 0,
        tasksUpdated: 0,
        tasksFailed: 0,
        actualTasksFailed: 0,
        projectsNotFound: 0,
        processingTimeMs: Date.now() - startTime
      },
      results: [],
      downloadableReport: {
        filename: 'processing-results.csv',
        content: ''
      }
    });

    /* COMMENTED OUT - Xero processing
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