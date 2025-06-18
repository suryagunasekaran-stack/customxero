import { NextRequest, NextResponse } from 'next/server';
import { XeroProjectService } from '@/lib/xeroProjectService';
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

interface ProcessingResults {
  success: boolean;
  message?: string;
  metadata: {
    creation_date: string;
    period_range: string;
    entries_processed: number;
    entries_grouped: number;
    projects_consolidated: number;
    total_category_entries: number;
  };
  consolidated_payload: ConsolidatedPayload;
  job_summaries?: any[];
  statistics?: any;
  error?: string;
}

interface TaskCreationResult {
  projectId: string;
  projectName: string;
  taskName: string;
  success: boolean;
  error?: string;
  idempotencyKey?: string;
}

interface TaskUpdateResult {
  projectCode: string;
  projectId: string;
  projectName: string;
  taskName: string;
  success: boolean;
  previousEstimate?: number;
  newEstimate: number;
  previousRate?: number;
  newRate: number;
  error?: string;
}

interface UnifiedProcessingResult {
  success: boolean;
  timesheetProcessing: ProcessingResults;
  projectStandardization: {
    projectsAnalyzed: number;
    projectsNeedingTasks: number;
    tasksCreated: number;
    taskCreationResults: TaskCreationResult[];
  };
  taskUpdates: {
    projectsProcessed: number;
    tasksUpdated: number;
    tasksFailed: number;
    updateResults: TaskUpdateResult[];
  };
  downloadableReport: {
    filename: string;
    content: string;
  };
  statistics: {
    totalApiCalls: number;
    processingTimeMs: number;
    cacheHits: number;
  };
}

const REQUIRED_TASKS = ['Manhour', 'Overtime', 'Supply Labour', 'Transport'];

// Get appropriate task configuration based on tenant
function getTaskConfigForTenant(tenantId: string, tenantName: string) {
  // Demo Company (Global) uses USD
  if (tenantId === "017d3bc6-65b9-4588-9746-acb7167a59f1" || tenantName.includes("Demo Company")) {
    return {
      rate: { currency: "USD", value: 1 },
      chargeType: "FIXED",
      estimateMinutes: 1
    };
  }
  
  // BS E&I SERVICE PTE. LTD uses SGD
  if (tenantId === "6dd39ea4-e6a6-4993-a37a-21482ccf8d22" || tenantName.includes("BS E&I SERVICE")) {
    return {
      rate: { currency: "SGD", value: 1 },
      chargeType: "FIXED",
      estimateMinutes: 1
    };
  }
  
  // Default configuration (USD)
  return {
    rate: { currency: "USD", value: 1 },
    chargeType: "FIXED",
    estimateMinutes: 1
  };
}

async function processTimesheetFile(file: File): Promise<ProcessingResults> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('http://127.0.0.1:5001/api/process-timesheet', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(errorData.error || `Server responded with ${response.status}`);
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Processing failed');
  }

  return data;
}

async function ensureRequiredTasks(
  projectData: any,
  consolidatedPayload: ConsolidatedPayload,
  tenantId: string,
  tenantName: string,
  accessToken: string
): Promise<TaskCreationResult[]> {
  const results: TaskCreationResult[] = [];
  const projectCodesToProcess = Object.keys(consolidatedPayload);
  
  // Check which projects need tasks
  const projectsNeedingTasks: any[] = [];
  
  for (const projectCode of projectCodesToProcess) {
    const codeData = projectData.projectCodes[projectCode];
    if (!codeData) continue;
    
    for (const project of codeData.projects) {
      const projectTasks = projectData.projectTasks[project.projectId] || [];
      const taskNames = projectTasks.map((t: any) => t.name);
      const missingTasks = REQUIRED_TASKS.filter(task => !taskNames.includes(task));
      
      if (missingTasks.length > 0) {
        projectsNeedingTasks.push({
          projectId: project.projectId,
          projectName: project.name,
          projectCode,
          missingTasks
        });
      }
    }
  }
  
  // Batch create missing tasks
  const taskConfig = getTaskConfigForTenant(tenantId, tenantName);
  const timestamp = new Date().toISOString().split('T')[0];
  
  for (const project of projectsNeedingTasks) {
    for (const taskName of project.missingTasks) {
      try {
        await SmartRateLimit.waitIfNeeded();
        
        const runTimestamp = Date.now();
        const idempotencyKey = `standardize-${project.projectId}-${taskName.replace(/\s+/g, '-').toLowerCase()}-${timestamp}-${runTimestamp}`;
        
        const taskPayload = {
          name: taskName,
          ...taskConfig
        };
        
        // COMMENTED OUT: POST request to Xero for task creation
        // const response = await fetch(`https://api.xero.com/projects.xro/2.0/projects/${project.projectId}/tasks`, {
        //   method: 'POST',
        //   headers: {
        //     'Authorization': `Bearer ${accessToken}`,
        //     'Xero-Tenant-Id': tenantId,
        //     'Accept': 'application/json',
        //     'Content-Type': 'application/json',
        //     'Idempotency-Key': idempotencyKey
        //   },
        //   body: JSON.stringify(taskPayload)
        // });

        // await trackXeroApiCall(response.headers, tenantId);
        // SmartRateLimit.updateFromHeaders(response.headers);
        
        // Simulated delay for realistic task creation processing time
        await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1200)); // 0.8-2 second delay
        
        // Simulated success response for testing
        const response = { ok: true, status: 200 };
        
        if (response.ok) {
          results.push({
            projectId: project.projectId,
            projectName: project.projectName,
            taskName,
            success: true,
            idempotencyKey
          });
        } else {
          // const errorText = await response.text();
          results.push({
            projectId: project.projectId,
            projectName: project.projectName,
            taskName,
            success: false,
            error: `HTTP ${response.status}: Simulated error`,
            idempotencyKey
          });
        }
        
      } catch (error) {
        results.push({
          projectId: project.projectId,
          projectName: project.projectName,
          taskName,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }
  
  // Clear cache to ensure fresh data for updates
  if (results.filter(r => r.success).length > 0) {
    XeroProjectService.clearCache(tenantId);
  }
  
  return results;
}

async function executeTimesheetUpdates(
  timesheetData: ProcessingResults,
  projectData: any,
  tenantId: string,
  accessToken: string
): Promise<TaskUpdateResult[]> {
  const results: TaskUpdateResult[] = [];
  const consolidatedPayload = timesheetData.consolidated_payload;
  
  for (const [projectCode, tasks] of Object.entries(consolidatedPayload)) {
    const codeData = projectData.projectCodes[projectCode];
    if (!codeData || codeData.projects.length === 0) {
      console.log(`[Update] No matching projects for code: ${projectCode}`);
      continue;
    }
    
    // Use the first project with this code
    const project = codeData.projects[0];
    const projectTasks = projectData.projectTasks[project.projectId] || [];
    
    for (const consolidatedTask of tasks) {
      const xeroTask = projectTasks.find((t: any) => t.name === consolidatedTask.name);
      
      if (!xeroTask) {
        results.push({
          projectCode,
          projectId: project.projectId,
          projectName: project.name,
          taskName: consolidatedTask.name,
          success: false,
          newEstimate: consolidatedTask.estimateMinutes,
          newRate: consolidatedTask.rate.value,
          error: 'Task not found in project'
        });
        continue;
      }
      
      // Check if update is needed
      const currentEstimate = xeroTask.estimateMinutes || 0;
      const currentRate = xeroTask.rate?.value || 0;
      
      if (currentEstimate === consolidatedTask.estimateMinutes && currentRate === consolidatedTask.rate.value) {
        results.push({
          projectCode,
          projectId: project.projectId,
          projectName: project.name,
          taskName: consolidatedTask.name,
          success: true,
          previousEstimate: currentEstimate,
          newEstimate: consolidatedTask.estimateMinutes,
          previousRate: currentRate,
          newRate: consolidatedTask.rate.value,
          error: 'No update needed - values unchanged'
        });
        continue;
      }
      
      // Perform update
      try {
        await SmartRateLimit.waitIfNeeded();
        
        const updatePayload = {
          name: xeroTask.name,
          rate: consolidatedTask.rate,
          chargeType: consolidatedTask.chargeType,
          estimateMinutes: consolidatedTask.estimateMinutes
        };
        
        // COMMENTED OUT: PUT request to Xero for task updates
        // const response = await fetch(`https://api.xero.com/projects.xro/2.0/projects/${project.projectId}/tasks/${xeroTask.taskId}`, {
        //   method: 'PUT',
        //   headers: {
        //     'Authorization': `Bearer ${accessToken}`,
        //     'Xero-Tenant-Id': tenantId,
        //     'Accept': 'application/json',
        //     'Content-Type': 'application/json'
        //   },
        //   body: JSON.stringify(updatePayload)
        // });

        // await trackXeroApiCall(response.headers, tenantId);
        // SmartRateLimit.updateFromHeaders(response.headers);
        
        // Simulated delay for realistic task update processing time
        await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 800)); // 0.6-1.4 second delay
        
        // Simulated success response for testing
        const response = { ok: true, status: 200 };
        
        if (response.ok) {
          results.push({
            projectCode,
            projectId: project.projectId,
            projectName: project.name,
            taskName: consolidatedTask.name,
            success: true,
            previousEstimate: currentEstimate,
            newEstimate: consolidatedTask.estimateMinutes,
            previousRate: currentRate,
            newRate: consolidatedTask.rate.value
          });
        } else {
          // const errorText = await response.text();
          results.push({
            projectCode,
            projectId: project.projectId,
            projectName: project.name,
            taskName: consolidatedTask.name,
            success: false,
            previousEstimate: currentEstimate,
            newEstimate: consolidatedTask.estimateMinutes,
            previousRate: currentRate,
            newRate: consolidatedTask.rate.value,
            error: `HTTP ${response.status}: Simulated error`
          });
        }
        
      } catch (error) {
        results.push({
          projectCode,
          projectId: project.projectId,
          projectName: project.name,
          taskName: consolidatedTask.name,
          success: false,
          newEstimate: consolidatedTask.estimateMinutes,
          newRate: consolidatedTask.rate.value,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }
  
  return results;
}

function generateComprehensiveReport(
  timesheetData: ProcessingResults,
  taskCreationResults: TaskCreationResult[],
  updateResults: TaskUpdateResult[]
): { filename: string; content: string } {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const filename = `unified-processing-report-${timestamp}.csv`;
  
  const csvLines = [
    'Section,Project Code,Project Name,Task Name,Action,Status,Previous Value,New Value,Details'
  ];
  
  // Add metadata
  csvLines.push(`# Report Generated: ${new Date().toISOString()}`);
  csvLines.push(`# Period: ${timesheetData.metadata.period_range}`);
  csvLines.push(`# Timesheet Entries Processed: ${timesheetData.metadata.entries_processed}`);
  csvLines.push(`# Projects Consolidated: ${timesheetData.metadata.projects_consolidated}`);
  csvLines.push(`# Tasks Created: ${taskCreationResults.filter(r => r.success).length}`);
  csvLines.push(`# Tasks Updated: ${updateResults.filter(r => r.success && !r.error?.includes('unchanged')).length}`);
  csvLines.push('');
  
  // Task Creation Section
  if (taskCreationResults.length > 0) {
    csvLines.push('# TASK CREATION');
    taskCreationResults.forEach(result => {
      csvLines.push(`"Task Creation","N/A","${result.projectName}","${result.taskName}","Create","${result.success ? 'Success' : 'Failed'}","N/A","Created","${result.error || 'Task created successfully'}"`);
    });
    csvLines.push('');
  }
  
  // Task Updates Section
  csvLines.push('# TASK UPDATES');
  updateResults.forEach(result => {
    const status = result.success ? (result.error?.includes('unchanged') ? 'Unchanged' : 'Updated') : 'Failed';
    const prevValue = result.previousEstimate !== undefined ? `${result.previousEstimate} min @ $${(result.previousRate || 0) / 100}` : 'N/A';
    const newValue = `${result.newEstimate} min @ $${result.newRate / 100}`;
    csvLines.push(`"Task Update","${result.projectCode}","${result.projectName}","${result.taskName}","Update","${status}","${prevValue}","${newValue}","${result.error || 'Updated successfully'}"`);
  });
  
  return { filename, content: csvLines.join('\n') };
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let apiCallsStart = 0;
  let cacheHits = 0;
  
  try {
    const { access_token, effective_tenant_id } = await ensureValidToken();
    
    // Get form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    
    // Validate file type
    if (!file.name.toLowerCase().endsWith('.xlsx') && !file.name.toLowerCase().endsWith('.xls')) {
      return NextResponse.json({ error: 'Invalid file format. Please upload an Excel file (.xlsx or .xls).' }, { status: 400 });
    }
    
    console.log(`[Unified Processing] Starting processing for file: ${file.name}`);
    
    // Step 1: Process timesheet through Flask API
    console.log('[Unified Processing] Step 1: Processing timesheet file...');
    const timesheetData = await processTimesheetFile(file);
    console.log(`[Unified Processing] Timesheet processed: ${timesheetData.metadata.entries_processed} entries, ${timesheetData.metadata.projects_consolidated} projects`);
    
    // Step 2: Get project data (validate tenant and force fresh data for comparison)
    console.log('[Unified Processing] Step 2: Fetching project data...');
    // ALWAYS force fresh data for timesheet processing to ensure we have correct tenant data
    const projectDataBefore = await XeroProjectService.getProjectData(true);
    console.log(`[Unified Processing] Project data fetched for tenant: ${projectDataBefore.tenantName} (${projectDataBefore.tenantId})`);
    
    // Validate we have the correct tenant data
    if (projectDataBefore.tenantId !== effective_tenant_id) {
      console.warn(`[Unified Processing] Tenant mismatch! Expected: ${effective_tenant_id}, Got: ${projectDataBefore.tenantId}`);
      // Clear cache and fetch again
      XeroProjectService.clearCache();
      const projectDataRefresh = await XeroProjectService.getProjectData(true);
      console.log(`[Unified Processing] Refreshed project data for tenant: ${projectDataRefresh.tenantName}`);
    }
    
    // Get tenant info for task configuration
    const currentTenant = projectDataBefore.tenantName;
    
    // Track API calls
    apiCallsStart = SmartRateLimit.getRemainingCalls();
    
    // Step 3: Ensure all projects have required tasks
    console.log('[Unified Processing] Step 3: Ensuring required tasks exist...');
    const taskCreationResults = await ensureRequiredTasks(
      projectDataBefore,
      timesheetData.consolidated_payload,
      effective_tenant_id,
      currentTenant,
      access_token
    );
    
    const tasksCreated = taskCreationResults.filter(r => r.success).length;
    console.log(`[Unified Processing] Created ${tasksCreated} missing tasks`);
    
    // Step 4: Get fresh project data if tasks were created
    const projectData = tasksCreated > 0 
      ? await XeroProjectService.getProjectData(true) // Force refresh
      : projectDataBefore;
    
    // Step 5: Execute timesheet updates
    console.log('[Unified Processing] Step 4: Executing timesheet updates...');
    const updateResults = await executeTimesheetUpdates(
      timesheetData,
      projectData,
      effective_tenant_id,
      access_token
    );
    
    const successfulUpdates = updateResults.filter(r => r.success && !r.error?.includes('unchanged')).length;
    console.log(`[Unified Processing] Successfully updated ${successfulUpdates} tasks`);
    
    // Calculate statistics
    const totalApiCalls = apiCallsStart - SmartRateLimit.getRemainingCalls();
    const processingTimeMs = Date.now() - startTime;
    
    // Generate comprehensive report
    const report = generateComprehensiveReport(timesheetData, taskCreationResults, updateResults);
    
    // Build response
    const result: UnifiedProcessingResult = {
      success: true,
      timesheetProcessing: timesheetData,
      projectStandardization: {
        projectsAnalyzed: Object.keys(timesheetData.consolidated_payload).length,
        projectsNeedingTasks: new Set(taskCreationResults.map(r => r.projectId)).size,
        tasksCreated: tasksCreated,
        taskCreationResults
      },
      taskUpdates: {
        projectsProcessed: new Set(updateResults.map(r => r.projectCode)).size,
        tasksUpdated: successfulUpdates,
        tasksFailed: updateResults.filter(r => !r.success).length,
        updateResults
      },
      downloadableReport: report,
      statistics: {
        totalApiCalls,
        processingTimeMs,
        cacheHits
      }
    };
    
    console.log(`[Unified Processing] Complete! Processed in ${processingTimeMs}ms with ${totalApiCalls} API calls`);
    
    return NextResponse.json(result);
    
  } catch (error: any) {
    console.error('[Unified Processing] Error:', error);
    return NextResponse.json({ 
      error: error.message || 'An error occurred during processing',
      details: error.stack
    }, { status: 500 });
  }
} 