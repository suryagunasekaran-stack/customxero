import { NextResponse } from 'next/server';
import { ensureValidToken } from '@/lib/ensureXeroToken';
import { trackXeroApiCall } from '@/lib/xeroApiTracker';

const REQUIRED_TASKS = ['Manhour', 'Overtime', 'Supply Labour', 'Transport'];

// Get appropriate task configuration based on tenant
function getTaskConfigForTenant(tenantId: string, tenantName: string) {
  // Demo Company (Global) uses USD
  if (tenantId === "017d3bc6-65b9-4588-9746-acb7167a59f1" || tenantName.includes("Demo Company")) {
    console.log(`[Task Config] Using USD configuration for tenant: ${tenantName} (${tenantId})`);
    return {
      rate: {
        currency: "USD", 
        value: 1
      },
      chargeType: "FIXED",
      estimateMinutes: 1
    };
  }
  
  // BS E&I SERVICE PTE. LTD uses SGD
  if (tenantId === "6dd39ea4-e6a6-4993-a37a-21482ccf8d22" || tenantName.includes("BS E&I SERVICE")) {
    console.log(`[Task Config] Using SGD configuration for tenant: ${tenantName} (${tenantId})`);
    return {
      rate: {
        currency: "SGD", 
        value: 1
      },
      chargeType: "FIXED",
      estimateMinutes: 1
    };
  }
  
  // Default configuration for unknown tenants (USD)
  console.log(`[Task Config] Using default USD configuration for unknown tenant: ${tenantName} (${tenantId})`);
  return {
    rate: {
      currency: "USD", 
      value: 1
    },
    chargeType: "FIXED",
    estimateMinutes: 1
  };
}

// Task creation tracking
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

// Rate limiting tracking based on Xero's official limits
let requestsThisMinute = 0;
let lastMinuteReset = Date.now();

// Helper function to respect Xero's rate limits:
// - 5 concurrent calls per second
// - 60 calls per minute
// - 5,000 calls per day
async function respectXeroRateLimits() {
  const now = Date.now();
  
  // Reset minute counter if needed (60-second window)
  if (now - lastMinuteReset >= 60000) {
    requestsThisMinute = 0;
    lastMinuteReset = now;
  }
  
  // Check if we're approaching the 60 calls per minute limit
  if (requestsThisMinute >= 58) {
    const waitTime = 60000 - (now - lastMinuteReset);
    console.log(`[Xero Rate Limit] Approaching minute limit (${requestsThisMinute}/60), waiting ${waitTime}ms`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    requestsThisMinute = 0;
    lastMinuteReset = Date.now();
  }
  
  // Ensure we don't exceed 5 concurrent calls per second
  // Space requests to 250ms apart to stay well under concurrent limit
  await new Promise(resolve => setTimeout(resolve, 250));
  
  requestsThisMinute++;
  console.log(`[Xero Rate Limit] Request ${requestsThisMinute}/60 this minute`);
}

// Helper function to create missing tasks for a project
async function createMissingTasks(
  access_token: string, 
  effective_tenant_id: string, 
  projectId: string, 
  projectName: string,
  missingTasks: string[],
  tenantName: string = ''
): Promise<TaskCreationResult[]> {
  const results: TaskCreationResult[] = [];
  const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  for (const taskName of missingTasks) {
    try {
      await respectXeroRateLimits();
      
      const runTimestamp = Date.now();
      const idempotencyKey = `standardize-${projectId}-${taskName.replace(/\s+/g, '-').toLowerCase()}-${timestamp}-${runTimestamp}`;
      
      const taskConfig = getTaskConfigForTenant(effective_tenant_id, tenantName);
      const taskPayload = {
        name: taskName,
        ...taskConfig
      };
      
      console.log(`[Task Creation] Creating "${taskName}" for project "${projectName}" (${projectId})`);
      
      const response = await fetch(`https://api.xero.com/projects.xro/2.0/projects/${projectId}/tasks`, {
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

      // Track API call with actual rate limit data from Xero response headers
      await trackXeroApiCall(response.headers, effective_tenant_id);
      
      if (response.ok) {
        const createdTask = await response.json();
        console.log(`[Task Creation] ✅ Successfully created "${taskName}" for project "${projectName}"`);
        results.push({
          projectId,
          projectName,
          taskName,
          success: true,
          idempotencyKey
        });
      } else {
        const errorText = await response.text();
        console.error(`[Task Creation] ❌ Failed to create "${taskName}" for project "${projectName}": ${response.status} - ${errorText}`);
        results.push({
          projectId,
          projectName,
          taskName,
          success: false,
          error: `HTTP ${response.status}: ${errorText}`,
          idempotencyKey
        });
      }
      
    } catch (error) {
      console.error(`[Task Creation] ❌ Exception creating "${taskName}" for project "${projectName}":`, error);
      results.push({
        projectId,
        projectName,
        taskName,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  return results;
}

// Helper function to generate downloadable text report
function generateStandardizationReport(
  standardizationReports: StandardizationReport[],
  summary: any
): string {
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
  lines.push(`Projects Standardized: ${standardizationReports.filter(r => r.createdTasks.length > 0).length}`);
  lines.push(`Total Tasks Created: ${standardizationReports.reduce((sum, r) => sum + r.createdTasks.filter(t => t.success).length, 0)}`);
  lines.push(`Failed Task Creations: ${standardizationReports.reduce((sum, r) => sum + r.createdTasks.filter(t => !t.success).length, 0)}`);
  lines.push('');
  
  lines.push('REQUIRED TASKS:');
  lines.push('-'.repeat(40));
  REQUIRED_TASKS.forEach(task => lines.push(`• ${task}`));
  lines.push('');
  
  lines.push('DETAILED RESULTS:');
  lines.push('-'.repeat(40));
  
  standardizationReports.forEach((report, index) => {
    lines.push(`\n${index + 1}. ${report.projectName} (${report.projectId})`);
    
    if (report.failed) {
      lines.push(`   ❌ FAILED: ${report.errorMessage}`);
      return;
    }
    
    if (report.missingTasks.length === 0) {
      lines.push('   ✅ Already compliant - all required tasks present');
    } else {
      lines.push(`   📝 Missing tasks detected: ${report.missingTasks.join(', ')}`);
      
      report.createdTasks.forEach(task => {
        if (task.success) {
          lines.push(`   ✅ Created: "${task.taskName}"`);
        } else {
          lines.push(`   ❌ Failed to create: "${task.taskName}" - ${task.error}`);
        }
      });
    }
    
    lines.push(`   📊 Final state: ${report.existingTasks.length + report.createdTasks.filter(t => t.success).length}/${REQUIRED_TASKS.length} required tasks`);
  });
  
  lines.push('\n' + '='.repeat(80));
  lines.push('END OF REPORT');
  lines.push('='.repeat(80));
  
  return lines.join('\n');
}

interface Task {
  taskId: string;
  name: string;
  status: string;
  rate?: {
    amount: number;
    currency: string;
  };
  chargeType?: string;
}

interface ProjectWithTasks {
  projectId: string;
  projectName: string;
  status: string;
  tasks: Task[];
}

interface ProjectTaskAnalysis {
  projectId: string;
  projectName: string;
  status: string;
  missingTasks: string[];
  existingTasks: string[];
  totalTasks: number;
}

export async function GET() {
  console.log('[Check Project Tasks API] Received GET request for project tasks analysis.');

  try {
    const tokenData = await ensureValidToken();
    const { access_token, effective_tenant_id } = tokenData;
    console.log('[Check Project Tasks API] Successfully obtained Xero token and tenant ID.');

    // Step 1: Fetch all INPROGRESS projects with pagination
    const projectStates = 'INPROGRESS';
    let allProjects: any[] = [];
    let page = 1;
    const pageSize = 50;
    let hasMorePages = true;

    console.log('[Check Project Tasks API] Starting to fetch INPROGRESS projects...');

    while (hasMorePages) {
      await respectXeroRateLimits();
      
      const url = `https://api.xero.com/projects.xro/2.0/projects?states=${projectStates}&page=${page}&pageSize=${pageSize}`;
      console.log(`[Check Project Tasks API] Fetching projects from page ${page}: ${url}`);

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Xero-Tenant-Id': effective_tenant_id,
          'Accept': 'application/json',
        },
      });

      // Track API call with actual rate limit data from Xero response headers
      await trackXeroApiCall(response.headers, effective_tenant_id);

      if (!response.ok) {
        let errorBody = '';
        try {
          const jsonError = await response.json();
          errorBody = JSON.stringify(jsonError);
          console.error('[Check Project Tasks API] Xero API Error (JSON):', errorBody);
        } catch (e) {
          errorBody = await response.text();
          console.error('[Check Project Tasks API] Xero API Error (Text):', errorBody);
        }
        const errorMessage = errorBody || response.statusText || 'Unknown Xero API error';
        console.error('[Check Project Tasks API] Error fetching projects. Status:', response.status, 'Body:', errorMessage);
        throw new Error(`Xero API error: ${response.status} - ${errorMessage}`);
      }

      const data = await response.json();

      if (data && data.items && Array.isArray(data.items)) {
        allProjects = allProjects.concat(data.items);
        console.log(`[Check Project Tasks API] Fetched ${data.items.length} projects from page ${page}. Total so far: ${allProjects.length}`);
        
        if (data.items.length < pageSize) {
          hasMorePages = false;
        } else {
          page++;
        }
      } else {
        console.warn('[Check Project Tasks API] No items array in response or unexpected structure:', data);
        hasMorePages = false;
      }
    }

    console.log(`[Check Project Tasks API] Successfully fetched ${allProjects.length} INPROGRESS projects.`);

    // Step 2: Fetch tasks for each project and standardize
    console.log('[Check Project Tasks API] Starting to analyze and standardize projects...');
    const projectsWithTasks: ProjectWithTasks[] = [];
    const standardizationReports: StandardizationReport[] = [];
    let totalTasks = 0;
    let successfulProjectFetches = 0;
    let failedProjectFetches = 0;
    let totalTasksCreated = 0;

    for (const project of allProjects) {
      let retryCount = 0;
      let success = false;
      
      while (!success && retryCount <= 3) {
        try {
          await respectXeroRateLimits();
          
          const tasksUrl = `https://api.xero.com/projects.xro/2.0/projects/${project.projectId}/Tasks`;
          console.log(`[Check Project Tasks API] Fetching tasks for project "${project.name}" (${project.projectId}) - Attempt ${retryCount + 1}`);

          const tasksResponse = await fetch(tasksUrl, {
            headers: {
              'Authorization': `Bearer ${access_token}`,
              'Xero-Tenant-Id': effective_tenant_id,
              'Accept': 'application/json',
            },
          });

          // Track API call with actual rate limit data from Xero response headers
          await trackXeroApiCall(tasksResponse.headers, effective_tenant_id);

          if (!tasksResponse.ok) {
            if (tasksResponse.status === 429) {
              const rateLimitProblem = tasksResponse.headers.get('X-Rate-Limit-Problem');
              console.warn(`[Xero Rate Limit] Hit rate limit for project ${project.projectId}. Problem: ${rateLimitProblem || 'Unknown'}, Attempt: ${retryCount + 1}/3`);
              
              // Exponential backoff: 2^retryCount seconds (capped at 8 seconds)
              const backoffTime = Math.min(Math.pow(2, retryCount) * 1000, 8000);
              console.log(`[Xero Rate Limit] Waiting ${backoffTime}ms before retry`);
              await new Promise(resolve => setTimeout(resolve, backoffTime));
              
              retryCount++;
              continue; // Retry
            } else {
              throw new Error(`HTTP ${tasksResponse.status}: ${await tasksResponse.text()}`);
            }
          }

          const tasksData = await tasksResponse.json();
          const tasks = tasksData && tasksData.items ? tasksData.items : [];
          totalTasks += tasks.length;
          successfulProjectFetches++;

          projectsWithTasks.push({
            projectId: project.projectId,
            projectName: project.name,
            status: project.status,
            tasks: tasks,
          });

          console.log(`[Check Project Tasks API] Successfully fetched ${tasks.length} tasks for project "${project.name}"`);
          
          // Analyze and standardize this project immediately
          const projectTaskNames = tasks.map((task: any) => task.name.trim());
          const existingRequiredTasks = REQUIRED_TASKS.filter(requiredTask => 
            projectTaskNames.some((taskName: string) => 
              taskName.toLowerCase() === requiredTask.toLowerCase()
            )
          );
          const missingTasks = REQUIRED_TASKS.filter(requiredTask => 
            !projectTaskNames.some((taskName: string) => 
              taskName.toLowerCase() === requiredTask.toLowerCase()
            )
          );
          
          let createdTasks: TaskCreationResult[] = [];
          
          if (missingTasks.length > 0) {
            console.log(`[Standardization] Project "${project.name}" missing ${missingTasks.length} tasks: ${missingTasks.join(', ')}`);
            
            // Get tenant name for currency configuration
            const currentTenant = tokenData.available_tenants?.find((t: any) => t.tenantId === effective_tenant_id);
            const tenantName = currentTenant?.tenantName || '';
            
            createdTasks = await createMissingTasks(
              access_token,
              effective_tenant_id,
              project.projectId,
              project.name,
              missingTasks,
              tenantName
            );
            const successfulCreations = createdTasks.filter(t => t.success).length;
            totalTasksCreated += successfulCreations;
            console.log(`[Standardization] Created ${successfulCreations}/${missingTasks.length} missing tasks for project "${project.name}"`);
          } else {
            console.log(`[Standardization] Project "${project.name}" already compliant - all required tasks present`);
          }
          
          // Record standardization report
          standardizationReports.push({
            projectId: project.projectId,
            projectName: project.name,
            existingTasks: existingRequiredTasks,
            missingTasks: missingTasks,
            createdTasks: createdTasks,
            failed: false
          });
          
          success = true; // Exit retry loop
          
        } catch (error) {
          if (retryCount < 3) {
            retryCount++;
            console.warn(`[Check Project Tasks API] Error fetching tasks for project ${project.projectId}, retrying (${retryCount}/3):`, error);
            const backoffTime = Math.pow(2, retryCount - 1) * 1000;
            await new Promise(resolve => setTimeout(resolve, backoffTime));
          } else {
            console.error(`[Check Project Tasks API] Final error fetching tasks for project ${project.projectId}:`, error);
            failedProjectFetches++;
            projectsWithTasks.push({
              projectId: project.projectId,
              projectName: project.name,
              status: project.status,
              tasks: [],
            });
            
            // Record failed standardization
            standardizationReports.push({
              projectId: project.projectId,
              projectName: project.name,
              existingTasks: [],
              missingTasks: [],
              createdTasks: [],
              failed: true,
              errorMessage: error instanceof Error ? error.message : 'Unknown error'
            });
            
            success = true; // Exit retry loop
          }
        }
      }
    }

    console.log(`[Check Project Tasks API] Standardization complete. Success: ${successfulProjectFetches}, Failed: ${failedProjectFetches}, Total tasks fetched: ${totalTasks}, Total tasks created: ${totalTasksCreated}`);

    // Step 3: Analyze missing tasks with detailed breakdown
    console.log('[Check Project Tasks API] Analyzing projects for missing required tasks...');
    
    const projectsWithCompleteData: ProjectTaskAnalysis[] = [];
    const projectsWithMissingTasks: ProjectTaskAnalysis[] = [];
    const projectsWithAllTasks: ProjectTaskAnalysis[] = [];

    for (const project of projectsWithTasks) {
      const projectTaskNames = project.tasks.map(task => task.name.trim());
      const existingRequiredTasks = REQUIRED_TASKS.filter(requiredTask => 
        projectTaskNames.some(taskName => 
          taskName.toLowerCase() === requiredTask.toLowerCase()
        )
      );
      const missingTasks = REQUIRED_TASKS.filter(requiredTask => 
        !projectTaskNames.some(taskName => 
          taskName.toLowerCase() === requiredTask.toLowerCase()
        )
      );

      const analysis: ProjectTaskAnalysis = {
        projectId: project.projectId,
        projectName: project.projectName,
        status: project.status,
        missingTasks: missingTasks,
        existingTasks: existingRequiredTasks,
        totalTasks: project.tasks.length,
      };

      projectsWithCompleteData.push(analysis);

      if (missingTasks.length > 0) {
        projectsWithMissingTasks.push(analysis);
      } else {
        projectsWithAllTasks.push(analysis);
      }
    }

    // Generate task frequency analysis
    const taskFrequency: { [taskName: string]: number } = {};
    REQUIRED_TASKS.forEach(task => {
      taskFrequency[task] = projectsWithCompleteData.filter(project => 
        project.existingTasks.includes(task)
      ).length;
    });

    // Generate project status summary
    const statusSummary: { [status: string]: number } = {};
    allProjects.forEach(project => {
      const status = project.status || 'Unknown';
      statusSummary[status] = (statusSummary[status] || 0) + 1;
    });

    // Step 4: Generate comprehensive results
    const now = new Date();
    const reportDateTime = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;

    // Filter out projects missing exactly 4 tasks
    const projectsWithSomeMissingTasks = projectsWithMissingTasks.filter(project => 
      project.missingTasks.length !== 4
    );

    console.log(`[Check Project Tasks API] Projects with all tasks: ${projectsWithAllTasks.length}, Projects missing some tasks: ${projectsWithSomeMissingTasks.length}`);

    // Generate downloadable text report
    const currentTenant = tokenData.available_tenants?.find((t: any) => t.tenantId === effective_tenant_id);
    const currentTenantName = currentTenant?.tenantName || 'Unknown Tenant';
    
    const textReport = generateStandardizationReport(standardizationReports, {
      totalProjectsAnalyzed: allProjects.length,
      projectsWithAllRequiredTasks: standardizationReports.filter(r => !r.failed && r.missingTasks.length === 0).length,
      projectsStandardized: standardizationReports.filter(r => r.createdTasks.length > 0).length,
      totalTasksCreated: totalTasksCreated,
      tenantName: currentTenantName
    });

    const results = {
      analysisDateTime: reportDateTime,
      totalProjects: allProjects.length,
      totalTasks: totalTasks,
      totalTasksCreated: totalTasksCreated,
      successfulProjectFetches: successfulProjectFetches,
      failedProjectFetches: failedProjectFetches,
      requiredTasks: REQUIRED_TASKS,
      taskFrequency: taskFrequency,
      statusSummary: statusSummary,
      projectsWithMissingTasks: projectsWithSomeMissingTasks,
      projectsWithAllTasks: projectsWithAllTasks,
      projectsWithCompleteData: projectsWithCompleteData,
      standardizationReports: standardizationReports,
      downloadableReport: textReport,
      summary: {
        totalProjectsAnalyzed: allProjects.length,
        projectsMissingRequiredTasks: projectsWithSomeMissingTasks.length,
        projectsWithAllRequiredTasks: projectsWithAllTasks.length,
        projectsStandardized: standardizationReports.filter(r => r.createdTasks.length > 0).length,
        totalTasksCreated: totalTasksCreated,
        completionPercentage: allProjects.length > 0 ? 
          Math.round((projectsWithAllTasks.length / allProjects.length) * 100) : 0
      }
    };

    console.log('[Check Project Tasks API] Returning comprehensive analysis results.');
    return NextResponse.json(results);

  } catch (error) {
    console.error('[Check Project Tasks API] Overall error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ 
      message: 'Failed to analyze project tasks', 
      error: errorMessage 
    }, { status: 500 });
  }
} 