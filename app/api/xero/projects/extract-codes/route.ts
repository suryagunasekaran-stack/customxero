import { NextResponse } from 'next/server';
import { ensureValidToken } from '@/lib/ensureXeroToken';
import { trackXeroApiCall } from '@/lib/xeroApiTracker';

// Extract project code from project name (text before "-")
function extractProjectCode(projectName: string): string {
  const parts = projectName.split('-');
  return parts[0].trim();
}

export async function GET() {
  console.log('[Extract Project Codes API] Received GET request for project code extraction.');

  try {
    const { access_token, effective_tenant_id } = await ensureValidToken();
    console.log('[Extract Project Codes API] Successfully obtained Xero token and tenant ID.');

    if (!access_token || !effective_tenant_id) {
      return NextResponse.json({ error: 'Not authenticated or tenant ID missing' }, { status: 401 });
    }

    // Fetch INPROGRESS projects with pagination
    console.log('[Extract Project Codes API] Fetching INPROGRESS projects...');
    let allProjects: any[] = [];
    let page = 1;
    const pageSize = 50;
    let hasMorePages = true;

    while (hasMorePages) {
      const url = `https://api.xero.com/projects.xro/2.0/projects?states=INPROGRESS&page=${page}&pageSize=${pageSize}`;
      console.log(`[Extract Project Codes API] Fetching projects from page ${page}: ${url}`);

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Xero-Tenant-Id': effective_tenant_id,
          'Accept': 'application/json',
        },
      });

      // Track API call
      await trackXeroApiCall(response.headers, effective_tenant_id);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.error('[Extract Project Codes API] Error fetching projects:', response.status, errorData);
        throw new Error(`Failed to fetch projects: ${response.status} - ${errorData.message || 'Unknown error'}`);
      }

      const data = await response.json();

      if (data && data.items && Array.isArray(data.items)) {
        allProjects = allProjects.concat(data.items);
        console.log(`[Extract Project Codes API] Fetched ${data.items.length} projects from page ${page}. Total so far: ${allProjects.length}`);
        
        if (data.items.length < pageSize) {
          hasMorePages = false;
        } else {
          page++;
        }
      } else {
        console.warn('[Extract Project Codes API] No items array in response or unexpected structure:', data);
        hasMorePages = false;
      }
    }

    console.log(`[Extract Project Codes API] Successfully fetched ${allProjects.length} INPROGRESS projects.`);

    // FOR TESTING: Limit to first 3 projects to avoid rate limits
    const testingLimit = 3;
    const projectsToProcess = allProjects.slice(0, testingLimit);
    console.log(`[Extract Project Codes API] FOR TESTING: Processing only first ${projectsToProcess.length} projects (limited from ${allProjects.length})`);

    // Extract project codes and create mapping
    const projectCodeMapping: { [code: string]: any[] } = {};
    const projectDetails = projectsToProcess.map(project => {
      const projectCode = extractProjectCode(project.name);
      
      // Group projects by code to detect duplicates
      if (!projectCodeMapping[projectCode]) {
        projectCodeMapping[projectCode] = [];
      }
      projectCodeMapping[projectCode].push(project);

      return {
        projectId: project.projectId,
        projectName: project.name,
        projectCode: projectCode,
        status: project.status,
        contactId: project.contactId || null,
        deadlineUtc: project.deadlineUtc || null
      };
    });

    // Analyze project codes
    const uniqueProjectCodes = Object.keys(projectCodeMapping);
    const duplicateCodes = Object.entries(projectCodeMapping)
      .filter(([code, projects]) => projects.length > 1)
      .map(([code, projects]) => ({
        code,
        count: projects.length,
        projects: projects.map(p => ({ id: p.projectId, name: p.name }))
      }));

    console.log(`[Extract Project Codes API] Extracted ${uniqueProjectCodes.length} unique project codes from ${allProjects.length} projects.`);
    if (duplicateCodes.length > 0) {
      console.log(`[Extract Project Codes API] Found ${duplicateCodes.length} duplicate project codes.`);
    }

    // Step 2: Fetch tasks and time entries for each project and create comprehensive mapping
    console.log('[Extract Project Codes API] Fetching tasks and time entries for each project...');
    
    const projectCodeTaskMapping: { [code: string]: { 
      projects: any[]; 
      tasks: { [taskName: string]: { taskId: string; projectId: string; projectName: string } };
      timeEntries: { [taskName: string]: any[] }
    } } = {};
    
    let totalTasksFetched = 0;
    let successfulTaskFetches = 0;
    let failedTaskFetches = 0;
    let totalTimeEntriesFetched = 0;
    let successfulTimeEntryFetches = 0;
    let failedTimeEntryFetches = 0;

    // Process each unique project code
    for (const [projectCode, projects] of Object.entries(projectCodeMapping)) {
      console.log(`[Extract Project Codes API] Processing tasks for project code: ${projectCode} (${projects.length} projects)`);
      
      projectCodeTaskMapping[projectCode] = {
        projects: projects,
        tasks: {},
        timeEntries: {}
      };

      // For each project with this code, fetch its tasks
      for (const project of projects) {
        try {
          // Add more conservative delay to respect rate limits (1 second between calls)
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const tasksUrl = `https://api.xero.com/projects.xro/2.0/projects/${project.projectId}/Tasks`;
          console.log(`[Extract Project Codes API] Fetching tasks for project "${project.name}" (${project.projectId})`);

          const tasksResponse = await fetch(tasksUrl, {
            headers: {
              'Authorization': `Bearer ${access_token}`,
              'Xero-Tenant-Id': effective_tenant_id,
              'Accept': 'application/json',
            },
          });

          // Track API call
          await trackXeroApiCall(tasksResponse.headers, effective_tenant_id);

          if (!tasksResponse.ok) {
            console.error(`[Extract Project Codes API] Failed to fetch tasks for project ${project.projectId}: ${tasksResponse.status}`);
            failedTaskFetches++;
            continue;
          }

          const tasksData = await tasksResponse.json();
          const tasks = tasksData.items || [];
          totalTasksFetched += tasks.length;
          successfulTaskFetches++;

          // Add tasks to the mapping
          tasks.forEach((task: any) => {
            if (task.name && task.taskId) {
              // Use task name as key, store task details
              projectCodeTaskMapping[projectCode].tasks[task.name] = {
                taskId: task.taskId,
                projectId: project.projectId,
                projectName: project.name
              };
            }
          });

          console.log(`[Extract Project Codes API] Fetched ${tasks.length} tasks for project "${project.name}"`);

          // Step 2.2: Fetch time entries for the project (at project level, not task level)
          try {
            // Add more conservative delay to respect rate limits (1.5 seconds between calls)
            await new Promise(resolve => setTimeout(resolve, 1500));

            const timeEntriesUrl = `https://api.xero.com/projects.xro/2.0/Projects/${project.projectId}/Time`;
            console.log(`[Extract Project Codes API] Fetching time entries for project "${project.name}" (${project.projectId})`);

            const timeEntriesResponse = await fetch(timeEntriesUrl, {
              headers: {
                'Authorization': `Bearer ${access_token}`,
                'Xero-Tenant-Id': effective_tenant_id,
                'Accept': 'application/json',
              },
            });

            // Track API call
            await trackXeroApiCall(timeEntriesResponse.headers, effective_tenant_id);

            if (!timeEntriesResponse.ok) {
              if (timeEntriesResponse.status === 404) {
                // 404 likely means this project has no time entries, which is normal
                console.log(`[Extract Project Codes API] No time entries found for project "${project.name}" (404 - normal if no entries exist)`);
                successfulTimeEntryFetches++;
                
                // Initialize empty arrays for all tasks
                tasks.forEach((task: any) => {
                  if (task.name && !projectCodeTaskMapping[projectCode].timeEntries[task.name]) {
                    projectCodeTaskMapping[projectCode].timeEntries[task.name] = [];
                  }
                });
              } else {
                console.error(`[Extract Project Codes API] Failed to fetch time entries for project ${project.projectId}: ${timeEntriesResponse.status}`);
                failedTimeEntryFetches++;
              }
            } else {
              const timeEntriesData = await timeEntriesResponse.json();
              const timeEntries = timeEntriesData.items || [];
              totalTimeEntriesFetched += timeEntries.length;
              successfulTimeEntryFetches++;

              console.log(`[Extract Project Codes API] Fetched ${timeEntries.length} time entries for project "${project.name}"`);

              // Initialize empty arrays for all tasks first
              tasks.forEach((task: any) => {
                if (task.name && !projectCodeTaskMapping[projectCode].timeEntries[task.name]) {
                  projectCodeTaskMapping[projectCode].timeEntries[task.name] = [];
                }
              });

              // Group time entries by task using taskId
              timeEntries.forEach((timeEntry: any) => {
                // Find the task name for this time entry's taskId
                const matchingTask = tasks.find((task: any) => task.taskId === timeEntry.taskId);
                const taskName = matchingTask ? matchingTask.name : 'Unknown Task';

                // Initialize array if doesn't exist
                if (!projectCodeTaskMapping[projectCode].timeEntries[taskName]) {
                  projectCodeTaskMapping[projectCode].timeEntries[taskName] = [];
                }

                // Add time entry to the appropriate task group with additional metadata
                projectCodeTaskMapping[projectCode].timeEntries[taskName].push({
                  ...timeEntry,
                  taskName: taskName,
                  projectId: project.projectId,
                  projectName: project.name,
                  projectCode: projectCode
                });
              });

              // Log breakdown by task
              Object.entries(projectCodeTaskMapping[projectCode].timeEntries).forEach(([taskName, entries]) => {
                if (entries.length > 0) {
                  console.log(`[Extract Project Codes API] - ${taskName}: ${entries.length} time entries`);
                }
              });
            }

          } catch (error) {
            console.error(`[Extract Project Codes API] Error fetching time entries for project ${project.projectId}:`, error);
            failedTimeEntryFetches++;
          }

        } catch (error) {
          console.error(`[Extract Project Codes API] Error fetching tasks for project ${project.projectId}:`, error);
          failedTaskFetches++;
        }
      }
    }

    console.log(`[Extract Project Codes API] Task fetching complete. Success: ${successfulTaskFetches}, Failed: ${failedTaskFetches}, Total tasks: ${totalTasksFetched}`);
    console.log(`[Extract Project Codes API] Time entry fetching complete. Success: ${successfulTimeEntryFetches}, Failed: ${failedTimeEntryFetches}, Total time entries: ${totalTimeEntriesFetched}`);

    // Create a simplified task mapping for each project code
    const taskSummaryByCode: { [code: string]: { [taskName: string]: number } } = {};
    Object.entries(projectCodeTaskMapping).forEach(([code, data]) => {
      taskSummaryByCode[code] = {};
      Object.keys(data.tasks).forEach(taskName => {
        taskSummaryByCode[code][taskName] = (taskSummaryByCode[code][taskName] || 0) + 1;
      });
    });

    // Generate summary statistics
    const summary = {
      totalProjects: allProjects.length,
      processedProjects: projectsToProcess.length,
      testingMode: projectsToProcess.length < allProjects.length,
      uniqueProjectCodes: uniqueProjectCodes.length,
      duplicateCodesCount: duplicateCodes.length,
      averageProjectsPerCode: projectsToProcess.length / uniqueProjectCodes.length,
      totalTasksFetched: totalTasksFetched,
      successfulTaskFetches: successfulTaskFetches,
      failedTaskFetches: failedTaskFetches,
      totalTimeEntriesFetched: totalTimeEntriesFetched,
      successfulTimeEntryFetches: successfulTimeEntryFetches,
      failedTimeEntryFetches: failedTimeEntryFetches,
      extractionDateTime: new Date().toISOString()
    };

    // Find common tasks across projects
    const allTaskNames = new Set<string>();
    Object.values(projectCodeTaskMapping).forEach(data => {
      Object.keys(data.tasks).forEach(taskName => allTaskNames.add(taskName));
    });

    // Analyze time entries across project codes
    const timeEntrySummary: { [code: string]: { [taskName: string]: number } } = {};
    let totalExistingTimeEntries = 0;
    
    Object.entries(projectCodeTaskMapping).forEach(([code, data]) => {
      timeEntrySummary[code] = {};
      Object.entries(data.timeEntries).forEach(([taskName, entries]) => {
        timeEntrySummary[code][taskName] = entries.length;
        totalExistingTimeEntries += entries.length;
      });
    });

    return NextResponse.json({
      success: true,
      summary: {
        ...summary,
        totalExistingTimeEntries: totalExistingTimeEntries
      },
      projectDetails,
      uniqueProjectCodes,
      duplicateCodes,
      projectCodeMapping,
      projectCodeTaskMapping,
      taskSummaryByCode,
      timeEntrySummary,
      allTaskNames: Array.from(allTaskNames).sort(),
      tenantId: effective_tenant_id
    });

  } catch (error) {
    console.error('[Extract Project Codes API] Overall error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ 
      success: false,
      message: 'Failed to extract project codes', 
      error: errorMessage 
    }, { status: 500 });
  }
} 