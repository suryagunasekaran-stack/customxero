import { NextRequest, NextResponse } from 'next/server';
import { XeroProjectService } from '@/lib/xeroProjectService';
import { ensureValidToken } from '@/lib/ensureXeroToken';

interface ProjectSnapshot {
  projectId: string;
  projectName: string;
  projectCode: string;
  snapshotDate: string;
  tasks: {
    taskId: string;
    taskName: string;
    estimateMinutes: number;
    actualMinutes: number;
    rate: number;
    estimatedCost: number;
    actualCost: number;
  }[];
  totals: {
    totalEstimateMinutes: number;
    totalActualMinutes: number;
    totalEstimatedCost: number;
    totalActualCost: number;
    wipValue: number;
  };
}

interface MonthlySnapshot {
  snapshotId: string;
  tenantId: string;
  tenantName: string;
  snapshotDate: string;
  month: string;
  year: number;
  projectSnapshots: ProjectSnapshot[];
  summary: {
    totalProjects: number;
    totalWipValue: number;
    totalEstimatedCost: number;
    totalActualCost: number;
  };
}

function calculateWipValue(estimatedCost: number, actualCost: number): number {
  // WIP = Work completed but not yet billed
  // For now, we'll use actual cost as WIP value
  // This can be adjusted based on business rules
  return actualCost;
}

function generateSnapshotReport(snapshot: MonthlySnapshot): { filename: string; content: string } {
  const lines: string[] = [];
  
  lines.push('='.repeat(80));
  lines.push('MONTHLY WIP SNAPSHOT REPORT');
  lines.push('='.repeat(80));
  lines.push(`Snapshot Date: ${snapshot.snapshotDate}`);
  lines.push(`Period: ${snapshot.month} ${snapshot.year}`);
  lines.push(`Tenant: ${snapshot.tenantName}`);
  lines.push('');
  
  lines.push('SUMMARY:');
  lines.push('-'.repeat(40));
  lines.push(`Total Projects: ${snapshot.summary.totalProjects}`);
  lines.push(`Total WIP Value: $${(snapshot.summary.totalWipValue / 100).toFixed(2)}`);
  lines.push(`Total Estimated Cost: $${(snapshot.summary.totalEstimatedCost / 100).toFixed(2)}`);
  lines.push(`Total Actual Cost: $${(snapshot.summary.totalActualCost / 100).toFixed(2)}`);
  lines.push('');
  
  lines.push('PROJECT DETAILS:');
  lines.push('-'.repeat(40));
  
  snapshot.projectSnapshots.forEach((project, index) => {
    lines.push(`\n${index + 1}. ${project.projectName} (${project.projectCode})`);
    lines.push(`   Project ID: ${project.projectId}`);
    lines.push(`   WIP Value: $${(project.totals.wipValue / 100).toFixed(2)}`);
    lines.push(`   Estimated: ${project.totals.totalEstimateMinutes} min @ $${(project.totals.totalEstimatedCost / 100).toFixed(2)}`);
    lines.push(`   Actual: ${project.totals.totalActualMinutes} min @ $${(project.totals.totalActualCost / 100).toFixed(2)}`);
    
    if (project.tasks.length > 0) {
      lines.push('   Tasks:');
      project.tasks.forEach(task => {
        lines.push(`     - ${task.taskName}: ${task.actualMinutes}/${task.estimateMinutes} min, $${(task.actualCost / 100).toFixed(2)}/$${(task.estimatedCost / 100).toFixed(2)}`);
      });
    }
  });
  
  lines.push('');
  lines.push('='.repeat(80));
  lines.push('END OF SNAPSHOT');
  lines.push('='.repeat(80));
  
  const filename = `wip-snapshot-${snapshot.year}-${snapshot.month.toLowerCase()}.csv`;
  
  // Also generate CSV format for easier analysis
  const csvLines = [
    'Project Code,Project Name,Task Name,Estimated Minutes,Actual Minutes,Estimated Cost,Actual Cost,WIP Value'
  ];
  
  snapshot.projectSnapshots.forEach(project => {
    if (project.tasks.length === 0) {
      csvLines.push(`"${project.projectCode}","${project.projectName}","N/A",0,0,0,0,${project.totals.wipValue / 100}`);
    } else {
      project.tasks.forEach(task => {
        csvLines.push(`"${project.projectCode}","${project.projectName}","${task.taskName}",${task.estimateMinutes},${task.actualMinutes},${task.estimatedCost / 100},${task.actualCost / 100},${task.actualCost / 100}`);
      });
    }
  });
  
  return {
    filename,
    content: lines.join('\n') + '\n\n--- CSV DATA ---\n\n' + csvLines.join('\n')
  };
}

export async function POST(request: NextRequest) {
  console.log('[Monthly Snapshot API] Creating monthly WIP snapshot');
  
  try {
    const { effective_tenant_id } = await ensureValidToken();
    
    // Get optional parameters from request body
    const body = await request.json().catch(() => ({}));
    const { month, year } = body;
    
    // Use current month/year if not provided
    const now = new Date();
    const targetMonth = month || now.toLocaleString('default', { month: 'long' });
    const targetYear = year || now.getFullYear();
    
    // Get all project data
    const projectData = await XeroProjectService.getProjectData();
    console.log(`[Monthly Snapshot API] Processing ${projectData.projects.length} projects for snapshot`);
    
    const snapshotDate = new Date().toISOString();
    const snapshotId = `snapshot-${effective_tenant_id}-${targetYear}-${targetMonth.toLowerCase()}-${Date.now()}`;
    
    // Process each project
    const projectSnapshots: ProjectSnapshot[] = [];
    let totalWipValue = 0;
    let totalEstimatedCost = 0;
    let totalActualCost = 0;
    
    for (const project of projectData.projects) {
      const tasks = projectData.projectTasks[project.projectId] || [];
      const timeEntries = projectData.timeEntries[project.projectId] || [];
      
      const taskSnapshots = tasks.map(task => {
        // Calculate actual minutes from time entries
        const taskTimeEntries = timeEntries.filter(entry => entry.taskId === task.taskId);
        const actualMinutes = taskTimeEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0);
        
        const estimateMinutes = task.estimateMinutes || 0;
        const rate = task.rate?.value || 0;
        const estimatedCost = (estimateMinutes * rate) / 60; // Convert to hourly rate
        const actualCost = (actualMinutes * rate) / 60;
        
        return {
          taskId: task.taskId,
          taskName: task.name,
          estimateMinutes,
          actualMinutes,
          rate,
          estimatedCost,
          actualCost
        };
      });
      
      // Calculate project totals
      const totals = {
        totalEstimateMinutes: taskSnapshots.reduce((sum, task) => sum + task.estimateMinutes, 0),
        totalActualMinutes: taskSnapshots.reduce((sum, task) => sum + task.actualMinutes, 0),
        totalEstimatedCost: taskSnapshots.reduce((sum, task) => sum + task.estimatedCost, 0),
        totalActualCost: taskSnapshots.reduce((sum, task) => sum + task.actualCost, 0),
        wipValue: 0
      };
      
      totals.wipValue = calculateWipValue(totals.totalEstimatedCost, totals.totalActualCost);
      
      totalWipValue += totals.wipValue;
      totalEstimatedCost += totals.totalEstimatedCost;
      totalActualCost += totals.totalActualCost;
      
      projectSnapshots.push({
        projectId: project.projectId,
        projectName: project.name,
        projectCode: project.projectCode || '',
        snapshotDate,
        tasks: taskSnapshots,
        totals
      });
    }
    
    // Create snapshot object
    const snapshot: MonthlySnapshot = {
      snapshotId,
      tenantId: effective_tenant_id,
      tenantName: projectData.tenantName,
      snapshotDate,
      month: targetMonth,
      year: targetYear,
      projectSnapshots,
      summary: {
        totalProjects: projectSnapshots.length,
        totalWipValue,
        totalEstimatedCost,
        totalActualCost
      }
    };
    
    // Generate report
    const report = generateSnapshotReport(snapshot);
    
    // TODO: In a production environment, you would save this snapshot to a database
    // For now, we'll just return it
    
    console.log(`[Monthly Snapshot API] Snapshot created successfully with ${projectSnapshots.length} projects`);
    
    return NextResponse.json({
      success: true,
      snapshot,
      downloadableReport: report
    });
    
  } catch (error: any) {
    console.error('[Monthly Snapshot API] Error:', error);
    return NextResponse.json({ 
      success: false,
      error: error.message || 'Failed to create monthly snapshot'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  // This could be implemented to retrieve historical snapshots
  return NextResponse.json({
    message: 'Use POST to create a new snapshot. Historical snapshot retrieval not yet implemented.'
  });
} 