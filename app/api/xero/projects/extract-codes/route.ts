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
      duplicateCodesCount: Object.values(projectData.projectCodes).filter(projects => projects.length > 1).length,
      totalTasksFetched: 0, // We don't fetch tasks anymore
      successfulTaskFetches: 0,
      failedTaskFetches: 0,
      totalTimeEntriesFetched: 0, // We don't fetch time entries anymore
      successfulTimeEntryFetches: 0,
      failedTimeEntryFetches: 0,
      totalExistingTimeEntries: 0,
      testingMode: false,
      processedProjects: projectData.projects.length
    };

    // Extract unique project codes
    const uniqueProjectCodes = Object.keys(projectData.projectCodes);
    
    // Get duplicate codes
    const duplicateCodes = Object.entries(projectData.projectCodes)
      .filter(([code, projects]) => projects.length > 1)
      .map(([code, projects]) => ({
        code,
        count: projects.length,
        projects: projects.map(p => ({ id: p.projectId, name: p.name }))
      }));
    
    // Get all task names - empty since we don't fetch tasks anymore
    const allTaskNames: string[] = [];
    
    // Build time entry summary - empty since we don't fetch time entries anymore
    const timeEntrySummary: { [code: string]: { [taskName: string]: number } } = {};
    
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