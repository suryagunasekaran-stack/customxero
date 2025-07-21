'use client';

import React from 'react';
import { DocumentArrowDownIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { DirectProcessingResult } from '../../../lib/timesheet/types';

interface ProcessingResultsProps {
  results: DirectProcessingResult;
  onReset: () => void;
  onDownloadReport: () => void;
  onProceedToUpdate?: () => void;
  showUpdateButton?: boolean;
}

export default function ProcessingResults({
  results,
  onReset,
  onDownloadReport,
  onProceedToUpdate,
  showUpdateButton = false
}: ProcessingResultsProps) {
  
  const getStatusColor = () => {
    if (results.success) return 'green';
    if (results.summary.tasksCreated > 0) return 'amber';
    return 'red';
  };

  const getStatusTitle = () => {
    if (results.success) return 'Processing Complete';
    if (results.summary.tasksCreated > 0) return 'Processing Completed with Errors';
    return 'Processing Failed';
  };

  const statusColor = getStatusColor();

  return (
    <div className="mt-6 space-y-4">
      <div className={`border rounded-lg p-4 ${
        statusColor === 'green' 
          ? 'bg-green-50 border-green-200' 
          : statusColor === 'amber'
            ? 'bg-amber-50 border-amber-200'
            : 'bg-red-50 border-red-200'
      }`}>
        <h3 className={`text-sm font-semibold mb-3 ${
          statusColor === 'green' 
            ? 'text-green-800' 
            : statusColor === 'amber'
              ? 'text-amber-800'
              : 'text-red-800'
        }`}>
          {getStatusTitle()}
        </h3>
        
        <div className="grid grid-cols-2 gap-3 text-sm mb-3">
          <SummaryItem label="Entries Processed" value={results.summary.entriesProcessed} />
          <SummaryItem label="Projects Matched" value={results.summary.projectsMatched} />
          <SummaryItem 
            label="Tasks Created" 
            value={results.summary.tasksCreated}
            highlight={results.summary.tasksCreated > 0 ? 'success' : undefined}
          />
          <SummaryItem 
            label="Tasks Updated" 
            value={results.summary.tasksUpdated}
            highlight={results.summary.tasksUpdated > 0 ? 'info' : undefined}
          />
          <SummaryItem 
            label="Tasks Failed" 
            value={results.summary.actualTasksFailed}
            highlight={results.summary.actualTasksFailed > 0 ? 'error' : undefined}
            suffix={results.summary.projectsNotFound > 0 ? `(+${results.summary.projectsNotFound} not found)` : undefined}
          />
          <SummaryItem 
            label="Projects Not Found" 
            value={results.summary.projectsNotFound}
            suffix={results.summary.projectsNotFound > 0 ? '(likely closed)' : undefined}
            muted
          />
          {results.summary.closedProjectsAffected && results.summary.closedProjectsAffected > 0 && (
            <SummaryItem 
              label="Closed Projects" 
              value={results.summary.closedProjectsAffected}
              highlight="error"
              suffix="(review required)"
            />
          )}
        </div>

        {/* Closed Projects List */}
        {results.summary.closedProjectsAffected && results.summary.closedProjectsAffected > 0 && (
          results.closedProjectsWithChanges && results.closedProjectsWithChanges.length > 0 ? (
            <ClosedProjectsList 
              closedProjects={results.closedProjectsWithChanges} 
            />
          ) : (
            <div className="mb-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <p className="text-xs text-amber-700">
                {results.summary.closedProjectsAffected} closed projects have requested changes. 
                Check the downloaded report for details.
              </p>
            </div>
          )
        )}

        {/* Detailed breakdown of failures */}
        {(results.summary.actualTasksFailed > 0 || results.summary.projectsNotFound > 0) && (
          <FailureDetails results={results} />
        )}
      </div>

      {/* Closed Projects Warning */}
      {results.closedProjectsWithChanges && results.closedProjectsWithChanges.length > 0 && (
        <ClosedProjectsWarning closedProjects={results.closedProjectsWithChanges} />
      )}
      
      <div className="flex gap-3">
        <button
          onClick={onReset}
          className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Process Another
        </button>
        <button
          onClick={onDownloadReport}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
        >
          <DocumentArrowDownIcon className="w-4 h-4" />
          Download Report
        </button>
      </div>

      {showUpdateButton && (results.summary.tasksCreated > 0 || results.summary.tasksUpdated > 0) && (
        <div className="mt-4">
          <button
            onClick={onProceedToUpdate}
            className="w-full px-4 py-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Step 4: Apply Updates to Xero ({results.summary.tasksCreated + results.summary.tasksUpdated} changes)
          </button>
        </div>
      )}
    </div>
  );
}

function SummaryItem({ 
  label, 
  value, 
  highlight, 
  suffix, 
  muted = false 
}: { 
  label: string; 
  value: string | number; 
  highlight?: 'success' | 'info' | 'error';
  suffix?: string;
  muted?: boolean;
}) {
  const getValueColor = () => {
    if (muted) return 'text-gray-600';
    if (highlight === 'success') return 'text-green-700';
    if (highlight === 'info') return 'text-blue-700';
    if (highlight === 'error') return 'text-red-700';
    return 'text-gray-900';
  };

  return (
    <div>
      <span className="text-gray-600">{label}:</span>
      <span className={`ml-2 font-medium ${getValueColor()}`}>
        {value}
      </span>
      {suffix && (
        <span className="text-xs text-gray-500 ml-1">
          {suffix}
        </span>
      )}
    </div>
  );
}

function FailureDetails({ results }: { results: DirectProcessingResult }) {
  const actualFailures = results.results.filter(
    r => !r.success && !r.error?.includes('not found in active Xero projects')
  );
  const notFoundFailures = results.results.filter(
    r => !r.success && r.error?.includes('not found in active Xero projects')
  );

  return (
    <div className="mt-3 space-y-2">
      {/* Actual failures requiring attention */}
      {actualFailures.length > 0 && (
        <div className="p-3 bg-red-50 bg-opacity-70 rounded">
          <p className="text-xs font-medium text-red-800 mb-2">
            ⚠️ Actual Failures Requiring Attention ({actualFailures.length}):
          </p>
          <div className="max-h-24 overflow-y-auto">
            {actualFailures.slice(0, 3).map((result, idx) => (
              <div key={idx} className="text-xs text-red-700 mb-1">
                • {result.projectCode} - {result.taskName}: {result.error}
              </div>
            ))}
            {actualFailures.length > 3 && (
              <div className="text-xs text-red-600">
                ... and {actualFailures.length - 3} more (see report)
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Projects not found (informational) */}
      {notFoundFailures.length > 0 && (
        <div className="p-3 bg-gray-50 bg-opacity-70 rounded">
          <p className="text-xs font-medium text-gray-700 mb-2">
            ℹ️ Projects Not Found ({notFoundFailures.length}) - Likely Moved to Closed Status:
          </p>
          <div className="max-h-24 overflow-y-auto">
            {notFoundFailures.slice(0, 3).map((result, idx) => (
              <div key={idx} className="text-xs text-gray-600 mb-1">
                • {result.projectCode} - {result.taskName}
              </div>
            ))}
            {notFoundFailures.length > 3 && (
              <div className="text-xs text-gray-500">
                ... and {notFoundFailures.length - 3} more (see report)
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            This is normal when projects are completed and moved to closed status.
          </p>
        </div>
      )}
    </div>
  );
}

function ClosedProjectsList({ closedProjects }: { closedProjects: any[] }) {
  const [showAll, setShowAll] = React.useState(false);
  
  if (!closedProjects || closedProjects.length === 0) {
    return null;
  }
  
  const displayProjects = showAll ? closedProjects : closedProjects.slice(0, 3);

  return (
    <div className="mb-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-amber-800">
          Closed Projects with Requested Changes ({closedProjects.length}):
        </p>
        {closedProjects.length > 3 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-amber-600 hover:text-amber-800 underline"
          >
            {showAll ? 'Show Less' : `Show All`}
          </button>
        )}
      </div>
      <div className="space-y-1 max-h-60 overflow-y-auto">
        {displayProjects.map((project, idx) => (
          <div key={idx} className="text-xs bg-white bg-opacity-70 rounded p-2 border border-amber-100">
            <div className="flex justify-between items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900">{project.projectCode || 'No Code'}</div>
                <div className="text-gray-600 truncate">{project.projectName || 'Unnamed Project'}</div>
                <div className="text-amber-700 mt-0.5">Status: {project.status || 'Unknown'}</div>
              </div>
              <div className="text-right whitespace-nowrap flex-shrink-0">
                <div className="text-amber-700 font-medium">
                  {project.tasksToUpdate > 0 && (
                    <div>{project.tasksToUpdate} update{project.tasksToUpdate > 1 ? 's' : ''}</div>
                  )}
                  {project.tasksToCreate > 0 && (
                    <div>{project.tasksToCreate} new task{project.tasksToCreate > 1 ? 's' : ''}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
        {!showAll && closedProjects.length > 3 && (
          <div className="text-xs text-amber-600 text-center pt-1">
            ... and {closedProjects.length - 3} more
          </div>
        )}
      </div>
    </div>
  );
}

function ClosedProjectsWarning({ closedProjects }: { closedProjects: any[] }) {
  return (
    <div className="border border-amber-200 bg-amber-50 rounded-lg p-4">
      <div className="flex items-start space-x-3">
        <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-amber-800 mb-2">
            Warning: Changes Requested for Closed Projects ({closedProjects.length})
          </h3>
          <p className="text-xs text-amber-700 mb-3">
            The following projects are marked as CLOSED or COMPLETED but have changes in the timesheet. 
            Review these carefully before applying updates:
          </p>
          
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {closedProjects.map((project, idx) => (
              <div key={idx} className="bg-white bg-opacity-70 rounded p-2 text-xs">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">
                      {project.projectCode} - {project.projectName}
                    </p>
                    <p className="text-gray-600 mt-0.5">
                      Status: <span className="font-medium">{project.status}</span>
                    </p>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-amber-700">
                      {project.tasksToUpdate > 0 && (
                        <span className="block">Updates: {project.tasksToUpdate}</span>
                      )}
                      {project.tasksToCreate > 0 && (
                        <span className="block">New Tasks: {project.tasksToCreate}</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <p className="text-xs text-amber-600 mt-3">
            <strong>Important:</strong> Updating closed projects may require reopening them in Xero. 
            Verify with project managers before proceeding.
          </p>
        </div>
      </div>
    </div>
  );
} 