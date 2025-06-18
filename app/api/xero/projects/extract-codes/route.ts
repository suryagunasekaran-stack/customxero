import { NextResponse } from 'next/server';
import { XeroProjectService } from '@/lib/xeroProjectService';

export async function GET() {
  console.log('[Extract Project Codes API] Fetching project data using XeroProjectService');

  try {
    // Get all project data from cache or fetch fresh
    const projectData = await XeroProjectService.getProjectData();
    
    // Build summary statistics
    const summary = {
      totalProjects: projectData.projects.length,
      uniqueProjectCodes: Object.keys(projectData.projectCodes).length,
      averageProjectsPerCode: projectData.projects.length / Math.max(1, Object.keys(projectData.projectCodes).length),
      duplicateCodesCount: Object.values(projectData.projectCodes).filter(data => data.projects.length > 1).length,
      totalTasksFetched: Object.values(projectData.projectTasks).reduce((sum, tasks) => sum + tasks.length, 0),
      successfulTaskFetches: projectData.projects.length,
      failedTaskFetches: 0,
      totalTimeEntriesFetched: Object.values(projectData.timeEntries).reduce((sum, entries) => sum + entries.length, 0),
      successfulTimeEntryFetches: Object.keys(projectData.timeEntries).length,
      failedTimeEntryFetches: 0,
      totalExistingTimeEntries: Object.values(projectData.timeEntries).reduce((sum, entries) => sum + entries.length, 0),
      testingMode: false,
      processedProjects: projectData.projects.length
    };

    // Extract unique project codes
    const uniqueProjectCodes = Object.keys(projectData.projectCodes);
    
    // Get duplicate codes
    const duplicateCodes = Object.entries(projectData.projectCodes)
      .filter(([code, data]) => data.projects.length > 1)
      .map(([code, data]) => ({
        code,
        count: data.projects.length,
        projects: data.projects.map(p => ({ id: p.projectId, name: p.name }))
      }));
    
    // Get all task names
    const allTaskNames = Array.from(new Set(
      Object.values(projectData.projectTasks)
        .flat()
        .map(task => task.name)
    ));
    
    // Build time entry summary
    const timeEntrySummary: { [code: string]: { [taskName: string]: number } } = {};
    Object.entries(projectData.projectCodes).forEach(([code, codeData]) => {
      timeEntrySummary[code] = {};
      Object.entries(codeData.timeEntries).forEach(([taskName, entries]) => {
        timeEntrySummary[code][taskName] = entries.length;
      });
    });
    
    const response = {
      success: true,
      summary,
      uniqueProjectCodes,
      duplicateCodes,
      projectCodeTaskMapping: projectData.projectCodes,
      allTaskNames,
      timeEntrySummary,
      cached: new Date().getTime() - projectData.lastUpdated.getTime() > 1000
    };
    
    console.log(`[Extract Project Codes API] Returning data for ${summary.totalProjects} projects with ${summary.uniqueProjectCodes} unique codes`);
    
    return NextResponse.json(response);
    
  } catch (error: any) {
    console.error('[Extract Project Codes API] Error:', error);
    return NextResponse.json({ 
      success: false,
      error: error.message || 'Failed to extract project codes'
    }, { status: 500 });
  }
} 