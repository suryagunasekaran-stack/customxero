import { NextRequest, NextResponse } from 'next/server';
import { ensureValidToken } from '@/lib/ensureXeroToken';
import { trackXeroApiCall } from '@/lib/xeroApiTracker';
import { SmartRateLimit } from '@/lib/smartRateLimit';
import { auth } from '@/lib/auth';
import { AuditLogger } from '@/lib/auditLogger';
import { randomUUID } from 'crypto';

// Standard tasks to create for each project
const STANDARD_TASKS = ['Manhour', 'Overtime', 'Internal Manpower', 'External Manpower', 'Transport'];

// Task configuration function similar to existing pattern
function getTaskConfigForTenant(tenantId: string, tenantName?: string) {
  // Special USD configuration for specific tenant
  if (tenantId === 'ab4b2a02-e700-4fe8-a32d-5419d4195e1b') {
    return {
      rate: { currency: "USD", value: 0.01 },
      chargeType: "FIXED",
      estimateMinutes: 1  // Minimum 1 minute required by Xero API
    };
  }
  
  // Default SGD configuration for all other tenants
  return {
    rate: { currency: "SGD", value: 0.01 },
    chargeType: "FIXED",
    estimateMinutes: 1  // Minimum 1 minute required by Xero API
  };
}

interface XeroProject {
  contactId: string;
  name: string;
  deadlineUtc?: string;
  estimateAmount?: number;
}

interface CreateProjectsRequest {
  projects: XeroProject[];
}

interface TaskCreationResult {
  taskName: string;
  success: boolean;
  error?: string;
  idempotencyKey?: string;
}

interface CreateResult {
  project: string;
  projectId: string;
  idempotencyKey?: string;
  success: boolean;
  tasksCreated?: TaskCreationResult[];
}

interface CreateError {
  project: string;
  error: string;
}

/**
 * Generate comprehensive project creation report for download
 */
function generateProjectCreationReport(
  results: CreateResult[],
  errors: CreateError[],
  totalProjects: number,
  tenantName?: string
): { filename: string; content: string } {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const filename = `project-creation-report-${timestamp}.csv`;
  
  const csvLines = [
    'Section,Project Name,Project ID,Tasks Created,Tasks Failed,Status,Details,Error'
  ];
  
  // Add metadata
  csvLines.push(`# Report Generated: ${new Date().toISOString()}`);
  csvLines.push(`# Tenant: ${tenantName || 'Current Selected Tenant'}`);
  csvLines.push(`# Total Projects Requested: ${totalProjects}`);
  csvLines.push(`# Projects Created Successfully: ${results.length}`);
  csvLines.push(`# Projects Failed: ${errors.length}`);
  csvLines.push(`# Success Rate: ${totalProjects > 0 ? ((results.length / totalProjects) * 100).toFixed(1) : 0}%`);
  csvLines.push('');
  
  // Add alert for failures
  if (errors.length > 0) {
    csvLines.push(`# ⚠️  ALERT: ${errors.length} project creation failure(s) detected!`);
    csvLines.push('');
  }
  
  // Section 1: Successfully Created Projects
  if (results.length > 0) {
    csvLines.push('# ✅ SUCCESSFULLY CREATED PROJECTS');
    csvLines.push('# These projects and their tasks were created successfully');
    results.forEach(result => {
      const tasksCreated = result.tasksCreated?.filter(t => t.success).length || 0;
      const tasksFailed = result.tasksCreated?.filter(t => !t.success).length || 0;
      const details = `${tasksCreated} tasks created${tasksFailed > 0 ? `, ${tasksFailed} tasks failed` : ''}`;
      
      csvLines.push(
        `"Success","${result.project}","${result.projectId}","${tasksCreated}","${tasksFailed}","Created","${details}","N/A"`
      );
      
      // Add task details if any tasks failed
      if (result.tasksCreated && tasksFailed > 0) {
        result.tasksCreated.filter(t => !t.success).forEach(task => {
          csvLines.push(
            `"Task Error","${result.project}","${result.projectId}","0","1","Task Failed","Task: ${task.taskName}","${task.error || 'Unknown task error'}"`
          );
        });
      }
    });
    csvLines.push('');
  }
  
  // Section 2: Failed Projects
  if (errors.length > 0) {
    csvLines.push('# ❌ FAILED PROJECT CREATIONS');
    csvLines.push('# These projects could not be created');
    errors.forEach(error => {
      csvLines.push(
        `"Failure","${error.project}","N/A","0","0","Failed","Project creation failed","${error.error}"`
      );
    });
    csvLines.push('');
  }
  
  // Add task summary if tasks were created
  const allTaskResults = results.flatMap(r => r.tasksCreated || []);
  if (allTaskResults.length > 0) {
    const totalTasks = allTaskResults.length;
    const successfulTasks = allTaskResults.filter(t => t.success).length;
    const failedTasks = totalTasks - successfulTasks;
    
    csvLines.push('# 📋 TASK CREATION SUMMARY');
    csvLines.push(`# Total Tasks: ${totalTasks}`);
    csvLines.push(`# Successful Tasks: ${successfulTasks}`);
    csvLines.push(`# Failed Tasks: ${failedTasks}`);
    csvLines.push(`# Task Success Rate: ${totalTasks > 0 ? ((successfulTasks / totalTasks) * 100).toFixed(1) : 0}%`);
    csvLines.push('');
  }
  
  // Add summary
  csvLines.push('# 📊 OVERALL SUMMARY');
  csvLines.push(`# Total Operations: ${totalProjects + allTaskResults.length}`);
  csvLines.push(`# Projects Created: ${results.length}/${totalProjects}`);
  csvLines.push(`# Tasks Created: ${allTaskResults.filter(t => t.success).length}/${allTaskResults.length}`);
  csvLines.push(`# Overall Success Rate: ${((results.length + allTaskResults.filter(t => t.success).length) / (totalProjects + allTaskResults.length) * 100).toFixed(1)}%`);
  
  return { filename, content: csvLines.join('\n') };
}

/**
 * POST /api/xero/projects/create - Create new Xero projects
 * Supports multiple project creation with idempotency keys
 */
export async function POST(request: NextRequest) {
  // Initialize audit logger
  const session = await auth();
  const { access_token, effective_tenant_id, available_tenants } = await ensureValidToken();
  const selectedTenant = available_tenants?.find(t => t.tenantId === effective_tenant_id);
  const auditLogger = new AuditLogger(session, effective_tenant_id, selectedTenant?.tenantName);
  
  let createLogId: string | null = null;
  
  try {
    const body: CreateProjectsRequest = await request.json();
    
    if (!body || !body.projects || !Array.isArray(body.projects)) {
      return NextResponse.json({ 
        error: 'Invalid payload. Expected { "projects": [...] }' 
      }, { status: 400 });
    }

    if (body.projects.length === 0) {
      return NextResponse.json({ 
        error: 'At least one project is required' 
      }, { status: 400 });
    }

    // Validate project data
    for (const project of body.projects) {
      if (!project.contactId || !project.name) {
        return NextResponse.json({ 
          error: 'Each project must have contactId and name' 
        }, { status: 400 });
      }
    }

    // Log the creation attempt
    createLogId = await auditLogger.startAction('PROJECT_UPDATE', {
      action: 'CREATE_PROJECTS',
      projectCount: body.projects.length,
      projectNames: body.projects.map(p => p.name)
    });

    console.log(`[Create Projects API] ============ STARTING PROJECT CREATION ============`);
    console.log(`[Create Projects API] Total projects to create: ${body.projects.length}`);
    console.log(`[Create Projects API] Tenant: ${selectedTenant?.tenantName || 'Current Selected'}`);
    console.log(`[Create Projects API] Projects: ${body.projects.map(p => p.name).join(', ')}`);

    const results: CreateResult[] = [];
    const errors: CreateError[] = [];

    // Process each project
    for (let i = 0; i < body.projects.length; i++) {
      const project = body.projects[i];
      
      try {
        await SmartRateLimit.waitIfNeeded();
        
        // Generate unique idempotency key for each project to prevent duplicates
        const idempotencyKey = randomUUID();
        
        const url = 'https://api.xero.com/projects.xro/2.0/Projects';
        
        // Prepare project data for Xero API
        const xeroProject: any = {
          contactId: project.contactId,
          name: project.name
        };
        
        // Add optional fields only if provided
        if (project.estimateAmount !== undefined) {
          xeroProject.estimateAmount = project.estimateAmount;
        }
        if (project.deadlineUtc) {
          xeroProject.deadlineUtc = project.deadlineUtc;
        }
        
        console.log(`[Create Projects API] Project ${i + 1}/${body.projects.length}: "${project.name}"`);
        console.log(`[Create Projects API] Idempotency Key: ${idempotencyKey}`);
        console.log(`[Create Projects API] Sending to Xero:`, JSON.stringify(xeroProject, null, 2));
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${access_token}`,
            'Xero-tenant-id': effective_tenant_id,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey
          },
          body: JSON.stringify(xeroProject)
        });

        await trackXeroApiCall(effective_tenant_id);
        SmartRateLimit.updateFromHeaders(response.headers);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[Create Projects API] Failed to create project "${project.name}":`, errorText);
          errors.push({
            project: project.name,
            error: `HTTP ${response.status}: ${errorText}`
          });
          continue;
        }

        const result = await response.json();
        const projectId = result.projectId;

        console.log(`[Create Projects API] ✅ Successfully created project "${project.name}" with ID: ${projectId}`);

        // Create standard tasks for the project
        const tasksCreated = await createStandardTasks(
          projectId,
          project.name,
          access_token,
          effective_tenant_id,
          selectedTenant?.tenantName
        );

        results.push({
          project: project.name,
          projectId: projectId,
          idempotencyKey: idempotencyKey,
          success: true,
          tasksCreated: tasksCreated
        });

        console.log(`[Create Projects API] ✅ Created ${tasksCreated.filter((t: TaskCreationResult) => t.success).length}/${tasksCreated.length} standard tasks for project "${project.name}"`);
        
      } catch (projectError: any) {
        console.error(`[Create Projects API] Error creating project "${project.name}":`, projectError);
        errors.push({
          project: project.name,
          error: projectError.message || 'Unknown error'
        });
      }
    }

    // Determine overall success
    const successCount = results.length;
    const errorCount = errors.length;
    const isOverallSuccess = successCount > 0;

    // Complete audit log
    if (createLogId) {
      await auditLogger.completeAction(
        createLogId,
        isOverallSuccess ? 'SUCCESS' : 'FAILURE',
        {
          projectCount: body.projects.length,
          successCount,
          errorCount,
          createdProjects: results.map(r => ({ name: r.project, id: r.projectId })),
          errors: errors
        },
        isOverallSuccess 
          ? `Successfully created ${successCount} of ${body.projects.length} projects`
          : `Failed to create any projects. ${errorCount} errors occurred.`
      );
    }

    // Generate comprehensive report
    const report = generateProjectCreationReport(results, errors, body.projects.length, selectedTenant?.tenantName);

    // Final validation logging
    console.log(`[Create Projects API] ============ PROJECT CREATION SUMMARY ============`);
    console.log(`[Create Projects API] Total projects requested: ${body.projects.length}`);
    console.log(`[Create Projects API] Projects created successfully: ${successCount}`);
    console.log(`[Create Projects API] Projects failed: ${errorCount}`);
    console.log(`[Create Projects API] Success rate: ${body.projects.length > 0 ? ((successCount / body.projects.length) * 100).toFixed(1) : 0}%`);
    
    // Task creation summary
    const allTaskResults = results.flatMap(r => r.tasksCreated || []);
    if (allTaskResults.length > 0) {
      const totalTasks = allTaskResults.length;
      const successfulTasks = allTaskResults.filter(t => t.success).length;
      const failedTasks = totalTasks - successfulTasks;
      console.log(`[Create Projects API] Total tasks attempted: ${totalTasks}`);
      console.log(`[Create Projects API] Tasks created successfully: ${successfulTasks}`);
      console.log(`[Create Projects API] Tasks failed: ${failedTasks}`);
      console.log(`[Create Projects API] Task success rate: ${totalTasks > 0 ? ((successfulTasks / totalTasks) * 100).toFixed(1) : 0}%`);
      
      if (failedTasks > 0) {
        console.log(`[Create Projects API] ⚠️  Task failures detected - see detailed results`);
      }
    }
    
    if (errorCount > 0) {
      console.log(`[Create Projects API] ⚠️  Project creation failures:`);
      errors.forEach(error => {
        console.log(`[Create Projects API]   - ${error.project}: ${error.error}`);
      });
    }
    
    console.log(`[Create Projects API] Report filename: ${report.filename}`);
    console.log(`[Create Projects API] ============ END PROJECT CREATION SUMMARY ============`);

    // Return response
    if (successCount === body.projects.length) {
      // All projects created successfully
      return NextResponse.json({
        success: true,
        message: `Successfully created ${successCount} project${successCount === 1 ? '' : 's'}`,
        results,
        summary: {
          total: body.projects.length,
          successful: successCount,
          failed: errorCount
        },
        downloadableReport: report
      });
    } else if (successCount > 0) {
      // Partial success
      return NextResponse.json({
        success: true,
        message: `Created ${successCount} of ${body.projects.length} projects. ${errorCount} failed.`,
        results,
        errors,
        summary: {
          total: body.projects.length,
          successful: successCount,
          failed: errorCount
        },
        downloadableReport: report
      }, { status: 207 }); // Multi-status
    } else {
      // Complete failure
      return NextResponse.json({
        success: false,
        message: `Failed to create all ${body.projects.length} projects`,
        errors,
        summary: {
          total: body.projects.length,
          successful: successCount,
          failed: errorCount
        },
        downloadableReport: report
      }, { status: 400 });
    }
    
  } catch (error: any) {
    console.error('[Create Projects API] Overall error:', error);
    
    // Complete audit log with failure
    if (createLogId) {
      await auditLogger.completeAction(
        createLogId,
        'FAILURE',
        {
          error: error.message
        },
        error.message
      );
    }
    
    return NextResponse.json({ 
      error: error.message || 'An error occurred while creating projects' 
    }, { status: 500 });
  }
}

/**
 * Create standard tasks for a newly created project
 */
async function createStandardTasks(
  projectId: string,
  projectName: string,
  accessToken: string,
  tenantId: string,
  tenantName?: string
): Promise<TaskCreationResult[]> {
  const taskResults: TaskCreationResult[] = [];
  const taskConfig = getTaskConfigForTenant(tenantId, tenantName);
  const timestamp = new Date().toISOString().split('T')[0];

  console.log(`[Create Projects API] Creating ${STANDARD_TASKS.length} standard tasks for project "${projectName}"`);

  for (const taskName of STANDARD_TASKS) {
    try {
      await SmartRateLimit.waitIfNeeded();

      const runTimestamp = Date.now();
      const idempotencyKey = `create-project-task-${projectId}-${taskName.replace(/\s+/g, '-').toLowerCase()}-${timestamp}-${runTimestamp}`;

      const taskPayload = {
        name: taskName,
        ...taskConfig
      };

      console.log(`[Create Projects API] Creating task "${taskName}" for project "${projectName}"`);

      const response = await fetch(`https://api.xero.com/projects.xro/2.0/projects/${projectId}/tasks`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Xero-Tenant-Id': tenantId,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey
        },
        body: JSON.stringify(taskPayload)
      });

      await trackXeroApiCall(tenantId);
      SmartRateLimit.updateFromHeaders(response.headers);

      if (response.ok) {
        taskResults.push({
          taskName,
          success: true,
          idempotencyKey
        });
        console.log(`[Create Projects API] ✅ Successfully created task "${taskName}"`);
      } else {
        const errorText = await response.text();
        console.error(`[Create Projects API] ❌ Failed to create task "${taskName}": ${errorText}`);
        taskResults.push({
          taskName,
          success: false,
          error: `HTTP ${response.status}: ${errorText}`,
          idempotencyKey
        });
      }

    } catch (taskError: any) {
      console.error(`[Create Projects API] ❌ Error creating task "${taskName}":`, taskError);
      taskResults.push({
        taskName,
        success: false,
        error: taskError.message || 'Unknown error'
      });
    }
  }

  return taskResults;
} 