'use client';

import React from 'react';
import { PlayIcon, ArrowDownTrayIcon } from '@heroicons/react/20/solid';
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
    <>
      {showDownloadReportButton && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg shadow">
          <h3 className="text-md font-semibold text-green-700">Comparison Report Ready</h3>
          <p className="text-sm text-green-600 mt-1">The project comparison report has been generated.</p>
          <button
            type="button"
            onClick={handleDownloadReport}
            className="mt-3 inline-flex items-center justify-center rounded-md border border-transparent bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors duration-150"
          >
            <ArrowDownTrayIcon className="size-5 mr-2" />
            Download Report
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg bg-white shadow-lg hover:shadow-xl transition-shadow duration-300 ease-in-out">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-indigo-600">Sync Project</h2>
          <p className="mt-2 text-sm text-gray-600 min-h-[60px]">
            Synchronizes project data between Xero and other integrated systems, ensuring consistency across platforms.
          </p>
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={handleSyncProject}
              disabled={isDisabled}
              className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <PlayIcon className="size-5 mr-2" />
              {isSyncing ? 'Syncing...' : 'Run'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
} 