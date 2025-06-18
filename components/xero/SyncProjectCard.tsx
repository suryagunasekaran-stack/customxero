'use client';

import React from 'react';
import { ArrowsRightLeftIcon, ArrowDownTrayIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { useSyncProject } from '../../hooks/useSyncProject';
import { FunctionCardProps } from './types';

interface SyncProjectCardProps extends FunctionCardProps {}

export default function SyncProjectCard({ disabled = false }: SyncProjectCardProps) {
  const {
    isSyncing,
    showDownloadReportButton,
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
          {showDownloadReportButton && !isSyncing && (
            <CheckCircleIcon className="h-8 w-8 text-green-500" />
          )}
        </div>

        {/* Success Message with Download */}
        {showDownloadReportButton && !isSyncing && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-start gap-3">
              <CheckCircleIcon className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-800">Sync completed successfully!</p>
                <p className="text-sm text-green-700 mt-1">
                  The comparison report is ready for download.
                </p>
                <button
                  onClick={handleDownloadReport}
                  className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-100 rounded-lg hover:bg-green-200 transition-colors"
                >
                  <ArrowDownTrayIcon className="h-4 w-4" />
                  Download Report
                </button>
              </div>
            </div>
          </div>
        )}

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
                <span>Generates detailed comparison report</span>
              </li>
              <li className="flex items-start">
                <span className="text-gray-400 mr-2">•</span>
                <span>Ensures data consistency across platforms</span>
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
    </div>
  );
} 