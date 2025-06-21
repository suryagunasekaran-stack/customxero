import { NextRequest, NextResponse } from 'next/server';
import { ensureValidToken } from '@/lib/ensureXeroToken';
import { trackXeroApiCall } from '@/lib/xeroApiTracker';
import { SmartRateLimit } from '@/lib/smartRateLimit';

interface ConsolidatedTask {
  name: string;
  rate: {
    currency: string;
    value: number;
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
    value: number;
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
    processingTimeMs: number;
  };
  results: TaskUpdateResult[];
  downloadableReport: {
    filename: string;
    content: string;
  };
  error?: string;
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
async function processTimesheetWithPython(file: File): Promise<ProcessedTimesheet> {
  const formData = new FormData();
  formData.append('file', file);

  const flaskUrl = `${process.env.NEXT_PUBLIC_FLASK_SERVER_URL}/api/process-timesheet`;
  const response = await fetch(flaskUrl, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(errorData.error || `Python backend error: ${response.status}`);
  }

  const data = await response.json();
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

  await trackXeroApiCall(response.headers, tenantId);
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

  await trackXeroApiCall(orgResponse.headers, tenantId);
  
  let tenantName = 'Unknown';
  if (orgResponse.ok) {
    const orgData = await orgResponse.json();
    tenantName = orgData.Organisations?.[0]?.Name || 'Unknown';
  }

  return {
    projects: data.items || [],
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

  await trackXeroApiCall(response.headers, tenantId);
  SmartRateLimit.updateFromHeaders(response.headers);

  if (!response.ok) {
    throw new Error(`Failed to fetch tasks for project ${projectId}: ${response.status}`);
  }

  const data = await response.json();
  return data.items || [];
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
      value: Math.round(task.rate.value) // Ensure integer cents
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

      await trackXeroApiCall(response.headers, tenantId);
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

      await trackXeroApiCall(response.headers, tenantId);
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

  console.log(`[Direct Processing] Processing ${Object.keys(payload).length} project codes`);
  console.log(`[Direct Processing] Available Xero projects: ${projects.length}`);
  console.log(`[Direct Processing] Matching projects: ${Object.keys(payload).filter(code => projectsByCode.has(code)).length}`);

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
      // Get existing tasks for this project
      const existingTasks = await getProjectTasks(project.projectId, accessToken, tenantId);
      const existingTasksMap = new Map(existingTasks.map(task => [task.name.toLowerCase(), task]));

      console.log(`[Direct Processing] Project ${projectCode}: Processing ${tasks.length} tasks, ${existingTasks.length} existing`);

      // Process each task
      for (const task of tasks) {
        const existingTask = existingTasksMap.get(task.name.toLowerCase());
        
        const updateResult = await createOrUpdateTask(
          project.projectId,
          task,
          existingTask || null,
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
            `Updated from ${existingTask.estimateMinutes}min/$${(existingTask.rate.value/100).toFixed(2)} to ${task.estimateMinutes}min/$${(task.rate.value/100).toFixed(2)}` :
            `Created with ${task.estimateMinutes}min/$${(task.rate.value/100).toFixed(2)}`
        });
      }
    } catch (error) {
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
  
  const csvLines = [
    'Project Code,Project Name,Task Name,Action,Status,Details,Error'
  ];
  
  // Add metadata
  csvLines.push(`# Report Generated: ${new Date().toISOString()}`);
  csvLines.push(`# Period: ${timesheetData.metadata.period_range}`);
  csvLines.push(`# Entries Processed: ${timesheetData.metadata.entries_processed}`);
  csvLines.push(`# Projects Analyzed: ${summary.projectsAnalyzed}`);
  csvLines.push(`# Projects Matched: ${summary.projectsMatched}`);
  csvLines.push(`# Tasks Created: ${summary.tasksCreated}`);
  csvLines.push(`# Tasks Updated: ${summary.tasksUpdated}`);
  csvLines.push(`# Tasks Failed: ${summary.tasksFailed}`);
  csvLines.push(`# Processing Time: ${summary.processingTimeMs}ms`);
  csvLines.push('');
  
  // Add results
  results.forEach(result => {
    csvLines.push(
      `"${result.projectCode}","${result.projectName}","${result.taskName}","${result.action}","${result.success ? 'Success' : 'Failed'}","${result.details || 'N/A'}","${result.error || 'N/A'}"`
    );
  });
  
  return { filename, content: csvLines.join('\n') };
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[Direct Processing API] Starting timesheet processing');

  try {
    // Get Xero token
    const { access_token, effective_tenant_id } = await ensureValidToken();
    
    // Get uploaded file
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    console.log('[Direct Processing API] Processing file:', file.name);

    // Step 1: Process timesheet with Python backend
    const timesheetData = await processTimesheetWithPython(file);
    console.log(`[Direct Processing API] Timesheet processed: ${timesheetData.metadata.entries_processed} entries, ${timesheetData.metadata.projects_consolidated} projects`);

    // Step 2: Get active Xero projects
    const { projects, tenantName } = await getActiveXeroProjects(access_token, effective_tenant_id);
    console.log(`[Direct Processing API] Found ${projects.length} active Xero projects for tenant: ${tenantName}`);

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

    const summary = {
      entriesProcessed: timesheetData.metadata.entries_processed,
      projectsAnalyzed: projectCodes.length,
      projectsMatched: matchedProjects,
      tasksCreated: results.filter(r => r.action === 'created' && r.success).length,
      tasksUpdated: results.filter(r => r.action === 'updated' && r.success).length,
      tasksFailed: results.filter(r => !r.success).length,
      processingTimeMs: Date.now() - startTime
    };

    // Generate report
    const report = generateProcessingReport(timesheetData, results, summary);

    const response: DirectProcessingResult = {
      success: summary.tasksFailed === 0,
      summary,
      results,
      downloadableReport: report
    };

    console.log('[Direct Processing API] Processing complete:', summary);

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('[Direct Processing API] Error:', error);
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
        processingTimeMs: Date.now() - startTime
      },
      results: []
    }, { status: 500 });
  }
} 