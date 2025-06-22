'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface XeroProject {
  projectId: string;
  name: string;
  status: string;
}

interface XeroTask {
  taskId: string;
  name: string;
  rate?: {
    currency: string;
    value: string;  // was: number
  };
  estimateMinutes?: number;
}

interface ProjectWithTasks extends XeroProject {
  tasks: XeroTask[];
}

export default function ResetTasksPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [projectStatus, setProjectStatus] = useState<'INPROGRESS' | 'CLOSED' | 'ALL'>('INPROGRESS');
  const [projects, setProjects] = useState<XeroProject[]>([]);
  const [projectsWithTasks, setProjectsWithTasks] = useState<ProjectWithTasks[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<'select-status' | 'loading-projects' | 'review' | 'confirm' | 'deleting' | 'complete'>('select-status');
  const [deleteResults, setDeleteResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch projects based on status
  const fetchProjects = async () => {
    setLoading(true);
    setError(null);
    setStep('loading-projects');
    
    try {
      const statuses = projectStatus === 'ALL' ? ['INPROGRESS', 'CLOSED'] : [projectStatus];
      const allProjects: XeroProject[] = [];
      
      console.log(`[Reset Tasks] Fetching projects with status: ${projectStatus}`);
      
      for (const status of statuses) {
        console.log(`[Reset Tasks] Fetching ${status} projects...`);
        const response = await fetch(`/api/xero/projects?states=${status}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch ${status} projects: ${response.status}`);
        }
        const data = await response.json();
        const projects = data.projects || [];
        console.log(`[Reset Tasks] Found ${projects.length} ${status} projects`);
        allProjects.push(...projects);
      }
      
      // Ensure projects match the selected status filter
      const filteredProjects = allProjects.filter(project => {
        if (projectStatus === 'ALL') return true;
        return project.status === projectStatus;
      });
      
      console.log(`[Reset Tasks] After filtering: ${filteredProjects.length} projects match status '${projectStatus}'`);
      
      setProjects(filteredProjects);
      
      // Fetch tasks for each project
      const projectsWithTasksData: ProjectWithTasks[] = [];
      
      for (const project of filteredProjects) {
        console.log(`[Reset Tasks] Fetching tasks for ${project.status} project: ${project.name}`);
        const tasksResponse = await fetch(`/api/xero/project-tasks/${project.projectId}`);
        if (tasksResponse.ok) {
          const tasksData = await tasksResponse.json();
          if (tasksData.tasks && tasksData.tasks.length > 0) {
            projectsWithTasksData.push({
              ...project,
              tasks: tasksData.tasks
            });
            console.log(`[Reset Tasks] Project ${project.name} (${project.status}) has ${tasksData.tasks.length} tasks`);
          }
        } else {
          console.warn(`[Reset Tasks] Failed to fetch tasks for project ${project.name}: ${tasksResponse.status}`);
        }
      }
      
      console.log(`[Reset Tasks] Final result: ${projectsWithTasksData.length} projects with tasks (status: ${projectStatus})`);
      setProjectsWithTasks(projectsWithTasksData);
      setStep('review');
    } catch (err: any) {
      console.error(`[Reset Tasks] Error fetching projects:`, err);
      setError(err.message);
      setStep('select-status');
    } finally {
      setLoading(false);
    }
  };

  // Delete selected tasks
  const deleteSelectedTasks = async () => {
    setStep('deleting');
    setError(null);
    
    const results = {
      totalTasks: 0,
      deletedTasks: 0,
      failedTasks: 0,
      projects: [] as any[]
    };
    
    try {
      for (const projectWithTasks of projectsWithTasks) {
        if (!selectedProjects.has(projectWithTasks.projectId)) continue;
        
        const projectResult = {
          projectName: projectWithTasks.name,
          projectId: projectWithTasks.projectId,
          totalTasks: projectWithTasks.tasks.length,
          deletedTasks: 0,
          failedTasks: [] as { taskName: string; taskId: string; error: string }[]
        };
        
        for (const task of projectWithTasks.tasks) {
          results.totalTasks++;
          
          const deleteResponse = await fetch(`/api/xero/project-tasks/${projectWithTasks.projectId}/${task.taskId}`, {
            method: 'DELETE'
          });
          
          if (deleteResponse.ok) {
            results.deletedTasks++;
            projectResult.deletedTasks++;
          } else {
            results.failedTasks++;
            const error = await deleteResponse.text();
            projectResult.failedTasks.push({
              taskName: task.name,
              taskId: task.taskId,
              error
            });
          }
        }
        
        results.projects.push(projectResult);
      }
      
      setDeleteResults(results);
      setStep('complete');
    } catch (err: any) {
      setError(err.message);
      setStep('review');
    }
  };

  const handleSelectAll = () => {
    if (selectedProjects.size === projectsWithTasks.length) {
      setSelectedProjects(new Set());
    } else {
      setSelectedProjects(new Set(projectsWithTasks.map(p => p.projectId)));
    }
  };

  const toggleProject = (projectId: string) => {
    const newSelected = new Set(selectedProjects);
    if (newSelected.has(projectId)) {
      newSelected.delete(projectId);
    } else {
      newSelected.add(projectId);
    }
    setSelectedProjects(newSelected);
  };

  const getSelectedTaskCount = () => {
    return projectsWithTasks
      .filter(p => selectedProjects.has(p.projectId))
      .reduce((sum, p) => sum + p.tasks.length, 0);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Reset Project Tasks</h1>
          <div className="mt-3 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 font-semibold flex items-center">
              <svg className="h-5 w-5 text-red-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              WARNING: This will permanently DELETE project tasks. Projects themselves will NOT be deleted.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-8 p-4 bg-red-50 border border-red-400 rounded-lg">
            <div className="flex">
              <svg className="h-5 w-5 text-red-400 mr-2 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-red-800 font-medium">{error}</p>
            </div>
          </div>
        )}

        {step === 'select-status' && (
          <div className="bg-white shadow-sm rounded-lg border border-gray-200">
            <div className="px-6 py-5 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Select Project Status</h2>
              <p className="mt-1 text-sm text-gray-600">Choose which project types to load for task deletion</p>
            </div>
            <div className="px-6 py-6">
              <div className="space-y-4">
                <label className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="radio"
                    value="INPROGRESS"
                    checked={projectStatus === 'INPROGRESS'}
                    onChange={(e) => setProjectStatus(e.target.value as any)}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                  />
                  <div className="ml-3">
                    <span className="text-sm font-medium text-gray-900">In Progress projects only</span>
                    <p className="text-sm text-gray-500">Load tasks from currently active projects</p>
                  </div>
                </label>
                <label className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="radio"
                    value="CLOSED"
                    checked={projectStatus === 'CLOSED'}
                    onChange={(e) => setProjectStatus(e.target.value as any)}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                  />
                  <div className="ml-3">
                    <span className="text-sm font-medium text-gray-900">Closed projects only</span>
                    <p className="text-sm text-gray-500">Load tasks from completed projects</p>
                  </div>
                </label>
                <label className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="radio"
                    value="ALL"
                    checked={projectStatus === 'ALL'}
                    onChange={(e) => setProjectStatus(e.target.value as any)}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                  />
                  <div className="ml-3">
                    <span className="text-sm font-medium text-gray-900">All projects (In Progress + Closed)</span>
                    <p className="text-sm text-gray-500">Load tasks from all project types</p>
                  </div>
                </label>
              </div>
              <div className="mt-6">
                <button
                  onClick={fetchProjects}
                  className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                >
                  Fetch Projects
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'loading-projects' && (
          <div className="bg-white shadow-sm rounded-lg border border-gray-200">
            <div className="px-6 py-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
              <p className="text-sm font-medium text-gray-900">Loading projects and tasks...</p>
              <p className="text-sm text-gray-600 mt-1">This may take a moment</p>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="bg-white shadow-sm rounded-lg border border-gray-200">
            <div className="px-6 py-5 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Review Tasks to Delete</h2>
              <div className="mt-2 space-y-2">
                <p className="text-sm text-gray-600">
                  Found <span className="font-medium text-gray-900">{projectsWithTasks.length}</span> projects with tasks out of <span className="font-medium text-gray-900">{projects.length}</span> total projects
                </p>
                <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                  projectStatus === 'INPROGRESS' ? 'bg-green-100 text-green-800' :
                  projectStatus === 'CLOSED' ? 'bg-gray-100 text-gray-800' :
                  'bg-blue-100 text-blue-800'
                }`}>
                  <div className={`w-2 h-2 rounded-full mr-2 ${
                    projectStatus === 'INPROGRESS' ? 'bg-green-500' :
                    projectStatus === 'CLOSED' ? 'bg-gray-500' :
                    'bg-blue-500'
                  }`}></div>
                  Filter: {projectStatus === 'INPROGRESS' ? 'In Progress Projects Only' : 
                           projectStatus === 'CLOSED' ? 'Closed Projects Only' : 
                           'All Projects (In Progress + Closed)'}
                </div>
                {projectStatus === 'INPROGRESS' && (
                  <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-800 font-medium">
                      ✓ Only showing IN PROGRESS projects - no closed projects will be affected
                    </p>
                  </div>
                )}
                {projectStatus === 'CLOSED' && (
                  <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-sm text-gray-800 font-medium">
                      ⚠️ Only showing CLOSED projects - no active projects will be affected
                    </p>
                  </div>
                )}
                {projectStatus === 'ALL' && (
                  <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-800 font-medium">
                      ⚠️ Showing ALL projects - both ACTIVE and CLOSED projects will be affected
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-6">
              {projectsWithTasks.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No projects with tasks found</h3>
                  <p className="mt-1 text-sm text-gray-600">
                    {projectStatus === 'INPROGRESS' && 'No in-progress projects have tasks to delete.'}
                    {projectStatus === 'CLOSED' && 'No closed projects have tasks to delete.'}
                    {projectStatus === 'ALL' && 'No projects have tasks to delete.'}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">Try selecting a different project status filter.</p>
                </div>
              ) : (
                <>
                  <div className="mb-6 flex items-center justify-between">
                    <button
                      onClick={handleSelectAll}
                      className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                    >
                      {selectedProjects.size === projectsWithTasks.length ? 'Deselect All' : 'Select All'}
                    </button>
                    <div className="text-sm text-gray-600">
                      Selected: <span className="font-medium text-gray-900">{selectedProjects.size}</span> projects, <span className="font-medium text-gray-900">{getSelectedTaskCount()}</span> tasks
                    </div>
                  </div>

                  <div className="space-y-4 max-h-96 overflow-y-auto">
                    {projectsWithTasks.map((project) => (
                      <div
                        key={project.projectId}
                        className={`border rounded-lg transition-colors duration-200 ${
                          selectedProjects.has(project.projectId) 
                            ? 'border-indigo-300 bg-indigo-50 shadow-sm' 
                            : 'border-gray-300 bg-white hover:border-gray-400'
                        }`}
                      >
                        <label className="flex items-start p-4 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedProjects.has(project.projectId)}
                            onChange={() => toggleProject(project.projectId)}
                            className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                          />
                          <div className="ml-3 flex-1">
                            <div className="flex items-center justify-between">
                              <h3 className="text-sm font-medium text-gray-900">{project.name}</h3>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                project.status === 'INPROGRESS' 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-gray-100 text-gray-800'
                              }`}>
                                {project.status === 'INPROGRESS' ? 'In Progress' : 'Closed'}
                              </span>
                            </div>
                            <div className="mt-3">
                              <p className="text-sm font-medium text-gray-900 mb-2">Tasks ({project.tasks.length}):</p>
                              <ul className="space-y-1">
                                {project.tasks.map((task) => (
                                  <li key={task.taskId} className="text-sm text-gray-700 flex items-center">
                                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full mr-2 flex-shrink-0"></span>
                                    <span className="font-medium text-gray-900">{task.name}</span>
                                    {task.rate && (
                                      <span className="ml-2 text-gray-600">
                                        ${parseFloat(task.rate.value).toFixed(2)} {task.rate.currency}
                                      </span>
                                    )}
                                    {task.estimateMinutes && (
                                      <span className="ml-2 text-gray-600">
                                        {task.estimateMinutes} mins
                                      </span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </label>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 flex justify-end">
                    <button
                      onClick={() => setStep('confirm')}
                      disabled={selectedProjects.size === 0}
                      className={`inline-flex items-center justify-center rounded-md border border-transparent px-4 py-2 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                        selectedProjects.size === 0
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500'
                      }`}
                    >
                      Proceed to Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="bg-white shadow-sm rounded-lg border border-gray-200">
            <div className="px-6 py-8 text-center">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-6">
                <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">⚠️ DANGER ZONE ⚠️</h2>
              <p className="text-lg text-gray-900 mb-2">You are about to DELETE:</p>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 inline-block">
                <p className="text-2xl font-bold text-red-700">
                  {getSelectedTaskCount()} tasks from {selectedProjects.size} projects
                </p>
              </div>
              <p className="text-red-700 font-semibold text-lg mb-8">This action CANNOT be undone!</p>
              
              <div className="flex justify-center space-x-4">
                <button
                  onClick={() => setStep('review')}
                  className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-6 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                >
                  Cancel
                </button>
                <button
                  onClick={deleteSelectedTasks}
                  className="inline-flex items-center justify-center rounded-md border border-transparent bg-red-600 px-6 py-3 text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                >
                  Yes, Delete All Tasks
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'deleting' && (
          <div className="bg-white shadow-sm rounded-lg border border-gray-200">
            <div className="px-6 py-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
              <p className="text-sm font-medium text-gray-900">Deleting tasks...</p>
              <p className="text-sm text-gray-600 mt-1">Please wait while we process your request</p>
            </div>
          </div>
        )}

        {step === 'complete' && deleteResults && (
          <div className="bg-white shadow-sm rounded-lg border border-gray-200">
            <div className="px-6 py-5 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Deletion Complete</h2>
              <p className="mt-1 text-sm text-gray-600">Task deletion process has finished</p>
            </div>
            
            <div className="px-6 py-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-8">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-gray-900">{deleteResults.totalTasks}</p>
                  <p className="text-sm font-medium text-gray-600">Total Tasks</p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-green-700">{deleteResults.deletedTasks}</p>
                  <p className="text-sm font-medium text-green-600">Successfully Deleted</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-red-700">{deleteResults.failedTasks}</p>
                  <p className="text-sm font-medium text-red-600">Failed</p>
                </div>
              </div>

              {deleteResults.failedTasks > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-red-700 mb-3">Failed Deletions:</h3>
                  <div className="space-y-3">
                    {deleteResults.projects.map((project: any) => 
                      project.failedTasks.length > 0 && (
                        <div key={project.projectId} className="border border-red-200 rounded-lg p-4 bg-red-50">
                          <p className="font-medium text-gray-900 mb-2">{project.projectName}</p>
                          <div className="space-y-1">
                            {project.failedTasks.map((failure: any) => (
                              <p key={failure.taskId} className="text-sm text-red-700">
                                • <span className="font-medium">{failure.taskName}</span>: {failure.error}
                              </p>
                            ))}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={() => router.push('/organisation')}
                  className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                >
                  Back to Dashboard
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 