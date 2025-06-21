import { NextResponse } from 'next/server';
import { XeroProjectService } from '@/lib/xeroProjectService';
import { ensureValidToken } from '@/lib/ensureXeroToken';
import { trackXeroApiCall } from '@/lib/xeroApiTracker';
import { SmartRateLimit } from '@/lib/smartRateLimit';

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

interface TaskCreationResult {
  projectId: string;
  projectName: string;
  taskName: string;
  success: boolean;
  error?: string;
  idempotencyKey?: string;
}

interface StandardizationReport {
  projectId: string;
  projectName: string;
  existingTasks: string[];
  missingTasks: string[];
  createdTasks: TaskCreationResult[];
  failed: boolean;
  errorMessage?: string;
}

export async function GET() {
  console.log('[Check Project Tasks API] Starting project task compliance analysis');
  
  try {
    const { access_token, effective_tenant_id } = await ensureValidToken();
    
    // Get all project data from cache or fetch fresh
    const projectData = await XeroProjectService.getProjectData();
    console.log(`[Check Project Tasks API] Analyzing ${projectData.projects.length} projects`);
    
    const analysisDateTime = new Date().toISOString();
    const standardizationReports: StandardizationReport[] = [];
    const taskFrequency: { [taskName: string]: number } = {};
    
    // Initialize task frequency counter
    REQUIRED_TASKS.forEach(task => {
      taskFrequency[task] = 0;
    });
    
    // Analyze each project
    // Since we no longer fetch existing tasks, we assume all projects need all required tasks
    for (const project of projectData.projects) {
      // We'll assume all tasks are missing since we don't fetch existing tasks anymore
      const existingRequiredTasks: string[] = []; // No existing tasks since we don't fetch them
      const missingRequiredTasks = [...REQUIRED_TASKS]; // All tasks are considered missing
      
      // Update task frequency
      existingRequiredTasks.forEach(task => {
        taskFrequency[task]++;
      });
      
      // Create report for this project
      const report: StandardizationReport = {
        projectId: project.projectId,
        projectName: project.name,
        existingTasks: existingRequiredTasks,
        missingTasks: missingRequiredTasks,
        createdTasks: [],
        failed: false
      };
      
      // If project is missing tasks, create them
      if (missingRequiredTasks.length > 0) {
        console.log(`[Check Project Tasks API] Project "${project.name}" missing ${missingRequiredTasks.length} required tasks`);
        
        const taskConfig = getTaskConfigForTenant(effective_tenant_id, projectData.tenantName);
        const timestamp = new Date().toISOString().split('T')[0];
        
        for (const taskName of missingRequiredTasks) {
          try {
            await SmartRateLimit.waitIfNeeded();
            
            const runTimestamp = Date.now();
            const idempotencyKey = `standardize-${project.projectId}-${taskName.replace(/\s+/g, '-').toLowerCase()}-${timestamp}-${runTimestamp}`;
            
            const taskPayload = {
              name: taskName,
              ...taskConfig
            };
            
            const response = await fetch(`https://api.xero.com/projects.xro/2.0/projects/${project.projectId}/tasks`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${access_token}`,
                'Xero-Tenant-Id': effective_tenant_id,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Idempotency-Key': idempotencyKey
              },
              body: JSON.stringify(taskPayload)
            });

            await trackXeroApiCall(response.headers, effective_tenant_id);
            SmartRateLimit.updateFromHeaders(response.headers);
            
            if (response.ok) {
              report.createdTasks.push({
                projectId: project.projectId,
                projectName: project.name,
                taskName,
                success: true,
                idempotencyKey
              });
              // Update frequency since task was created
              taskFrequency[taskName]++;
            } else {
              const errorText = await response.text();
              report.createdTasks.push({
                projectId: project.projectId,
                projectName: project.name,
                taskName,
                success: false,
                error: `HTTP ${response.status}: ${errorText}`,
                idempotencyKey
              });
              report.failed = true;
            }
            
          } catch (error) {
            report.createdTasks.push({
              projectId: project.projectId,
              projectName: project.name,
              taskName,
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
            report.failed = true;
          }
        }
      }
      
      standardizationReports.push(report);
    }
    
    // Clear cache if tasks were created
    const totalTasksCreated = standardizationReports.reduce((sum, report) => 
      sum + report.createdTasks.filter(task => task.success).length, 0
    );
    
    if (totalTasksCreated > 0) {
      console.log(`[Check Project Tasks API] ${totalTasksCreated} tasks created, cache would be cleared in old system`);
    }
    
    // Calculate summary statistics
    const projectsWithAllTasks = standardizationReports.filter(report => 
      report.missingTasks.length === 0 || 
      (report.createdTasks.length > 0 && report.createdTasks.every(task => task.success))
    );
    
    const projectsWithMissingTasks = standardizationReports.filter(report => 
      report.missingTasks.length > 0 && 
      (report.createdTasks.length === 0 || report.createdTasks.some(task => !task.success))
    );
    
    const summary = {
      totalProjectsAnalyzed: projectData.projects.length,
      projectsWithAllRequiredTasks: projectsWithAllTasks.length,
      projectsMissingRequiredTasks: projectsWithMissingTasks.length,
      completionPercentage: Math.round((projectsWithAllTasks.length / projectData.projects.length) * 100),
      totalTasksCreated,
      projectsStandardized: new Set(standardizationReports
        .filter(r => r.createdTasks.some(t => t.success))
        .map(r => r.projectId)).size,
      tenantName: projectData.tenantName
    };
    
    // Generate downloadable report
    const downloadableReport = generateStandardizationReport(standardizationReports, summary);
    
    const response = {
      success: true,
      analysisDateTime,
      requiredTasks: REQUIRED_TASKS,
      totalProjects: projectData.projects.length,
      summary,
      taskFrequency,
      standardizationReports,
      projectsWithAllTasks: projectsWithAllTasks.map(r => ({
        projectId: r.projectId,
        projectName: r.projectName,
        totalTasks: 0, // We don't fetch existing tasks anymore
        existingTasks: r.existingTasks
      })),
      projectsWithMissingTasks: projectsWithMissingTasks.map(r => ({
        projectId: r.projectId,
        projectName: r.projectName,
        status: 'INPROGRESS',
        totalTasks: 0, // We don't fetch existing tasks anymore
        existingTasks: r.existingTasks,
        missingTasks: r.missingTasks
      })),
      downloadableReport: downloadableReport.content,
      successfulProjectFetches: projectData.projects.length,
      failedProjectFetches: 0,
      totalTasks: 0 // We don't fetch existing tasks anymore
    };
    
    return NextResponse.json(response);
    
  } catch (error: any) {
    console.error('[Check Project Tasks API] Error:', error);
    return NextResponse.json({ 
      success: false,
      error: error.message || 'Unknown error occurred'
    }, { status: 500 });
  }
}

// Helper function to generate downloadable text report
function generateStandardizationReport(
  standardizationReports: StandardizationReport[],
  summary: any
): { filename: string; content: string } {
  const timestamp = new Date().toLocaleString();
  const lines: string[] = [];
  
  lines.push('='.repeat(80));
  lines.push('PROJECT STANDARDIZATION REPORT');
  lines.push('='.repeat(80));
  lines.push(`Generated: ${timestamp}`);
  lines.push(`Tenant: ${summary.tenantName || '[Current Selected Tenant]'}`);
  lines.push('');
  
  lines.push('SUMMARY:');
  lines.push('-'.repeat(40));
  lines.push(`Total Projects Analyzed: ${summary.totalProjectsAnalyzed}`);
  lines.push(`Projects Already Compliant: ${summary.projectsWithAllRequiredTasks}`);
  lines.push(`Projects Standardized: ${summary.projectsStandardized}`);
  lines.push(`Total Tasks Created: ${summary.totalTasksCreated}`);
  lines.push(`Overall Compliance: ${summary.completionPercentage}%`);
  lines.push('');
  
  if (summary.totalTasksCreated > 0) {
    lines.push('STANDARDIZATION ACTIONS:');
    lines.push('-'.repeat(40));
    
    standardizationReports
      .filter(r => r.createdTasks.length > 0)
      .forEach(report => {
        lines.push(`\nProject: ${report.projectName}`);
        lines.push(`ID: ${report.projectId}`);
        
        const successfulTasks = report.createdTasks.filter(t => t.success);
        const failedTasks = report.createdTasks.filter(t => !t.success);
        
        if (successfulTasks.length > 0) {
          lines.push(`✓ Created Tasks: ${successfulTasks.map(t => t.taskName).join(', ')}`);
        }
        
        if (failedTasks.length > 0) {
          lines.push(`✗ Failed Tasks:`);
          failedTasks.forEach(task => {
            lines.push(`  - ${task.taskName}: ${task.error}`);
          });
        }
      });
  }
  
  lines.push('');
  lines.push('='.repeat(80));
  lines.push('END OF REPORT');
  lines.push('='.repeat(80));
  
  const dateStr = new Date().toISOString().split('T')[0];
  return {
    filename: `standardization-report-${dateStr}.txt`,
    content: lines.join('\n')
  };
} 