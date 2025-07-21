'use client';

import React from 'react';
import { CheckCircleIcon, XCircleIcon, DocumentArrowDownIcon } from '@heroicons/react/24/outline';

interface UpdateResult {
  projectId: string;
  taskId?: string;
  taskName: string;
  action: 'updated' | 'created';
  success: boolean;
  error?: string;
  projectDetails?: {
    projectCode?: string;
    projectName?: string;
  };
}

interface XeroUpdateSummary {
  success: boolean;
  totalAttempted: number;
  successCount: number;
  failureCount: number;
  results: UpdateResult[];
  duration: number;
}

interface XeroUpdateResultsProps {
  results: XeroUpdateSummary;
  onClose: () => void;
  onDownloadReport: () => void;
}

export default function XeroUpdateResults({
  results,
  onClose,
  onDownloadReport
}: XeroUpdateResultsProps) {
  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    return `${seconds}s`;
  };

  const successfulUpdates = results.results.filter(r => r.success && r.action === 'updated');
  const successfulCreates = results.results.filter(r => r.success && r.action === 'created');
  const failures = results.results.filter(r => !r.success);

  return (
    <div className="space-y-4">
      <div className={`border rounded-lg p-4 ${
        results.success 
          ? 'bg-green-50 border-green-200' 
          : 'bg-amber-50 border-amber-200'
      }`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className={`text-lg font-semibold ${
            results.success ? 'text-green-800' : 'text-amber-800'
          }`}>
            {results.success ? 'All Updates Successful' : 'Updates Completed with Errors'}
          </h3>
          {results.success ? (
            <CheckCircleIcon className="h-8 w-8 text-green-500" />
          ) : (
            <XCircleIcon className="h-8 w-8 text-amber-500" />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm mb-3">
          <div>
            <span className="text-gray-600">Total Changes:</span>
            <span className="ml-2 font-medium text-gray-900">{results.totalAttempted}</span>
          </div>
          <div>
            <span className="text-gray-600">Duration:</span>
            <span className="ml-2 font-medium text-gray-900">{formatDuration(results.duration)}</span>
          </div>
          <div>
            <span className="text-gray-600">Successful:</span>
            <span className="ml-2 font-medium text-green-700">{results.successCount}</span>
          </div>
          <div>
            <span className="text-gray-600">Failed:</span>
            <span className="ml-2 font-medium text-red-700">{results.failureCount}</span>
          </div>
        </div>

        {/* Success Details */}
        {results.successCount > 0 && (
          <div className="mb-3">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Successful Updates:</h4>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {successfulUpdates.length > 0 && (
                <div className="text-xs text-gray-600">
                  <span className="font-medium">Updated ({successfulUpdates.length}):</span>
                  <ul className="ml-4 mt-1">
                    {successfulUpdates.slice(0, 3).map((result, idx) => (
                      <li key={idx}>• {result.taskName}</li>
                    ))}
                    {successfulUpdates.length > 3 && (
                      <li>... and {successfulUpdates.length - 3} more</li>
                    )}
                  </ul>
                </div>
              )}
              {successfulCreates.length > 0 && (
                <div className="text-xs text-gray-600 mt-2">
                  <span className="font-medium">Created ({successfulCreates.length}):</span>
                  <ul className="ml-4 mt-1">
                    {successfulCreates.slice(0, 3).map((result, idx) => (
                      <li key={idx}>• {result.taskName}</li>
                    ))}
                    {successfulCreates.length > 3 && (
                      <li>... and {successfulCreates.length - 3} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Failure Details */}
        {failures.length > 0 && (
          <div className="p-3 bg-red-50 bg-opacity-70 rounded">
            <h4 className="text-sm font-medium text-red-800 mb-2">
              Failed Updates ({failures.length}):
            </h4>
            <div className="max-h-32 overflow-y-auto space-y-2">
              {failures.map((result, idx) => (
                <div key={idx} className="bg-white bg-opacity-60 rounded p-2 border border-red-200">
                  <div className="text-xs">
                    {result.projectDetails && (
                      <div className="font-medium text-gray-900 mb-1">
                        Project: {result.projectDetails.projectCode || 'Unknown'} - {result.projectDetails.projectName || 'Unknown Project'}
                      </div>
                    )}
                    <div className="text-red-700">
                      <span className="font-medium">{result.taskName}</span>
                      <span className="text-gray-600"> ({result.action})</span>
                    </div>
                    <div className="text-red-600 mt-1">
                      Error: {result.error}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Done
        </button>
        <button
          onClick={onDownloadReport}
          className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
        >
          <DocumentArrowDownIcon className="w-4 h-4" />
          Download Update Report
        </button>
      </div>
    </div>
  );
}