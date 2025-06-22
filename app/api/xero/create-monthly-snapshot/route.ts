import { NextRequest, NextResponse } from 'next/server';
import { XeroProjectService } from '@/lib/xeroProjectService';
import { ensureValidToken } from '@/lib/ensureXeroToken';
import Decimal from 'decimal.js';

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
    rate: string;           // was: number
    estimatedCost: string;  // was: number
    actualCost: string;     // was: number
  }[];
  totals: {
    totalEstimateMinutes: number;
    totalActualMinutes: number;
    totalEstimatedCost: string;  // was: number
    totalActualCost: string;     // was: number
    wipValue: string;            // was: number
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
    totalWipValue: string;        // was: number
    totalEstimatedCost: string;   // was: number
    totalActualCost: string;      // was: number
  };
}

function calculateWipValue(estimatedCost: string, actualCost: string): string {
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
  lines.push(`Total WIP Value: $${snapshot.summary.totalWipValue}`);
  lines.push(`Total Estimated Cost: $${snapshot.summary.totalEstimatedCost}`);
  lines.push(`Total Actual Cost: $${snapshot.summary.totalActualCost}`);
  lines.push('');
  
  lines.push('PROJECT DETAILS:');
  lines.push('-'.repeat(40));
  
  snapshot.projectSnapshots.forEach((project, index) => {
    lines.push(`\n${index + 1}. ${project.projectName} (${project.projectCode})`);
    lines.push(`   Project ID: ${project.projectId}`);
    lines.push(`   WIP Value: $${project.totals.wipValue}`);
    lines.push(`   Estimated: ${project.totals.totalEstimateMinutes} min @ $${project.totals.totalEstimatedCost}`);
    lines.push(`   Actual: ${project.totals.totalActualMinutes} min @ $${project.totals.totalActualCost}`);
    
    if (project.tasks.length > 0) {
      lines.push('   Tasks:');
      project.tasks.forEach(task => {
        lines.push(`     - ${task.taskName}: ${task.actualMinutes}/${task.estimateMinutes} min, $${task.actualCost}/$${task.estimatedCost}`);
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
      csvLines.push(`"${project.projectCode}","${project.projectName}","N/A",0,0,0,0,${project.totals.wipValue}`);
    } else {
      project.tasks.forEach(task => {
        csvLines.push(`"${project.projectCode}","${project.projectName}","${task.taskName}",${task.estimateMinutes},${task.actualMinutes},${task.estimatedCost},${task.actualCost},${task.actualCost}`);
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
    let totalWipValue = new Decimal(0);
    let totalEstimatedCost = new Decimal(0);
    let totalActualCost = new Decimal(0);
    
    for (const project of projectData.projects) {
      // Since we don't fetch tasks or time entries anymore, we'll use project-level data
      // from the Xero Projects API response for WIP calculations
      const taskSnapshots: any[] = []; // No task-level data available
      
      // Use project-level financial data from Xero API for WIP calculation
      const totalTaskAmount = new Decimal(project.totalTaskAmount?.value || "0.00");
      const totalExpenseAmount = new Decimal(project.totalExpenseAmount?.value || "0.00");
      const totalInvoiced = new Decimal(project.totalInvoiced?.value || "0.00");
      const totalToBeInvoiced = new Decimal(project.totalToBeInvoiced?.value || "0.00");
      
      // Calculate project totals using project-level Xero data
      const totals = {
        totalEstimateMinutes: 0, // Not available at project level
        totalActualMinutes: project.minutesLogged || 0,
        totalEstimatedCost: project.estimate?.value || "0.00",
        totalActualCost: totalTaskAmount.plus(totalExpenseAmount).toFixed(2),
        wipValue: "0.00"
      };
      
      // WIP = Work completed but not yet invoiced
      totals.wipValue = totalToBeInvoiced.toFixed(2);
      
      totalWipValue = totalWipValue.plus(totals.wipValue);
      totalEstimatedCost = totalEstimatedCost.plus(totals.totalEstimatedCost);
      totalActualCost = totalActualCost.plus(totals.totalActualCost);
      
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
        totalWipValue: totalWipValue.toFixed(2),
        totalEstimatedCost: totalEstimatedCost.toFixed(2),
        totalActualCost: totalActualCost.toFixed(2)
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