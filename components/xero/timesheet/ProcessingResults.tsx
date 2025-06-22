'use client';

import React from 'react';
import { DocumentArrowDownIcon } from '@heroicons/react/24/outline';
import { DirectProcessingResult } from '../../../lib/timesheet/types';

interface ProcessingResultsProps {
  results: DirectProcessingResult;
  onReset: () => void;
  onDownloadReport: () => void;
}

export default function ProcessingResults({
  results,
  onReset,
  onDownloadReport
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
          <SummaryItem 
            label="Processing Time" 
            value={`${(results.summary.processingTimeMs / 1000).toFixed(1)}s`}
          />
        </div>

        {/* Detailed breakdown of failures */}
        {(results.summary.actualTasksFailed > 0 || results.summary.projectsNotFound > 0) && (
          <FailureDetails results={results} />
        )}
      </div>
      
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