'use client';

import React from 'react';
import { 
  CheckCircleIcon, 
  ExclamationTriangleIcon,
  PlusCircleIcon,
  ArrowPathIcon,
  FolderIcon
} from '@heroicons/react/24/outline';

interface ProjectMatch {
  timesheetCode: string;
  xeroProject?: {
    name: string;
    projectId: string;
    projectCode: string;
  };
  tasks: Array<{
    name: string;
    rate: { currency: string; value: number };
    estimateMinutes: number;
  }>;
  status: 'matched' | 'no_match' | 'new_project';
  action: 'update_tasks' | 'create_project' | 'skip';
}

interface ProjectMatchingAnalyzerProps {
  timesheetData: any;
  cachedProjects: any[];
  className?: string;
}

export default function ProjectMatchingAnalyzer({ 
  timesheetData, 
  cachedProjects, 
  className = '' 
}: ProjectMatchingAnalyzerProps) {
  
  const analyzeMatches = (): ProjectMatch[] => {
    if (!timesheetData?.consolidated_payload) return [];
    
    const matches: ProjectMatch[] = [];
    
    // Create project code mapping from cached data
    const cachedProjectMap = new Map();
    cachedProjects.forEach(project => {
      if (project.projectCode) {
        cachedProjectMap.set(project.projectCode, project);
      }
    });
    
    // Analyze each project in timesheet
    Object.entries(timesheetData.consolidated_payload).forEach(([projectCode, tasks]) => {
      const xeroProject = cachedProjectMap.get(projectCode);
      
      matches.push({
        timesheetCode: projectCode,
        xeroProject: xeroProject || undefined,
        tasks: tasks as any[],
        status: xeroProject ? 'matched' : 'no_match',
        action: xeroProject ? 'update_tasks' : 'skip'
      });
    });
    
    return matches.sort((a, b) => {
      // Sort by status: matched first, then no_match
      if (a.status === 'matched' && b.status !== 'matched') return -1;
      if (a.status !== 'matched' && b.status === 'matched') return 1;
      return a.timesheetCode.localeCompare(b.timesheetCode);
    });
  };

  const matches = analyzeMatches();
  const matchedCount = matches.filter(m => m.status === 'matched').length;
  const unmatchedCount = matches.filter(m => m.status === 'no_match').length;
  const totalTasks = matches.reduce((sum, match) => sum + match.tasks.length, 0);

  return (
    <div className={`bg-white rounded-lg border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center">
          <FolderIcon className="h-4 w-4 mr-2 text-blue-600" />
          Project Matching Analysis
        </h3>
      </div>

      {/* Summary Stats */}
      <div className="p-4 border-b border-gray-200">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-green-600">{matchedCount}</div>
            <div className="text-xs text-gray-500">Will Update</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-amber-600">{unmatchedCount}</div>
            <div className="text-xs text-gray-500">No Match</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-600">{totalTasks}</div>
            <div className="text-xs text-gray-500">Total Tasks</div>
          </div>
        </div>
      </div>

      {/* Project List */}
      <div className="max-h-[500px] overflow-y-auto">
        {matches.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            <ExclamationTriangleIcon className="h-8 w-8 mx-auto mb-2 text-gray-400" />
            <p className="text-sm">No timesheet data to analyze</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {matches.map((match, index) => (
              <div key={index} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center min-w-0 flex-1">
                    {match.status === 'matched' ? (
                      <CheckCircleIcon className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                    ) : (
                      <ExclamationTriangleIcon className="h-4 w-4 text-amber-500 mr-2 flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-900">
                        {match.timesheetCode}
                      </div>
                      {match.xeroProject && (
                        <div className="text-xs text-gray-500 truncate">
                          → {match.xeroProject.name}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0 ml-4">
                    <div className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${
                      match.status === 'matched' 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {match.status === 'matched' ? 'Will Update' : 'No Match'}
                    </div>
                  </div>
                </div>
                
                {/* Complete Task List */}
                <div className="ml-6 space-y-2">
                  <div className="text-xs font-medium text-gray-700 mb-1">
                    Tasks ({match.tasks.length}):
                  </div>
                  <div className="space-y-1 max-h-32 overflow-y-auto bg-gray-50 rounded p-2">
                    {match.tasks.map((task, taskIndex) => (
                      <div key={taskIndex} className="flex items-center justify-between text-xs">
                        <span className="text-gray-700 font-medium">{task.name}</span>
                        <div className="flex items-center gap-2 text-gray-600">
                          <span>${(task.rate.value / 100).toFixed(2)}</span>
                          <span>•</span>
                          <span>{Math.round(task.estimateMinutes / 60)}h</span>
                          <span className="text-gray-400">({task.estimateMinutes}min)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Indicator */}
                {match.status === 'matched' && (
                  <div className="ml-6 mt-3 flex items-center text-xs text-green-600">
                    <ArrowPathIcon className="h-3 w-3 mr-1" />
                    <span className="font-medium">Tasks will be created/updated in Xero</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Summary */}
      {matches.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
          <div className="text-xs text-gray-600">
            <strong>{matchedCount}</strong> projects will be updated in Xero.
            {unmatchedCount > 0 && (
              <span className="text-amber-600">
                {' '}<strong>{unmatchedCount}</strong> projects have no matching Xero project and will be skipped.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
} 