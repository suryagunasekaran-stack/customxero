import { NextRequest, NextResponse } from 'next/server';

// Interface definitions
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
  message: string;
  metadata: {
    creation_date: string;
    period_range: string;
    entries_processed: number;
    entries_grouped: number;
    projects_consolidated: number;
    total_category_entries: number;
  };
  consolidated_payload: ConsolidatedPayload;
}

interface ExistingTimeEntry {
  timeEntryId: string;
  date: string;
  duration: number; // in minutes
  description: string;
  userId: string;
  taskName: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  [key: string]: any; // for other Xero fields
}

interface ProjectCodeData {
  projects: any[];
  tasks: { [taskName: string]: { taskId: string; projectId: string; projectName: string } };
  timeEntries: { [taskName: string]: ExistingTimeEntry[] };
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

interface ComparisonRequest {
  processedTimesheet: ProcessedTimesheet;
  projectCodeTaskMapping: { [code: string]: ProjectCodeData };
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

function generateCSVReport(projectActions: ProjectUpdateAction[], metadata: any): { filename: string; content: string } {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const filename = `xero-project-update-plan-${timestamp}.csv`;
  
  // Filter out projects that don't match (no_match) - only include matching projects
  const matchingProjects = projectActions.filter(project => project.action !== 'no_match');
  
  // CSV Headers - Updated terminology from "Rate" to "Fixed Cost"
  const csvLines = [
    'Project Code,Project Name,Project Action,Task Name,Task Action,Current Estimate (min),New Estimate (min),Current Fixed Cost,New Fixed Cost,Reason'
  ];
  
  // Add metadata as comments
  csvLines.push(`# Report Generated: ${new Date().toISOString()}`);
  csvLines.push(`# Period: ${metadata.period_range}`);
  csvLines.push(`# Matching Projects: ${matchingProjects.length}`);
  csvLines.push(`# Projects to Update: ${matchingProjects.filter(p => p.action === 'update').length}`);
  csvLines.push(`# Projects Up to Date: ${matchingProjects.filter(p => p.action === 'skip').length}`);
  csvLines.push(''); // Empty line after metadata
  
  // Process only matching projects
  matchingProjects.forEach(project => {
    if (project.tasks.length === 0) {
      // Project with no tasks (shouldn't happen for matching projects)
      csvLines.push(`"${project.projectCode}","${project.projectName || 'N/A'}","${project.action}","N/A","N/A","N/A","N/A","N/A","N/A","${project.reason}"`);
    } else {
      // Project with tasks
      project.tasks.forEach((task, index) => {
        const projectName = index === 0 ? (project.projectName || 'N/A') : '';
        const projectAction = index === 0 ? project.action : '';
        const projectCodeCell = index === 0 ? project.projectCode : '';
        
        csvLines.push(`"${projectCodeCell}","${projectName}","${projectAction}","${task.taskName}","${task.action}","${task.currentEstimate || 'N/A'}","${task.newEstimate}","${task.currentRate ? (task.currentRate / 100).toFixed(2) : 'N/A'}","${(task.newRate / 100).toFixed(2)}","${task.reason}"`);
      });
    }
  });
  
  return {
    filename,
    content: csvLines.join('\n')
  };
}

export async function POST(request: NextRequest) {
  console.log('[Update Plan API] Received POST request for project update planning');

  try {
    const body: ComparisonRequest = await request.json();
    const { processedTimesheet, projectCodeTaskMapping } = body;

    if (!processedTimesheet || !processedTimesheet.consolidated_payload) {
      return NextResponse.json({ 
        error: 'Invalid request: processedTimesheet with consolidated_payload required' 
      }, { status: 400 });
    }

    if (!projectCodeTaskMapping || typeof projectCodeTaskMapping !== 'object') {
      return NextResponse.json({ 
        error: 'Invalid request: projectCodeTaskMapping object required' 
      }, { status: 400 });
    }

    console.log(`[Update Plan API] Planning updates for ${Object.keys(processedTimesheet.consolidated_payload).length} project codes`);

    // Debug: Log what we have
    const availableProjectCodes = Object.keys(projectCodeTaskMapping);
    const consolidatedProjectCodes = Object.keys(processedTimesheet.consolidated_payload);
    
    console.log(`[Update Plan API] Available Xero projects: ${availableProjectCodes.length} [${availableProjectCodes.join(', ')}]`);
    console.log(`[Update Plan API] Consolidated payload projects: ${consolidatedProjectCodes.length} [${consolidatedProjectCodes.join(', ')}]`);
    
    // Find matches
    const matchingCodes = consolidatedProjectCodes.filter(code => availableProjectCodes.includes(code));
    const nonMatchingCodes = consolidatedProjectCodes.filter(code => !availableProjectCodes.includes(code));
    
    console.log(`[Update Plan API] 🎯 Matching projects: ${matchingCodes.length} [${matchingCodes.join(', ')}]`);
    console.log(`[Update Plan API] ❌ Non-matching projects: ${nonMatchingCodes.length} [${nonMatchingCodes.slice(0, 5).join(', ')}${nonMatchingCodes.length > 5 ? '...' : ''}]`);

    const projectActions: ProjectUpdateAction[] = [];
    const statistics = {
      totalProjects: consolidatedProjectCodes.length,
      projectsToUpdate: 0,
      projectsToSkip: 0,
      projectsNoMatch: 0,
      totalTasks: 0,
      tasksToUpdate: 0,
      tasksToSkip: 0,
      tasksMissing: 0
    };

    // Process each project in consolidated payload
    for (const [projectCode, tasks] of Object.entries(processedTimesheet.consolidated_payload)) {
      statistics.totalTasks += tasks.length;
      
      if (!projectCodeTaskMapping[projectCode]) {
        // Project not found in Xero INPROGRESS projects
        projectActions.push({
          action: 'no_match',
          projectCode,
          tasks: [],
          reason: 'Project code not found in INPROGRESS Xero projects',
          totalNewEstimate: tasks.reduce((sum, task) => sum + task.estimateMinutes, 0),
          totalNewRate: tasks.reduce((sum, task) => sum + task.rate.value, 0)
        });
        statistics.projectsNoMatch++;
        continue;
      }

      const projectData = projectCodeTaskMapping[projectCode];
      const projectInfo = projectData.projects[0];
      const taskActions: TaskUpdateAction[] = [];
      
      let projectTotalNewEstimate = 0;
      let projectTotalCurrentEstimate = 0;
      let projectTotalNewRate = 0;
      let projectTotalCurrentRate = 0;
      let hasUpdates = false;

      // Process each task for this project
      for (const consolidatedTask of tasks) {
        projectTotalNewEstimate += consolidatedTask.estimateMinutes;
        projectTotalNewRate += consolidatedTask.rate.value;

        if (!projectData.tasks[consolidatedTask.name]) {
          // Task doesn't exist in Xero project
          taskActions.push({
            action: 'missing_task',
            taskName: consolidatedTask.name,
            consolidatedTask,
            newEstimate: consolidatedTask.estimateMinutes,
            newRate: consolidatedTask.rate.value,
            reason: `Task "${consolidatedTask.name}" not found in Xero project`
          });
          statistics.tasksMissing++;
        } else {
          // Task exists - check if we need to update
          const xeroTask = projectData.tasks[consolidatedTask.name];
          
          // For now, assume we always update (since we don't have current estimates/rates from Xero)
          // In real implementation, you'd fetch current task details from Xero
          const currentEstimate = 0; // Would come from Xero API
          const currentRate = 0; // Would come from Xero API
          
          projectTotalCurrentEstimate += currentEstimate;
          projectTotalCurrentRate += currentRate;
          
          if (consolidatedTask.estimateMinutes !== currentEstimate || consolidatedTask.rate.value !== currentRate) {
            taskActions.push({
              action: 'update',
              taskName: consolidatedTask.name,
              taskId: xeroTask.taskId,
              consolidatedTask,
              currentEstimate,
              newEstimate: consolidatedTask.estimateMinutes,
              currentRate,
              newRate: consolidatedTask.rate.value,
              reason: 'Task estimates/rates differ from consolidated values'
            });
            statistics.tasksToUpdate++;
            hasUpdates = true;
          } else {
            taskActions.push({
              action: 'skip',
              taskName: consolidatedTask.name,
              taskId: xeroTask.taskId,
              consolidatedTask,
              currentEstimate,
              newEstimate: consolidatedTask.estimateMinutes,
              currentRate,
              newRate: consolidatedTask.rate.value,
              reason: 'Task already matches consolidated values'
            });
            statistics.tasksToSkip++;
          }
        }
      }

      // Determine project action
      const projectAction: ProjectUpdateAction = {
        action: hasUpdates ? 'update' : 'skip',
        projectCode,
        projectId: projectInfo?.projectId,
        projectName: projectInfo?.name,
        tasks: taskActions,
        reason: hasUpdates ? 'Project has tasks requiring updates' : 'All project tasks are up to date',
        totalNewEstimate: projectTotalNewEstimate,
        totalCurrentEstimate: projectTotalCurrentEstimate,
        totalNewRate: projectTotalNewRate,
        totalCurrentRate: projectTotalCurrentRate
      };

      projectActions.push(projectAction);
      
      if (hasUpdates) {
        statistics.projectsToUpdate++;
      } else {
        statistics.projectsToSkip++;
      }
    }

    // Generate CSV report
    const reportData = generateCSVReport(projectActions, processedTimesheet.metadata);

    const updatePlan: UpdatePlan = {
      statistics,
      projectActions,
      reportData
    };

    console.log(`[Update Plan API] Update plan generated:`, statistics);

    return NextResponse.json({
      success: true,
      updatePlan,
      summary: {
        message: `${statistics.projectsToUpdate} projects need updates, ${statistics.projectsToSkip} up to date (${statistics.projectsNoMatch} skipped - not found)`,
        readyForExecution: statistics.projectsToUpdate > 0,
        totalProjects: statistics.totalProjects,
        matchingProjects: statistics.projectsToUpdate + statistics.projectsToSkip
      }
    });

  } catch (error: any) {
    console.error('[Update Plan API] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to generate update plan'
    }, { status: 500 });
  }
} 