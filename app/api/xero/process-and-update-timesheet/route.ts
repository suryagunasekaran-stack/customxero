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

// Convert rate value to cents, handling various input formats and floating point errors
function convertRateToCents(rateValue: number): number {
  // Handle different possible formats:
  // 1. Already in cents (e.g., 8789 for $87.89)
  // 2. In dollars (e.g., 87.89 for $87.89)
  // 3. Floating point errors (e.g., 878911 instead of 8789)
  
  let cents: number;
  
  if (rateValue >= 100000) {
    // Very large number, likely floating point error in cents
    // Try to detect if it's 100x too large (common floating point issue)
    cents = Math.round(rateValue / 100);
  } else if (rateValue >= 1000) {
    // Likely already in cents
    cents = Math.round(rateValue);
  } else {
    // Likely in dollars, convert to cents
    cents = Math.round(rateValue * 100);
  }
  
  return cents;
}



async function createAndUpdateTasks(
  consolidatedPayload: ConsolidatedPayload,
  projectData: any,
  tenantId: string,
  tenantName: string,
  accessToken: string
): Promise<TaskCreationResult[]> {
  const results: TaskCreationResult[] = [];
  const projectCodesToProcess = Object.keys(consolidatedPayload);
  const baseTaskConfig = getTaskConfigForTenant(tenantId, tenantName);
  
  for (const projectCode of projectCodesToProcess) {
    const codeData = projectData.projectCodes[projectCode];
    if (!codeData || !Array.isArray(codeData)) continue;
    
    const timesheetTasks = consolidatedPayload[projectCode];
    
    // Process each project that has this code
    for (const project of codeData) {
      
      try {
        // Step 1: Fetch existing tasks for this project
        await SmartRateLimit.waitIfNeeded();
        const tasksResponse = await fetch(`https://api.xero.com/projects.xro/2.0/projects/${project.projectId}/tasks`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Xero-Tenant-Id': tenantId,
            'Accept': 'application/json'
          }
        });
        
        await trackXeroApiCall(tasksResponse.headers, tenantId);
        SmartRateLimit.updateFromHeaders(tasksResponse.headers);
        
        if (!tasksResponse.ok) {
          const errorText = await tasksResponse.text();
          console.error(`[Task Sync] Failed to fetch tasks for project ${project.name}: ${errorText}`);
          
          // Record failure for all tasks in this project
          for (const timesheetTask of timesheetTasks) {
            results.push({
              projectId: project.projectId,
              projectName: project.name,
              taskName: timesheetTask.name,
              success: false,
              error: `Could not fetch existing tasks: HTTP ${tasksResponse.status}`
            });
          }
          continue;
        }
        
        const tasksData = await tasksResponse.json();
        const existingTasks = tasksData.items || [];
        
        // Create a map of existing tasks by name for quick lookup
        const existingTasksMap = new Map<string, XeroTask>(
          existingTasks.map((task: any) => [task.name.toLowerCase(), task as XeroTask])
        );
        
                 // Step 2: Process each task from the timesheet
         for (const timesheetTask of timesheetTasks) {
           try {
             // Validate idempotency key
             if (!timesheetTask.idempotencyKey) {
               console.error(`[Task Sync] Missing idempotency key for task "${timesheetTask.name}" in project ${project.name}`);
               results.push({
                 projectId: project.projectId,
                 projectName: project.name,
                 taskName: timesheetTask.name,
                 success: false,
                 error: 'Missing idempotency key'
               });
               continue;
             }
             

             
             const existingTask = existingTasksMap.get(timesheetTask.name.toLowerCase());
            
                         // Prepare task payload with correct currency and values
             const rateInCents = convertRateToCents(timesheetTask.rate.value);
             
             const taskPayload = {
               name: timesheetTask.name,
               rate: {
                 currency: baseTaskConfig.rate.currency,
                 value: rateInCents
               },
               chargeType: timesheetTask.chargeType,
               estimateMinutes: timesheetTask.estimateMinutes
             };
            
            if (existingTask) {
              // Task exists - check if update is needed
              const needsUpdate = 
                existingTask.rate.value !== rateInCents ||
                existingTask.estimateMinutes !== timesheetTask.estimateMinutes ||
                existingTask.chargeType !== timesheetTask.chargeType;
              
              if (needsUpdate) {
                // Update existing task
                await SmartRateLimit.waitIfNeeded();
                const updateResponse = await fetch(`https://api.xero.com/projects.xro/2.0/projects/${project.projectId}/tasks/${existingTask.taskId}`, {
                  method: 'PUT',
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Xero-Tenant-Id': tenantId,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify(taskPayload)
                });
                
                await trackXeroApiCall(updateResponse.headers, tenantId);
                SmartRateLimit.updateFromHeaders(updateResponse.headers);
                
                if (updateResponse.ok) {
                  results.push({
                    projectId: project.projectId,
                    projectName: project.name,
                    taskName: timesheetTask.name,
                    success: true,
                    error: 'Updated existing task'
                  });
                } else {
                  const updateErrorText = await updateResponse.text();
                  console.error(`[Task Sync] Failed to update task: ${updateErrorText}`);
                  results.push({
                    projectId: project.projectId,
                    projectName: project.name,
                    taskName: timesheetTask.name,
                    success: false,
                    error: `Update failed: HTTP ${updateResponse.status}`
                  });
                }
              } else {
                results.push({
                  projectId: project.projectId,
                  projectName: project.name,
                  taskName: timesheetTask.name,
                  success: true,
                  error: 'Task already up to date'
                });
              }
            } else {
                             // Task doesn't exist - create it
               await SmartRateLimit.waitIfNeeded();
               const createResponse = await fetch(`https://api.xero.com/projects.xro/2.0/projects/${project.projectId}/tasks`, {
                 method: 'POST',
                 headers: {
                   'Authorization': `Bearer ${accessToken}`,
                   'Xero-Tenant-Id': tenantId,
                   'Accept': 'application/json',
                   'Content-Type': 'application/json',
                   'Idempotency-Key': timesheetTask.idempotencyKey
                 },
                 body: JSON.stringify(taskPayload)
               });
              
              await trackXeroApiCall(createResponse.headers, tenantId);
              SmartRateLimit.updateFromHeaders(createResponse.headers);
              
              if (createResponse.ok) {
                results.push({
                  projectId: project.projectId,
                  projectName: project.name,
                  taskName: timesheetTask.name,
                  success: true,
                  idempotencyKey: timesheetTask.idempotencyKey
                });
                             } else {
                 const createErrorText = await createResponse.text();
                 console.error(`[Task Sync] Failed to create task "${timesheetTask.name}"`);
                 console.error(`[Task Sync] HTTP ${createResponse.status}: ${createErrorText}`);
                 console.error(`[Task Sync] Used idempotency key: "${timesheetTask.idempotencyKey}"`);
                 console.error(`[Task Sync] Payload was:`, JSON.stringify(taskPayload, null, 2));
                 
                 results.push({
                   projectId: project.projectId,
                   projectName: project.name,
                   taskName: timesheetTask.name,
                   success: false,
                   error: `Create failed: HTTP ${createResponse.status}`,
                   idempotencyKey: timesheetTask.idempotencyKey
                 });
               }
            }
          } catch (taskError) {
            console.error(`[Task Sync] Error processing task "${timesheetTask.name}":`, taskError);
            results.push({
              projectId: project.projectId,
              projectName: project.name,
              taskName: timesheetTask.name,
              success: false,
              error: taskError instanceof Error ? taskError.message : 'Unknown error'
            });
          }
        }
        
        // Optional Step 3: Log tasks that exist in Xero but not in timesheet (potential cleanup candidates)
        const timesheetTaskNames = new Set(timesheetTasks.map(t => t.name.toLowerCase()));
        const orphanedTasks = existingTasks.filter((task: any) => !timesheetTaskNames.has(task.name.toLowerCase()));
        
        if (orphanedTasks.length > 0) {
          // Note: We're not deleting these automatically as they might be needed for other purposes
        }
        
      } catch (projectError) {
        console.error(`[Task Sync] Error processing project ${project.name}:`, projectError);
        
        // Record failure for all tasks in this project
        for (const timesheetTask of timesheetTasks) {
          results.push({
            projectId: project.projectId,
            projectName: project.name,
            taskName: timesheetTask.name,
            success: false,
            error: projectError instanceof Error ? projectError.message : 'Unknown error'
          });
        }
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
  
  try {
    const { access_token, effective_tenant_id } = await ensureValidToken();
    
    // Get the filtered payload from the frontend (already processed and filtered)
    const body = await request.json();
    const { filteredPayload } = body;
    
    if (!filteredPayload || !filteredPayload.consolidated_payload) {
      return NextResponse.json({ error: 'No filtered payload provided' }, { status: 400 });
    }
    
    // Get project data for tenant info
    const projectData = await XeroProjectService.getProjectData();
    const currentTenant = projectData.tenantName;
    
    // Track API calls
    apiCallsStart = SmartRateLimit.getRemainingCalls();
    
    // Step 1: Create/update tasks with correct values in one go
    const taskResults = await createAndUpdateTasks(
      filteredPayload.consolidated_payload,
      projectData,
      effective_tenant_id,
      currentTenant,
      access_token
    );
    
    const successfulTasks = taskResults.filter((r: any) => r.success).length;
    
    // Calculate statistics
    const totalApiCalls = apiCallsStart - SmartRateLimit.getRemainingCalls();
    const processingTimeMs = Date.now() - startTime;
    
    // Generate comprehensive report
    const report = generateComprehensiveReport(filteredPayload, taskResults, []);
    
    // Build response
    const result: UnifiedProcessingResult = {
      success: true,
      timesheetProcessing: filteredPayload,
      projectStandardization: {
        projectsAnalyzed: Object.keys(filteredPayload.consolidated_payload).length,
        projectsNeedingTasks: new Set(taskResults.map((r: any) => r.projectId)).size,
        tasksCreated: successfulTasks,
        taskCreationResults: taskResults
      },
      taskUpdates: {
        projectsProcessed: Object.keys(filteredPayload.consolidated_payload).length,
        tasksUpdated: successfulTasks,
        tasksFailed: taskResults.filter((r: any) => !r.success).length,
        updateResults: [] // No separate updates since we do it all in one step
      },
      downloadableReport: report,
      statistics: {
        totalApiCalls,
        processingTimeMs,
        cacheHits: 0
      }
    };
    
    return NextResponse.json(result);
    
  } catch (error: any) {
    console.error('[Xero Update] Error:', error);
    return NextResponse.json({ 
      error: error.message || 'An error occurred during processing',
      details: error.stack
    }, { status: 500 });
  }
} 