'use client';

import React from 'react';
import { ArrowsRightLeftIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { useSyncProject } from '../../hooks/useSyncProject';
import { FunctionCardProps } from './types';
import ReportDownloadOptions from './ReportDownloadOptions';

interface SyncProjectCardProps extends FunctionCardProps {}

export default function SyncProjectCard({ disabled = false }: SyncProjectCardProps) {
  const {
    isSyncing,
    showDownloadOptions,
    comparisonData,
    reportMetadata,
    handleSyncProject,
    handleDownloadReport,
  } = useSyncProject();

  const isDisabled = disabled || isSyncing;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-200">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Project Sync</h2>
            <p className="text-sm text-gray-500 mt-1">
              Synchronize projects between Xero and Pipedrive
            </p>
          </div>
          {showDownloadOptions && !isSyncing && (
            <CheckCircleIcon className="h-8 w-8 text-green-500" />
          )}
        </div>

        {/* Description */}
        <div className="mb-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-2">What this does:</h3>
            <ul className="space-y-1 text-sm text-gray-600">
              <li className="flex items-start">
                <span className="text-gray-400 mr-2">•</span>
                <span>Fetches latest project data from both systems</span>
              </li>
              <li className="flex items-start">
                <span className="text-gray-400 mr-2">•</span>
                <span>Compares and identifies differences</span>
              </li>
              <li className="flex items-start">
                <span className="text-gray-400 mr-2">•</span>
                <span>Generates professional comparison reports</span>
              </li>
              <li className="flex items-start">
                <span className="text-gray-400 mr-2">•</span>
                <span>Exports in Excel, CSV, or text formats</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={handleSyncProject}
          disabled={isDisabled}
          className="w-full inline-flex items-center justify-center px-4 py-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
        >
          {isSyncing ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
              Syncing Projects...
            </>
          ) : (
            <>
              <ArrowsRightLeftIcon className="h-4 w-4 mr-2" />
              Sync Projects
            </>
          )}
        </button>
      </div>

      {/* Professional Report Download Options */}
      {showDownloadOptions && !isSyncing && comparisonData && reportMetadata && (
        <div className="border-t border-gray-100">
          <ReportDownloadOptions
            comparisonData={comparisonData}
            reportMetadata={reportMetadata}
            onDownload={handleDownloadReport}
            className="rounded-none shadow-none border-0"
          />
        </div>
      )}
    </div>
  );
} 