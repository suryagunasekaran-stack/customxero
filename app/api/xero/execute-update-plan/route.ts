import { NextRequest, NextResponse } from 'next/server';
import { trackXeroApiCall } from '@/lib/xeroApiTracker';
import { ensureValidToken } from '@/lib/ensureXeroToken';

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

interface TaskUpdateAction {
  action: 'update' | 'skip' | 'missing_task';
  taskName: string;
  taskId?: string;
  consolidatedTask: ConsolidatedTask;
  currentEstimate?: number;
  newEstimate: number;
  currentRate?: number;
  newRate: number;
  reason: string;
}

interface ProjectUpdateAction {
  action: 'update' | 'skip' | 'no_match';
  projectCode: string;
  projectId?: string;
  projectName?: string;
  tasks: TaskUpdateAction[];
  reason: string;
  totalNewEstimate: number;
  totalCurrentEstimate?: number;
  totalNewRate: number;
  totalCurrentRate?: number;
}

interface UpdatePlan {
  statistics: {
    totalProjects: number;
    projectsToUpdate: number;
    projectsToSkip: number;
    projectsNoMatch: number;
    totalTasks: number;
    tasksToUpdate: number;
    tasksToSkip: number;
    tasksMissing: number;
  };
  projectActions: ProjectUpdateAction[];
  reportData: {
    filename: string;
    content: string;
  };
}

interface ExecutionRequest {
  updatePlan: UpdatePlan;
  tenantId: string;
}

interface XeroTask {
  name: string;
  rate: {
    currency: string;
    value: number;
  };
  chargeType: string;
  status: string;
  estimateMinutes: number;
  taskId: string;
  projectId: string;
  totalMinutes: number;
  totalAmount: {
    currency: string;
    value: number;
  };
}

interface ExecutionResult {
  projectCode: string;
  projectId: string;
  projectName: string;
  action: 'success' | 'failed' | 'skipped';
  tasksUpdated: number;
  tasksFailed: number;
  tasksSkipped: number;
  taskResults: {
    taskName: string;
    action: 'updated' | 'failed' | 'skipped';
    error?: string;
    oldValues?: { estimateMinutes: number; rate: number };
    newValues?: { estimateMinutes: number; rate: number };
  }[];
  error?: string;
}

interface ExecutionStatistics {
  totalProjectsProcessed: number;
  projectsSuccessful: number;
  projectsFailed: number;
  projectsSkipped: number;
  totalTasksProcessed: number;
  tasksUpdated: number;
  tasksFailed: number;
  tasksSkipped: number;
  startTime: string;
  endTime: string;
  duration: string;
}

async function fetchProjectTasks(projectId: string, accessToken: string, tenantId: string): Promise<XeroTask[]> {
  const url = `https://api.xero.com/projects.xro/2.0/Projects/${projectId}/Tasks`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'xero-tenant-id': tenantId,
      'Accept': 'application/json'
    }
  });

  // Track API usage
  await trackXeroApiCall(response.headers, tenantId);

  if (!response.ok) {
    throw new Error(`Failed to fetch tasks for project ${projectId}: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.items || [];
}

async function updateTask(projectId: string, taskId: string, updateData: any, accessToken: string, tenantId: string): Promise<void> {
  const url = `https://api.xero.com/projects.xro/2.0/projects/${projectId}/tasks/${taskId}`;
  
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'xero-tenant-id': tenantId,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updateData)
  });

  // Track API usage
  await trackXeroApiCall(response.headers, tenantId);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to update task ${taskId}: ${response.status} ${response.statusText} - ${errorText}`);
  }
}

function generateExecutionReport(results: ExecutionResult[], statistics: ExecutionStatistics): { filename: string; content: string } {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const filename = `xero-update-execution-report-${timestamp}.csv`;
  
  // CSV Headers
  const csvLines = [
    'Project Code,Project Name,Project Status,Tasks Updated,Tasks Failed,Tasks Skipped,Task Name,Task Action,Task Status,Old Estimate,New Estimate,Old Rate,New Rate,Error Message'
  ];
  
  // Add execution statistics as comments
  csvLines.push(`# Execution Report Generated: ${statistics.endTime}`);
  csvLines.push(`# Execution Duration: ${statistics.duration}`);
  csvLines.push(`# Projects Processed: ${statistics.totalProjectsProcessed}`);
  csvLines.push(`# Projects Successful: ${statistics.projectsSuccessful}`);
  csvLines.push(`# Projects Failed: ${statistics.projectsFailed}`);
  csvLines.push(`# Tasks Updated: ${statistics.tasksUpdated}`);
  csvLines.push(`# Tasks Failed: ${statistics.tasksFailed}`);
  csvLines.push(''); // Empty line after metadata
  
  // Process each project result
  results.forEach(project => {
    if (project.taskResults.length === 0) {
      // Project with no task results
      csvLines.push(`"${project.projectCode}","${project.projectName}","${project.action}","${project.tasksUpdated}","${project.tasksFailed}","${project.tasksSkipped}","N/A","N/A","N/A","N/A","N/A","N/A","N/A","${project.error || 'N/A'}"`);
    } else {
      // Project with task results
      project.taskResults.forEach((task, index) => {
        const projectCodeCell = index === 0 ? project.projectCode : '';
        const projectNameCell = index === 0 ? project.projectName : '';
        const projectStatusCell = index === 0 ? project.action : '';
        const tasksUpdatedCell = index === 0 ? project.tasksUpdated.toString() : '';
        const tasksFailedCell = index === 0 ? project.tasksFailed.toString() : '';
        const tasksSkippedCell = index === 0 ? project.tasksSkipped.toString() : '';
        
        const oldEstimate = task.oldValues ? task.oldValues.estimateMinutes.toString() : 'N/A';
        const newEstimate = task.newValues ? task.newValues.estimateMinutes.toString() : 'N/A';
        const oldRate = task.oldValues ? (task.oldValues.rate / 100).toFixed(2) : 'N/A';
        const newRate = task.newValues ? (task.newValues.rate / 100).toFixed(2) : 'N/A';
        
        csvLines.push(`"${projectCodeCell}","${projectNameCell}","${projectStatusCell}","${tasksUpdatedCell}","${tasksFailedCell}","${tasksSkippedCell}","${task.taskName}","update","${task.action}","${oldEstimate}","${newEstimate}","${oldRate}","${newRate}","${task.error || 'N/A'}"`);
      });
    }
  });
  
  return {
    filename,
    content: csvLines.join('\n')
  };
}

export async function POST(request: NextRequest) {
  const startTime = new Date();
  console.log('[Execute Update Plan API] Starting execution at', startTime.toISOString());

  try {
    // Get valid token from Redis
    const { access_token } = await ensureValidToken();
    console.log('[Execute Update Plan API] Successfully obtained Xero token.');

    const body: ExecutionRequest = await request.json();
    const { updatePlan, tenantId } = body;

    if (!updatePlan || !updatePlan.projectActions) {
      return NextResponse.json({ 
        error: 'Invalid request: updatePlan with projectActions required' 
      }, { status: 400 });
    }

    if (!tenantId) {
      return NextResponse.json({ 
        error: 'Invalid request: tenantId required' 
      }, { status: 400 });
    }

    console.log(`[Execute Update Plan API] Executing updates for ${updatePlan.projectActions.length} projects`);

    const results: ExecutionResult[] = [];
    const statistics: ExecutionStatistics = {
      totalProjectsProcessed: 0,
      projectsSuccessful: 0,
      projectsFailed: 0,
      projectsSkipped: 0,
      totalTasksProcessed: 0,
      tasksUpdated: 0,
      tasksFailed: 0,
      tasksSkipped: 0,
      startTime: startTime.toISOString(),
      endTime: '',
      duration: ''
    };

    // Process only projects that need updates (skip no_match and skip actions)
    const projectsToUpdate = updatePlan.projectActions.filter(project => project.action === 'update');
    
    // Safety check: Limit batch size to prevent timeouts (max 150 projects per execution)
    if (projectsToUpdate.length > 150) {
      return NextResponse.json({ 
        error: `Batch too large: ${projectsToUpdate.length} projects. Maximum 150 projects per execution to prevent timeouts. Please split the update plan.` 
      }, { status: 400 });
    }

    // Log execution estimate for large batches
    if (projectsToUpdate.length > 100) {
      const estimatedMinutes = Math.ceil((projectsToUpdate.length * 1.5) / 60); // Rough estimate
      console.log(`[Execute Update Plan API] Large batch detected: ${projectsToUpdate.length} projects. Estimated execution time: ${estimatedMinutes} minutes`);
    }
    
    for (const project of projectsToUpdate) {
      statistics.totalProjectsProcessed++;
      
      const result: ExecutionResult = {
        projectCode: project.projectCode,
        projectId: project.projectId!,
        projectName: project.projectName || 'Unknown',
        action: 'success',
        tasksUpdated: 0,
        tasksFailed: 0,
        tasksSkipped: 0,
        taskResults: []
      };

      try {
        console.log(`[Execute Update Plan API] Processing project ${project.projectCode} (${project.projectId})`);
        
        // Add delay to respect rate limits (800ms between project API calls for batches > 50)
        if (statistics.totalProjectsProcessed > 1) {
          const delay = projectsToUpdate.length > 50 ? 800 : 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        // Fetch current tasks for this project
        const currentTasks = await fetchProjectTasks(project.projectId!, access_token, tenantId);
        console.log(`[Execute Update Plan API] Found ${currentTasks.length} tasks for project ${project.projectCode}`);

        // Process each task that needs updating
        const tasksToUpdate = project.tasks.filter(task => task.action === 'update');
        
        for (const taskUpdate of tasksToUpdate) {
          statistics.totalTasksProcessed++;
          
          // Find matching task by name
          const currentTask = currentTasks.find(ct => ct.name === taskUpdate.taskName);
          
          if (!currentTask) {
            // Task not found - this shouldn't happen if we did the planning correctly
            result.taskResults.push({
              taskName: taskUpdate.taskName,
              action: 'failed',
              error: 'Task not found in project'
            });
            result.tasksFailed++;
            statistics.tasksFailed++;
            continue;
          }

          try {
            // Use the existing task's currency to avoid validation errors
            // Demo company uses USD, but other tenants might use SGD
            let expectedCurrency = currentTask.rate?.currency;
            
            // Fallback if existing task has no currency set
            if (!expectedCurrency) {
              // Try to use consolidated payload currency as fallback
              expectedCurrency = taskUpdate.consolidatedTask.rate.currency;
              console.log(`[Execute Update Plan API] WARNING: Existing task has no currency, using consolidated currency: ${expectedCurrency}`);
            }
            
            // Final fallback to SGD for production (most common case)
            if (!expectedCurrency) {
              expectedCurrency = 'SGD';
              console.log(`[Execute Update Plan API] WARNING: No currency available, defaulting to SGD`);
            }
            
            // Log currency detection
            console.log(`[Execute Update Plan API] Currency detection: Consolidated=${taskUpdate.consolidatedTask.rate.currency}, Xero=${currentTask.rate?.currency || 'none'}, Using=${expectedCurrency}`);
            
            // Prepare update payload using the existing task's currency
            const updatePayload = {
              name: taskUpdate.taskName,
              rate: {
                currency: expectedCurrency, // Use Xero's expected currency
                value: taskUpdate.consolidatedTask.rate.value / 100 // Convert from cents to dollars
              },
              chargeType: taskUpdate.consolidatedTask.chargeType,
              estimateMinutes: taskUpdate.consolidatedTask.estimateMinutes
            };

            console.log(`[Execute Update Plan API] Updating task ${taskUpdate.taskName} (${currentTask.taskId}) with currency ${expectedCurrency}`);
            
            // Add delay between task updates to respect rate limits (300ms for large batches)
            if (statistics.totalTasksProcessed > 1) {
              const taskDelay = projectsToUpdate.length > 50 ? 300 : 500;
              await new Promise(resolve => setTimeout(resolve, taskDelay));
            }
            
            // Execute the update
            await updateTask(project.projectId!, currentTask.taskId, updatePayload, access_token, tenantId);
            
            result.taskResults.push({
              taskName: taskUpdate.taskName,
              action: 'updated',
              oldValues: {
                estimateMinutes: currentTask.estimateMinutes,
                rate: currentTask.rate.value * 100 // Convert to cents for consistency
              },
              newValues: {
                estimateMinutes: taskUpdate.consolidatedTask.estimateMinutes,
                rate: taskUpdate.consolidatedTask.rate.value
              }
            });
            
            result.tasksUpdated++;
            statistics.tasksUpdated++;
            
          } catch (taskError: any) {
            console.error(`[Execute Update Plan API] Failed to update task ${taskUpdate.taskName}:`, taskError.message);
            
            result.taskResults.push({
              taskName: taskUpdate.taskName,
              action: 'failed',
              error: taskError.message,
              oldValues: {
                estimateMinutes: currentTask.estimateMinutes,
                rate: currentTask.rate.value * 100
              }
            });
            
            result.tasksFailed++;
            statistics.tasksFailed++;
          }
        }

        // Skip tasks that don't need updating
        const tasksToSkip = project.tasks.filter(task => task.action === 'skip');
        result.tasksSkipped = tasksToSkip.length;
        statistics.tasksSkipped += tasksToSkip.length;

        if (result.tasksFailed === 0) {
          statistics.projectsSuccessful++;
        } else {
          result.action = 'failed';
          statistics.projectsFailed++;
        }

      } catch (projectError: any) {
        console.error(`[Execute Update Plan API] Failed to process project ${project.projectCode}:`, projectError.message);
        
        result.action = 'failed';
        result.error = projectError.message;
        statistics.projectsFailed++;
      }

      results.push(result);
    }

    const endTime = new Date();
    statistics.endTime = endTime.toISOString();
    statistics.duration = `${Math.round((endTime.getTime() - startTime.getTime()) / 1000)}s`;

    // Generate execution report
    const reportData = generateExecutionReport(results, statistics);

    console.log(`[Execute Update Plan API] Execution completed:`, statistics);

    return NextResponse.json({
      success: true,
      statistics,
      results,
      reportData,
      summary: {
        message: `Updated ${statistics.tasksUpdated} tasks across ${statistics.projectsSuccessful} projects (${statistics.projectsFailed} projects failed)`,
        executionTime: statistics.duration,
        readyForDownload: true
      }
    });

  } catch (error: any) {
    const endTime = new Date();
    console.error('[Execute Update Plan API] Execution failed:', error);
    
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to execute update plan',
      statistics: {
        totalProjectsProcessed: 0,
        projectsSuccessful: 0,
        projectsFailed: 0,
        projectsSkipped: 0,
        totalTasksProcessed: 0,
        tasksUpdated: 0,
        tasksFailed: 0,
        tasksSkipped: 0,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        duration: `${Math.round((endTime.getTime() - startTime.getTime()) / 1000)}s`
      }
    }, { status: 500 });
  }
} 