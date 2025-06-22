import { NextRequest, NextResponse } from 'next/server';
import { ensureValidToken } from '@/lib/ensureXeroToken';
import { trackXeroApiCall } from '@/lib/xeroApiTracker';
import { SmartRateLimit } from '@/lib/smartRateLimit';
import { AuditLogger } from '@/lib/auditLogger';
import { auth } from '@/lib/auth';

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
function extractProjectCode(projectName: string): string {
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

  // Extract project codes from project names
  const projects = (data.items || []).map((project: any) => {
    const extractedCode = extractProjectCode(project.name);
    console.log(`[Project Code Extraction] "${project.name}" -> "${extractedCode}"`);
    return {
      ...project,
      projectCode: extractedCode
    };
  });

  console.log(`[Direct Processing] Successfully extracted project codes for ${projects.length} projects`);

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

  // Enhanced debugging for payload inspection
  const payloadProjectCodes = Object.keys(payload);
  console.log(`[Direct Processing] 🔍 PAYLOAD INSPECTION:`);
  console.log(`[Direct Processing] Project codes in payload: [${payloadProjectCodes.join(', ')}]`);

  // Comprehensive payload debugging
  function debugPayloadStructure(payload: ConsolidatedPayload, projects: XeroProject[]) {
    console.log(`\n[DEBUG] 📋 COMPREHENSIVE PAYLOAD DEBUG:`);
    console.log(`[DEBUG] Total project codes in payload: ${Object.keys(payload).length}`);
    console.log(`[DEBUG] Total active Xero projects: ${projects.length}`);
    
    // Check for exact matches
    const exactMatches = Object.keys(payload).filter(code => 
      projects.some(p => p.projectCode === code)
    );
    console.log(`[DEBUG] Exact matches: ${exactMatches.length} [${exactMatches.slice(0, 10).join(', ')}${exactMatches.length > 10 ? '...' : ''}]`);
    
    // Check for potential partial matches
    const unmatchedPayloadCodes = Object.keys(payload).filter(code => 
      !projects.some(p => p.projectCode === code)
    );
    console.log(`[DEBUG] Unmatched payload codes: ${unmatchedPayloadCodes.length}`);
    
    // Sample payload projects for debugging
    console.log(`[DEBUG] Sample payload projects (first 10):`);
    Object.entries(payload).slice(0, 10).forEach(([code, tasks]) => {
      console.log(`[DEBUG]   ${code}: ${tasks.length} tasks [${tasks.map(t => t.name).join(', ')}]`);
    });
    
    // Sample Xero projects for comparison
    console.log(`[DEBUG] Sample Xero projects (first 10):`);
    projects.slice(0, 10).forEach(p => {
      console.log(`[DEBUG]   ${p.projectCode}: "${p.name}" (${p.status})`);
    });
  }

  debugPayloadStructure(payload, projects);

  // Check for specific project codes that might be problematic
  const problemProjectCodes = payloadProjectCodes.filter(code => 
    code.includes('NY250388') || code.includes('USS SAVANNAH') || code.includes('LCS')
  );
  if (problemProjectCodes.length > 0) {
    console.log(`[Direct Processing] 🎯 FOUND POTENTIAL DEMO PROJECT: ${problemProjectCodes.join(', ')}`);
    problemProjectCodes.forEach(code => {
      const tasks = payload[code];
      console.log(`[Direct Processing] Project ${code} has ${tasks.length} tasks:`, tasks.map(t => t.name));
      console.log(`[Direct Processing] Project ${code} tasks details:`, tasks.map(t => ({
        name: t.name,
        estimateMinutes: t.estimateMinutes,
        rate: t.rate.value,
        idempotencyKey: t.idempotencyKey
      })));
    });
  }
  
  // Log first few available Xero projects for debugging
  console.log(`[Direct Processing] 📋 Available Xero projects (first 10):`, 
    projects.slice(0, 10).map(p => ({ code: p.projectCode, name: p.name, status: p.status }))
  );
  
  // Check if any Xero projects contain the demo project
  const demoProjectsInXero = projects.filter(p => 
    p.name.includes('USS SAVANNAH') || p.projectCode?.includes('NY250388') || p.name.includes('LCS')
  );
  if (demoProjectsInXero.length > 0) {
    console.log(`[Direct Processing] 🎯 FOUND DEMO PROJECTS IN XERO:`, demoProjectsInXero.map(p => ({
      code: p.projectCode,
      name: p.name,
      status: p.status,
      id: p.projectId
    })));
  }

  // Enhanced debugging: Show all extracted project codes
  console.log(`[Direct Processing] 🔍 ALL EXTRACTED PROJECT CODES:`, 
    projects.map(p => `"${p.projectCode}" from "${p.name}"`).slice(0, 10)
  );

  // Process each project in the payload
  for (const [projectCode, tasks] of Object.entries(payload)) {
    const project = projectsByCode.get(projectCode);
    
    // Enhanced logging for project matching
    console.log(`[Direct Processing] Processing project code: ${projectCode}`);
    
    if (!project) {
      // Enhanced logging for not found projects
      console.log(`[Direct Processing] ❌ Project ${projectCode} not found in active Xero projects`);
      
      // Check if this might be a partial match issue
      const possibleMatches = projects.filter(p => 
        p.name.toLowerCase().includes(projectCode.toLowerCase()) ||
        p.projectCode?.toLowerCase().includes(projectCode.toLowerCase()) ||
        projectCode.toLowerCase().includes(p.projectCode?.toLowerCase() || '')
      );
      
      if (possibleMatches.length > 0) {
        console.log(`[Direct Processing] 🔍 Possible matches for ${projectCode}:`, 
          possibleMatches.map(p => ({ code: p.projectCode, name: p.name, status: p.status }))
        );
      }
      
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

    // Enhanced logging for found projects
    console.log(`[Direct Processing] ✅ Found project ${projectCode} -> ${project.name} (${project.status})`);

    try {
      // Get existing tasks for this project
      const existingTasks = await getProjectTasks(project.projectId, accessToken, tenantId);
      const existingTasksMap = new Map(existingTasks.map(task => [task.name.toLowerCase(), task]));

      console.log(`[Direct Processing] Project ${projectCode}: Processing ${tasks.length} tasks, ${existingTasks.length} existing`);
      
      // Log existing tasks for debugging
      if (existingTasks.length > 0) {
        console.log(`[Direct Processing] Existing tasks in ${projectCode}: [${existingTasks.map(t => t.name).join(', ')}]`);
      }

      // Process each task
      for (const task of tasks) {
        const existingTask = existingTasksMap.get(task.name.toLowerCase());
        
        console.log(`[Direct Processing] Processing task "${task.name}" for project ${projectCode}`);
        console.log(`[Direct Processing] Task details:`, {
          estimateMinutes: task.estimateMinutes,
          rate: task.rate.value,
          existingTask: existingTask ? 'Found' : 'Not Found'
        });
        
        const updateResult = await createOrUpdateTask(
          project.projectId,
          task,
          existingTask || null,
          accessToken,
          tenantId,
          currency
        );

        console.log(`[Direct Processing] Task "${task.name}" result:`, updateResult);

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
      console.error(`[Direct Processing] Error processing project ${projectCode}:`, error);
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

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[Direct Processing API] Starting timesheet processing');

  // Initialize audit logger
  const session = await auth();
  const { access_token, effective_tenant_id, available_tenants } = await ensureValidToken();
  const selectedTenant = available_tenants?.find(t => t.tenantId === effective_tenant_id);
  const auditLogger = new AuditLogger(session, effective_tenant_id, selectedTenant?.tenantName);

  // Enhanced tenant debugging
  console.log(`[Direct Processing API] 🏢 COMPREHENSIVE TENANT DEBUG:`);
  console.log(`[Direct Processing API] User email:`, session?.user?.email);
  console.log(`[Direct Processing API] Session tenant ID:`, session?.tenantId);
  console.log(`[Direct Processing API] Effective tenant ID (from ensureValidToken):`, effective_tenant_id);
  console.log(`[Direct Processing API] Selected tenant from available_tenants:`, selectedTenant);
  console.log(`[Direct Processing API] Available tenants:`, available_tenants?.map(t => ({ id: t.tenantId, name: t.tenantName })));
  
  // Verify which tenant's data we'll actually fetch
  console.log(`[Direct Processing API] 🎯 WILL FETCH DATA FROM TENANT:`, effective_tenant_id);
  console.log(`[Direct Processing API] 🎯 TENANT NAME WILL BE:`, selectedTenant?.tenantName || 'Unknown');

  let processingLogId: string | null = null;

  try {
    // Get uploaded file
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      await auditLogger.logFailure('TIMESHEET_UPLOAD', 'No file uploaded', { step: 'file_validation' }, request);
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    console.log('[Direct Processing API] Processing file:', file.name);

    // Log file upload
    await auditLogger.logSuccess('TIMESHEET_UPLOAD', {
      filename: file.name,
      fileSize: file.size,
      fileType: file.type
    }, request);

    // Step 1: Process timesheet with Python backend
    processingLogId = await auditLogger.startAction('TIMESHEET_PROCESS', {
      filename: file.name,
      step: 'python_processing'
    }, request);

    const timesheetData = await processTimesheetWithPython(file);
    console.log(`[Direct Processing API] Timesheet processed: ${timesheetData.metadata.entries_processed} entries, ${timesheetData.metadata.projects_consolidated} projects`);

    // Update log with processing results
    if (processingLogId) {
      await auditLogger.completeAction(processingLogId, 'SUCCESS', {
        entriesProcessed: timesheetData.metadata.entries_processed,
        projectsConsolidated: timesheetData.metadata.projects_consolidated,
        periodRange: timesheetData.metadata.period_range
      });
    }

    // Step 2: Get active Xero projects and verify tenant
    const { projects, tenantName } = await getActiveXeroProjects(access_token, effective_tenant_id);
    console.log(`[Direct Processing API] Found ${projects.length} active Xero projects for tenant: ${tenantName}`);

    // Enhanced tenant verification debugging
    console.log(`[Direct Processing API] 🔍 TENANT VERIFICATION:`);
    console.log(`[Direct Processing API] Xero Organization API returned tenantName: "${tenantName}"`);
    console.log(`[Direct Processing API] Selected tenant from session: "${selectedTenant?.tenantName}"`);
    console.log(`[Direct Processing API] Effective tenant ID: "${effective_tenant_id}"`);
    console.log(`[Direct Processing API] Tenant config will use: tenantId="${effective_tenant_id}", tenantName="${tenantName}"`);

    // Show what the tenant config logic will return
    const debugConfig = getTaskConfigForTenant(effective_tenant_id, tenantName);
    console.log(`[Direct Processing API] Tenant config currency: ${debugConfig.currency}`);

    // Verify we have a valid tenant before proceeding
    if (!tenantName || tenantName === 'Unknown') {
      await auditLogger.logFailure('PROJECT_UPDATE', 'Unable to verify tenant name from Xero', {
        tenantId: effective_tenant_id,
        projectsFound: projects.length
      }, request);
      
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

    // Log tenant verification
    await auditLogger.logSuccess('PROJECT_UPDATE', {
      tenantVerified: tenantName,
      projectsAvailable: projects.length,
      step: 'tenant_verification'
    }, request);

    // Step 3: Get tenant configuration
    const config = getTaskConfigForTenant(effective_tenant_id, tenantName);

    // Step 4: Batch update Xero tasks
    const updateLogId = await auditLogger.startAction('PROJECT_UPDATE', {
      projectCount: Object.keys(timesheetData.consolidated_payload).length,
      xeroProjectsAvailable: projects.length
    }, request);

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

    // Complete update log
    if (updateLogId) {
      await auditLogger.completeAction(
        updateLogId, 
        summary.actualTasksFailed === 0 ? 'SUCCESS' : 'FAILURE',
        {
          summary,
          tasksProcessed: results.length,
          actualFailures: results.filter(r => !r.success && !r.error?.includes('not found in active Xero projects')).map(r => ({
            project: r.projectCode,
            task: r.taskName,
            error: r.error
          })),
          projectsNotFound: results.filter(r => !r.success && r.error?.includes('not found in active Xero projects')).map(r => ({
            project: r.projectCode,
            task: r.taskName,
            reason: 'Project likely moved to CLOSED/COMPLETED status'
          }))
        },
        summary.actualTasksFailed > 0 ? `${summary.actualTasksFailed} tasks failed` : undefined,
        Date.now() - startTime
      );
    }

    // Generate report
    const report = generateProcessingReport(timesheetData, results, summary);

    const response: DirectProcessingResult = {
      success: summary.actualTasksFailed === 0,
      summary,
      results,
      downloadableReport: report
    };

    console.log('[Direct Processing API] Processing complete:', summary);

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('[Direct Processing API] Error:', error);
    
    // Log the failure
    await auditLogger.logFailure(
      'TIMESHEET_PROCESS',
      error,
      {
        step: 'processing_error',
        executionTimeMs: Date.now() - startTime
      },
      request
    );

    // If we have a processing log ID that wasn't completed, complete it as failure
    if (processingLogId) {
      await auditLogger.completeAction(
        processingLogId,
        'FAILURE',
        { error: error.message },
        error.message || 'Processing failed',
        Date.now() - startTime
      );
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