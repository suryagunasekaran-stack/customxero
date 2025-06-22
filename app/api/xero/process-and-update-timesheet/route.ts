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
  
  // Log the task creation/update process
  console.log('[Task Sync] Starting task creation/update process');
  console.log('[Task Sync] Project codes to process:', projectCodesToProcess.length, 'projects');
  
  for (const projectCode of projectCodesToProcess) {
    const codeData = projectData.projectCodes[projectCode];
    if (!codeData || !Array.isArray(codeData)) {
      console.warn(`[Task Sync] No project data found for code: ${projectCode}`);
      continue;
    }
    
    const timesheetTasks = consolidatedPayload[projectCode];
    console.log(`[Task Sync] Processing ${timesheetTasks.length} tasks for project code: ${projectCode}`);
    console.log(`[Task Sync] Tasks for ${projectCode}:`, timesheetTasks.map(t => t.name));
    
    // Log if Supply Labour is missing
    const hasSupplyLabour = timesheetTasks.some(t => t.name === 'Supply Labour');
    if (!hasSupplyLabour) {
      console.warn(`[Task Sync] WARNING: 'Supply Labour' task is missing for project code ${projectCode}`);
    }
    
    // Process each project that has this code
    for (const project of codeData) {
      console.log(`[Task Sync] Processing project: ${project.name} (${project.projectId})`);
      
      try {
        // Step 1: Fetch existing tasks for this project (with retry for 429)
        let tasksResponse: Response | null = null;
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount <= maxRetries) {
          await SmartRateLimit.waitIfNeeded();
          tasksResponse = await fetch(`https://api.xero.com/projects.xro/2.0/projects/${project.projectId}/tasks`, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Xero-Tenant-Id': tenantId,
              'Accept': 'application/json'
            }
          });
        
          await trackXeroApiCall(tasksResponse.headers, tenantId);
          SmartRateLimit.updateFromHeaders(tasksResponse.headers);
          
          // If we get rate limited, wait and retry
          if (tasksResponse.status === 429) {
            const retryAfter = tasksResponse.headers.get('retry-after');
            const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : (retryCount + 1) * 2000; // Exponential backoff
            console.warn(`[Task Sync] Rate limited (429) for project ${project.name}, waiting ${waitTime}ms before retry ${retryCount + 1}/${maxRetries}`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            retryCount++;
            continue;
          }
          
          // If it's not a rate limit error, break out of retry loop
          break;
        }
        
        if (!tasksResponse || !tasksResponse.ok) {
          const errorText = tasksResponse ? await tasksResponse.text() : 'No response received';
          console.error(`[Task Sync] Failed to fetch tasks for project ${project.name} after ${retryCount} retries: ${errorText}`);
          
          // Record failure for all tasks in this project
          for (const timesheetTask of timesheetTasks) {
            results.push({
              projectId: project.projectId,
              projectName: project.name,
              taskName: timesheetTask.name,
              success: false,
              error: `Could not fetch existing tasks: HTTP ${tasksResponse?.status || 'unknown'}${retryCount > 0 ? ` (after ${retryCount} retries)` : ''}`
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
        
        // Log existing tasks for debugging
        console.log(`[Task Sync] Existing tasks in project ${project.name}:`, existingTasks.map((t: any) => t.name));
        
        // Check specifically for Supply Labour variations
        const supplyLabourVariations = ['Supply Labour', 'supply labour', 'SUPPLY LABOUR', 'Supply Labor'];
        const existingSupplyLabour = existingTasks.find((task: any) => 
          supplyLabourVariations.some(variation => task.name.toLowerCase() === variation.toLowerCase())
        );
        if (existingSupplyLabour) {
          console.log(`[Task Sync] Found existing Supply Labour task: "${existingSupplyLabour.name}"`);
        }
        
                 // Step 2: Process each task from the timesheet
         for (const timesheetTask of timesheetTasks) {
           console.log(`[Task Sync] Processing task: "${timesheetTask.name}" for project ${project.name}`);
           
           try {
             // Validate idempotency key
             if (!timesheetTask.idempotencyKey || timesheetTask.idempotencyKey.trim() === '') {
               console.error(`[Task Sync] Missing or empty idempotency key for task "${timesheetTask.name}" in project ${project.name}`);
               results.push({
                 projectId: project.projectId,
                 projectName: project.name,
                 taskName: timesheetTask.name,
                 success: false,
                 error: 'Missing or empty idempotency key - cannot create task without unique identifier'
               });
               continue;
             }
             
             // Validate task data
             if (!timesheetTask.name || timesheetTask.name.trim() === '') {
               console.error(`[Task Sync] Invalid task name for project ${project.name}`);
               results.push({
                 projectId: project.projectId,
                 projectName: project.name,
                 taskName: timesheetTask.name || 'Unnamed Task',
                 success: false,
                 error: 'Invalid task name'
               });
               continue;
             }
             
             if (!timesheetTask.rate || typeof timesheetTask.rate.value !== 'number') {
               console.error(`[Task Sync] Invalid rate for task "${timesheetTask.name}" in project ${project.name}`);
               results.push({
                 projectId: project.projectId,
                 projectName: project.name,
                 taskName: timesheetTask.name,
                 success: false,
                 error: 'Invalid rate value'
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
                             // Task doesn't exist - create it (with retry for 429)
               let createResponse: Response | null = null;
               let createRetryCount = 0;
               const createMaxRetries = 3;
               
               while (createRetryCount <= createMaxRetries) {
                 await SmartRateLimit.waitIfNeeded();
                 createResponse = await fetch(`https://api.xero.com/projects.xro/2.0/projects/${project.projectId}/tasks`, {
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
                
                // If we get rate limited, wait and retry
                if (createResponse.status === 429) {
                  const retryAfter = createResponse.headers.get('retry-after');
                  const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : (createRetryCount + 1) * 2000;
                  console.warn(`[Task Sync] Rate limited (429) creating task "${timesheetTask.name}", waiting ${waitTime}ms before retry ${createRetryCount + 1}/${createMaxRetries}`);
                  await new Promise(resolve => setTimeout(resolve, waitTime));
                  createRetryCount++;
                  continue;
                }
                
                // If it's not a rate limit error, break out of retry loop
                break;
               }
              
                             if (createResponse && createResponse.ok) {
                results.push({
                  projectId: project.projectId,
                  projectName: project.name,
                  taskName: timesheetTask.name,
                  success: true,
                  idempotencyKey: timesheetTask.idempotencyKey
                });
                             } else {
                 const createErrorText = createResponse ? await createResponse.text() : 'No response received';
                 let errorMessage = `HTTP ${createResponse?.status || 'unknown'}`;
                 
                 // Try to parse error details from Xero response
                 try {
                   const errorData = JSON.parse(createErrorText);
                   if (errorData.Message) {
                     errorMessage = errorData.Message;
                   } else if (errorData.error) {
                     errorMessage = errorData.error;
                   } else if (errorData.ErrorNumber) {
                     errorMessage = `Xero Error ${errorData.ErrorNumber}: ${errorData.Type || 'Unknown'}`;
                   }
                   
                   // Check for idempotency key conflict
                   if ((createResponse?.status === 409) || errorMessage.toLowerCase().includes('idempotency')) {
                     errorMessage = `Idempotency key conflict - this task may have been created in a previous attempt`;
                     console.warn(`[Task Sync] Idempotency key conflict for task "${timesheetTask.name}" - key: ${timesheetTask.idempotencyKey}`);
                   }
                 } catch (e) {
                   // If not JSON, use the text as-is
                   if (createErrorText) {
                     errorMessage = createErrorText.substring(0, 200); // Limit length
                   }
                   
                   // Check for common error patterns in text response
                   if (createResponse?.status === 409) {
                     errorMessage = `Conflict - task may already exist or idempotency key was used before`;
                   }
                 }
                 
                 console.error(`[Task Sync] Failed to create task "${timesheetTask.name}"`);
                 console.error(`[Task Sync] HTTP ${createResponse?.status || 'unknown'}: ${createErrorText}`);
                 console.error(`[Task Sync] Used idempotency key: "${timesheetTask.idempotencyKey}"`);
                 console.error(`[Task Sync] Payload was:`, JSON.stringify(taskPayload, null, 2));
                 
                 results.push({
                   projectId: project.projectId,
                   projectName: project.name,
                   taskName: timesheetTask.name,
                   success: false,
                   error: errorMessage + (createRetryCount > 0 ? ` (after ${createRetryCount} retries)` : ''),
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
  
  // Final summary - check Supply Labour status
  console.log('[Task Sync] === FINAL SUMMARY ===');
  const supplyLabourResults = results.filter(r => r.taskName === 'Supply Labour');
  console.log(`[Task Sync] Supply Labour tasks processed: ${supplyLabourResults.length}`);
  
  if (supplyLabourResults.length === 0) {
    console.error('[Task Sync] ERROR: No Supply Labour tasks were processed!');
    console.error('[Task Sync] This means Supply Labour was not in the consolidated payload');
  } else {
    supplyLabourResults.forEach(result => {
      console.log(`[Task Sync] Supply Labour in ${result.projectName}: ${result.success ? 'SUCCESS' : 'FAILED'} - ${result.error || 'Created successfully'}`);
    });
  }
  
  const failedSupplyLabour = supplyLabourResults.filter(r => !r.success);
  if (failedSupplyLabour.length > 0) {
    console.error(`[Task Sync] ${failedSupplyLabour.length} Supply Labour tasks failed!`);
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
  
  const successfulCreations = taskCreationResults.filter(r => r.success).length;
  const failedCreations = taskCreationResults.filter(r => !r.success).length;
  
  // Filter actual failures vs "not found" projects
  const actualFailures = taskCreationResults.filter(r => !r.success && 
    !(r.error?.includes('not found') || r.error?.includes('Project code not found'))
  );
  const notFoundFailures = taskCreationResults.filter(r => !r.success && 
    (r.error?.includes('not found') || r.error?.includes('Project code not found'))
  );
  
  const hasActualFailures = actualFailures.length > 0;
  
  const csvLines = [
    'Section,Project Code,Project Name,Task Name,Action,Status,Previous Value,New Value,Details'
  ];
  
  // Add enhanced metadata with better failure categorization
  csvLines.push(`# Report Generated: ${new Date().toISOString()}`);
  csvLines.push(`# Period: ${timesheetData.metadata.period_range}`);
  csvLines.push(`# Timesheet Entries Processed: ${timesheetData.metadata.entries_processed}`);
  csvLines.push(`# Projects Consolidated: ${timesheetData.metadata.projects_consolidated}`);
  csvLines.push(`# Tasks Created Successfully: ${successfulCreations}`);
  csvLines.push(`# Actual Task Failures: ${actualFailures.length}`);
  csvLines.push(`# Projects Not Found (Likely Closed): ${notFoundFailures.length}`);
  if (hasActualFailures) {
    csvLines.push(`# ⚠️  ALERT: ${actualFailures.length} actual failure(s) require attention!`);
  }
  csvLines.push(`# Tasks Updated: ${updateResults.filter(r => r.success && !r.error?.includes('unchanged')).length}`);
  csvLines.push('');
  
  // Task Creation Section - prioritize actual failures for visibility
  if (taskCreationResults.length > 0) {
    csvLines.push('# TASK OPERATIONS');
    
    // Actual failures first (most important)
    if (actualFailures.length > 0) {
      csvLines.push('## ❌ ACTUAL FAILURES REQUIRING ATTENTION');
      actualFailures.forEach(result => {
        csvLines.push(`"Failure","N/A","${result.projectName}","${result.taskName}","Create","FAILED","N/A","N/A","${result.error || 'Unknown error'}"`);
      });
      csvLines.push('');
    }
    
    // Then successful tasks
    if (successfulCreations > 0) {
      csvLines.push('## ✅ SUCCESSFUL OPERATIONS');
      const successfulTasks = taskCreationResults.filter(r => r.success);
      successfulTasks.forEach(result => {
        csvLines.push(`"Success","N/A","${result.projectName}","${result.taskName}","Create","Success","N/A","Created","Task created successfully"`);
      });
      csvLines.push('');
    }
    
    // Finally, not found projects (informational only)
    if (notFoundFailures.length > 0) {
      csvLines.push('## ℹ️  PROJECTS NOT FOUND (LIKELY CLOSED/COMPLETED)');
      const projectGroups = new Map<string, TaskCreationResult[]>();
      notFoundFailures.forEach(result => {
        const projectKey = result.projectName || 'Unknown Project';
        if (!projectGroups.has(projectKey)) {
          projectGroups.set(projectKey, []);
        }
        projectGroups.get(projectKey)!.push(result);
      });
      
      projectGroups.forEach((tasks, projectName) => {
        csvLines.push(`"Info","N/A","${projectName}","${tasks.length} tasks","Skip","Info","N/A","N/A","Project likely moved to CLOSED/COMPLETED status - no action required"`);
      });
      csvLines.push('');
    }
  }
  
  // Task Updates Section
  if (updateResults.length > 0) {
    csvLines.push('# TASK UPDATES');
    updateResults.forEach(result => {
      const status = result.success ? (result.error?.includes('unchanged') ? 'Unchanged' : 'Updated') : 'Failed';
      const prevValue = result.previousEstimate !== undefined ? `${result.previousEstimate} min @ $${(result.previousRate || 0) / 100}` : 'N/A';
      const newValue = `${result.newEstimate} min @ $${result.newRate / 100}`;
      csvLines.push(`"Update","${result.projectCode}","${result.projectName}","${result.taskName}","Update","${status}","${prevValue}","${newValue}","${result.error || 'Updated successfully'}"`);
    });
    csvLines.push('');
  }
  
  // Add summary
  csvLines.push('# 📊 SUMMARY');
  csvLines.push(`# Total Task Operations: ${taskCreationResults.length + updateResults.length}`);
  csvLines.push(`# Successful Operations: ${successfulCreations + updateResults.filter(r => r.success).length}`);
  csvLines.push(`# Actual Failures: ${actualFailures.length}`);
  csvLines.push(`# Projects Not Found: ${notFoundFailures.length}`);
  csvLines.push(`# Success Rate (excluding not found): ${actualFailures.length === 0 ? '100%' : ((successfulCreations / (successfulCreations + actualFailures.length)) * 100).toFixed(1)}%`);
  
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
    
    // Validate that required tasks are present in the payload
    const missingRequiredTasks: { [projectCode: string]: string[] } = {};
    Object.entries(filteredPayload.consolidated_payload).forEach(([projectCode, tasks]: [string, any]) => {
      const taskNames = (tasks as ConsolidatedTask[]).map(t => t.name);
      const missing = REQUIRED_TASKS.filter(reqTask => !taskNames.includes(reqTask));
      if (missing.length > 0) {
        missingRequiredTasks[projectCode] = missing;
        console.warn(`[Xero Update] Project ${projectCode} is missing required tasks: ${missing.join(', ')}`);
      }
    });
    
    if (Object.keys(missingRequiredTasks).length > 0) {
      console.error('[Xero Update] WARNING: Some projects are missing required tasks:', missingRequiredTasks);
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
    const failedTasks = taskResults.filter((r: any) => !r.success);
    const failedTaskCount = failedTasks.length;
    
    // Determine overall success - consider it a failure if ANY task fails
    const overallSuccess = failedTaskCount === 0;
    
    // Calculate statistics
    const totalApiCalls = apiCallsStart - SmartRateLimit.getRemainingCalls();
    const processingTimeMs = Date.now() - startTime;
    
    // Generate comprehensive report
    const report = generateComprehensiveReport(filteredPayload, taskResults, []);
    
    // Build response
    const result: UnifiedProcessingResult = {
      success: overallSuccess,
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
        tasksFailed: failedTaskCount,
        updateResults: [] // No separate updates since we do it all in one step
      },
      downloadableReport: report,
      statistics: {
        totalApiCalls,
        processingTimeMs,
        cacheHits: 0
      }
    };
    
    // If there were failures, include detailed error information
    if (!overallSuccess) {
      console.error(`[Xero Update] Task creation failed: ${failedTaskCount} tasks failed out of ${taskResults.length} total`);
      
      // Group failures by error type for better visibility
      const errorSummary = failedTasks.reduce((acc: any, task: any) => {
        const errorKey = task.error || 'Unknown error';
        if (!acc[errorKey]) {
          acc[errorKey] = [];
        }
        acc[errorKey].push(`${task.projectName} - ${task.taskName}`);
        return acc;
      }, {});
      
      // Add error details to the result
      (result as any).errorSummary = errorSummary;
      (result as any).failedTasks = failedTasks;
    }
    
    return NextResponse.json(result);
    
  } catch (error: any) {
    console.error('[Xero Update] Error:', error);
    return NextResponse.json({ 
      error: error.message || 'An error occurred during processing',
      details: error.stack
    }, { status: 500 });
  }
} 