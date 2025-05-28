'use client';

import React, { useState } from 'react';
import { useLog } from '../../../contexts/LogContext';
import { PlayIcon, ArrowUpTrayIcon } from '@heroicons/react/20/solid';

export default function XeroPage() {
  const { addLog } = useLog();
  const [projectCostFileUploaded, setProjectCostFileUploaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // --- New async functions for Sync Project ---
  const fetchPipedriveProjects = async () => {
    addLog('Fetching projects from Pipedrive...', 'SyncProject');
    try {
      const response = await fetch('/api/pipedrive/projects');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      addLog(`Pipedrive projects fetched: ${JSON.stringify(data.projects.length)} projects`, 'SyncProject');
      return data.projects;
    } catch (error) {
      addLog(`Error fetching Pipedrive projects: ${(error as Error).message}`, 'SyncProject');
      throw error;
    }
  };

  const fetchXeroProjects = async () => {
    addLog('Fetching projects from Xero...', 'SyncProject');
    try {
      const response = await fetch('/api/xero/projects');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      addLog(`Xero projects fetched: ${JSON.stringify(data.projects.length)} projects`, 'SyncProject');
      return data.projects;
    } catch (error) {
      addLog(`Error fetching Xero projects: ${(error as Error).message}`, 'SyncProject');
      throw error;
    }
  };

  const compareProjects = async (pipedriveProjects: any[], xeroProjects: any[]) => {
    addLog('Comparing Pipedrive and Xero projects...', 'SyncProject');
    try {
      const response = await fetch('/api/compare/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pipedriveProjects, xeroProjects }),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      addLog('Project comparison complete.', 'SyncProject');
      addLog(`Comparison Result: ${JSON.stringify(data.comparisonResult)}`, 'SyncProject');
      return data.comparisonResult;
    } catch (error) {
      addLog(`Error comparing projects: ${(error as Error).message}`, 'SyncProject');
      throw error;
    }
  };

  const handleSyncProject = async () => {
    setIsSyncing(true);
    addLog('Starting Project Sync Process...', 'SyncProject');
    try {
      const pipedriveProjects = await fetchPipedriveProjects();
      const xeroProjects = await fetchXeroProjects();
      if (pipedriveProjects && xeroProjects) {
        await compareProjects(pipedriveProjects, xeroProjects);
        addLog('Project Sync Process Completed Successfully.', 'SyncProject');
      } else {
        addLog('Project Sync Process failed due to missing data from Pipedrive or Xero.', 'SyncProject');
      }
    } catch (error) {
      addLog(`Project Sync Process failed: ${(error as Error).message}`, 'SyncProject');
    } finally {
      setIsSyncing(false);
    }
  };
  // --- End of new async functions ---

  const functions = [
    {
      name: 'Sync Project',
      description: 'Synchronizes project data between Xero and other integrated systems, ensuring consistency across platforms.',
      action: handleSyncProject, // Updated action
      icon: PlayIcon,
      disabled: isSyncing, // Disable button while syncing
    },
    {
      name: 'Update Project Cost',
      description: 'Recalculates and updates the total project costs in Xero based on the latest expenses and resource allocations.',
      // Specific actions and icons for this card type
      uploadAction: () => {
        addLog('Upload File button clicked for Update Project Cost', 'XeroPage');
        setProjectCostFileUploaded(true);
      },
      runAction: () => addLog('Run button clicked for Update Project Cost', 'XeroPage'),
      uploadIcon: ArrowUpTrayIcon,
      runIcon: PlayIcon,
    },
    {
      name: 'Manhour Billing',
      description: 'Generates invoices for clients based on billable manhours logged for specific projects in Xero.',
      action: () => addLog('Manhour Billing button clicked', 'XeroPage'),
      icon: PlayIcon,
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Xero Functions</h1>
      <p className="mt-2 text-sm text-gray-700 mb-8">
        This page provides custom functions to interact with Xero data and streamline your project management workflows.
      </p>

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
                    className="inline-flex items-center justify-center rounded-md border border-transparent bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 transition-colors duration-150"
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
                    disabled={func.disabled} // Apply disabled state
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
