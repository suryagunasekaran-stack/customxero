'use client';

import React, { useState } from 'react';
import { useLog } from '../../../contexts/LogContext';
import { PlayIcon, ArrowUpTrayIcon, ArrowDownTrayIcon } from '@heroicons/react/20/solid';
import { useSyncProject } from '../../../hooks/useSyncProject'; // Import the new hook

// Define a type for your function items to ensure consistency
interface FunctionItem {
  name: string;
  description: string;
  action?: () => void; // Optional for cards with multiple actions
  uploadAction?: () => void;
  runAction?: () => void;
  icon?: React.ElementType;
  uploadIcon?: React.ElementType;
  runIcon?: React.ElementType;
  disabled?: boolean;
}

export default function XeroPage() {
  const { addLog } = useLog();
  const [projectCostFileUploaded, setProjectCostFileUploaded] = useState(false);
  
  // Use the custom hook for Sync Project logic
  const {
    isSyncing,
    // comparisonReportContent, // Not directly used in JSX here, but available if needed
    showDownloadReportButton,
    handleSyncProject,
    handleDownloadReport,
  } = useSyncProject();

  const functions: FunctionItem[] = [
    {
      name: 'Sync Project',
      description: 'Synchronizes project data between Xero and other integrated systems, ensuring consistency across platforms.',
      action: handleSyncProject, 
      icon: PlayIcon,
      disabled: isSyncing, 
    },
    {
      name: 'Update Project Cost',
      description: 'Recalculates and updates the total project costs in Xero based on the latest expenses and resource allocations.',
      uploadAction: () => {
        addLog({ message: 'Upload File button clicked for Update Project Cost', source: 'XeroPage' });
        setProjectCostFileUploaded(true);
      },
      runAction: () => addLog({ message: 'Run button clicked for Update Project Cost', source: 'XeroPage' }),
      uploadIcon: ArrowUpTrayIcon,
      runIcon: PlayIcon,
      disabled: isSyncing, // Assuming sync should disable this too
    },
    {
      name: 'Manhour Billing',
      description: 'Generates invoices for clients based on billable manhours logged for specific projects in Xero.',
      action: () => addLog({ message: 'Manhour Billing button clicked', source: 'XeroPage' }),
      icon: PlayIcon,
      disabled: isSyncing, // Assuming sync should disable this too
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Xero Functions</h1>
      <p className="mt-2 text-sm text-gray-700 mb-8">
        This page provides custom functions to interact with Xero data and streamline your project management workflows.
      </p>

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

      <div className="flex flex-col gap-6">
        {functions.map((func) => (
          <div
            key={func.name}
            className="overflow-hidden rounded-lg bg-white shadow-lg hover:shadow-xl transition-shadow duration-300 ease-in-out"
          >
            <div className="p-6">
              <h2 className="text-lg font-semibold text-indigo-600">{func.name}</h2>
              <p className="mt-2 text-sm text-gray-600 min-h-[60px]">{func.description}</p>
              {func.name === 'Update Project Cost' ? (
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={func.uploadAction}
                    disabled={func.disabled}
                    className="inline-flex items-center justify-center rounded-md border border-transparent bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {func.uploadIcon && <func.uploadIcon className="size-5 mr-2" />}
                    Upload File
                  </button>
                  <button
                    type="button"
                    onClick={func.runAction}
                    disabled={!projectCostFileUploaded || func.disabled}
                    className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {func.runIcon && <func.runIcon className="size-5 mr-2" />}
                    Run
                  </button>
                </div>
              ) : (
                <div className="mt-6 flex justify-end">
                  <button
                    type="button"
                    onClick={func.action}
                    disabled={func.disabled} 
                    className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {func.icon && <func.icon className="size-5 mr-2" />}
                    Run
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
