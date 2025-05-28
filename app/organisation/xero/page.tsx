'use client';

import React, { useState } from 'react';
import { useLog } from '../../../contexts/LogContext';
import { PlayIcon, ArrowUpTrayIcon, ArrowDownTrayIcon } from '@heroicons/react/20/solid'; // Added ArrowDownTrayIcon

export default function XeroPage() {
  const { addLog } = useLog();
  const [projectCostFileUploaded, setProjectCostFileUploaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [comparisonReportContent, setComparisonReportContent] = useState<string | null>(null);
  const [showDownloadReportButton, setShowDownloadReportButton] = useState(false);

  // --- New async functions for Sync Project ---
  const fetchPipedriveProjects = async () => {
    const logId = addLog({ message: 'Fetching Pipedrive projects...', source: 'SyncProject' });
    try {
      const response = await fetch('/api/pipedrive/projects');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        const errorMessage = `Fetching Pipedrive projects... HTTP Error.\\nStatus: ${response.status} - ${errorData.message || 'Unknown error'}`;
        addLog({ message: errorMessage, idToUpdate: logId, mode: 'replace' });
        throw new Error(`HTTP error! status: ${response.status} - ${errorData.message || 'Unknown error'}`);
      }
      const data = await response.json();

      if (data.projects && Array.isArray(data.projects)) {
        const totalProjects = data.projects.length;
        addLog({ message: 'Fetching Pipedrive projects... Success.', idToUpdate: logId, mode: 'replace' });
        addLog({ message: `\\nSuccessfully fetched ${totalProjects} project(s) from Pipedrive.`, idToUpdate: logId, mode: 'append' });

        const stageSummaryMap: { [key: string]: number } = {};
        data.projects.forEach((project: any) => {
          const stageName = project.stage_name || 'Unknown Stage';
          stageSummaryMap[stageName] = (stageSummaryMap[stageName] || 0) + 1;
        });
        const sortedStageSummary = Object.entries(stageSummaryMap)
          .map(([stageName, count]) => ({ stageName, count }))
          .sort((a, b) => b.count - a.count);

        if (totalProjects > 0) {
          addLog({ message: '\\nSummary by Pipedrive Project Stage (Sorted by Count): ', idToUpdate: logId, mode: 'append' });
          sortedStageSummary.forEach(item => {
            addLog({ message: `\\n  ${item.stageName}: ${item.count} project(s)`, idToUpdate: logId, mode: 'append' });
          });
        } else {
          addLog({ message: '\\nNo Pipedrive projects found to summarize by stage.', idToUpdate: logId, mode: 'append' });
        }

        if (totalProjects > 0 && totalProjects <= 10) {
            const projectNames = data.projects.map((project: any) => project.name || 'Unnamed Project').join(', ');
            addLog({ message: `\\nPipedrive Project Names (sample): ${projectNames}`, idToUpdate: logId, mode: 'append' });
        } else if (totalProjects > 10) {
            addLog({ message: `\\nDisplaying full list of ${totalProjects} Pipedrive project names is omitted for brevity.`, idToUpdate: logId, mode: 'append' });
        }
      } else {
        const warningMessage = 'Fetching Pipedrive projects... Warning.\\nPipedrive response did not contain a valid .projects array or data is not in expected format.';
        addLog({ message: warningMessage, idToUpdate: logId, mode: 'replace' });
        addLog({ message: `\\nResponse data: ${JSON.stringify(data, null, 2)}`, idToUpdate: logId, mode: 'append' });
      }
      return data.projects; 
    } catch (error) {
      const failureMessage = `Fetching Pipedrive projects... Failed.\\nError: ${(error as Error).message}`;
      addLog({ message: failureMessage, idToUpdate: logId, mode: 'replace' });
      throw error;
    }
  };

  const fetchXeroProjects = async () => {
    // 1. Initial log: "Fetching Xero Projects..."
    const logId = addLog({ message: 'Fetching projects from Xero...', source: 'SyncProject' });
    try {
      const response = await fetch('/api/xero/projects');

      if (!response.ok) {
        const errorText = await response.text();
        // 2. Update log on HTTP error: "Fetching Xero Projects... HTTP Error." + details
        addLog({
          message: `Fetching projects from Xero... HTTP Error.\\nStatus: ${response.status} - ${errorText}`,
          idToUpdate: logId,
          mode: 'replace',
        });
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      if (data.projects && Array.isArray(data.projects)) {
        // 3. Update log on success: "Fetching Xero Projects... Success."
        addLog({
          message: 'Fetching projects from Xero... Success.',
          idToUpdate: logId,
          mode: 'replace',
        });
        // 4. Append details: "Fetched X projects."
        addLog({
          message: `\\nSuccessfully fetched ${data.projects.length} Xero projects.`,
          idToUpdate: logId,
          mode: 'append',
        });
      } else {
        // 5. Update log on warning (no projects array): "Fetching Xero Projects... Warning." + details
        addLog({
          message: 'Fetching projects from Xero... Warning.\\nNo projects array in Xero response or data is not in expected format.',
          idToUpdate: logId,
          mode: 'replace',
        });
      }
      return data.projects; // This could be undefined if not an array, or an empty array
    } catch (error) {
      // 6. Update log on any other failure: "Fetching Xero Projects... Failed." + details
      addLog({
        message: `Fetching projects from Xero... Failed.\\nError: ${(error as Error).message}`,
        idToUpdate: logId,
        mode: 'replace',
      });
      throw error;
    }
  };

  const compareProjects = async (pipedriveProjects: any[], xeroProjects: any[]) => {
    const logId = addLog({ message: 'Comparing Pipedrive and Xero projects...\nThis may take a moment.', source: 'SyncProject' });
    let generatedReport = ''; // To store the report for download
    try {
      const response = await fetch('/api/compare/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pipedriveProjects, xeroProjects }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        addLog({ message: `Comparing Pipedrive and Xero projects... HTTP Error.\\nStatus: ${response.status} - ${errorText}`, idToUpdate: logId, mode: 'replace' });
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }
      const data = await response.json();
      const result = data.comparisonResult;

      const now = new Date();
      const reportDateTime = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;

      generatedReport = `
========================================
Project Comparison Report
========================================
Date: ${reportDateTime}

Source Systems:
  - Pipedrive (Deals)
  - Xero (Projects)

Comparison Key Logic:
  - Extracts text before " - " in project name.
  - Removes all spaces.
  - Converts to lowercase.
  - (If " - " is absent, processes the whole name similarly.)
========================================

Summary:
  - Matched Projects: ${result.matchedCount}
  - Projects in Pipedrive only: ${result.onlyInPipedriveCount}
  - Projects in Xero only: ${result.onlyInXeroCount}
========================================
`;

      if (result.onlyInPipedriveCount > 0) {
        generatedReport += `
--- Projects in Pipedrive but not in Xero (${result.onlyInPipedriveCount}) ---
`;
        result.projectsOnlyInPipedrive.forEach((p: {name: string, key: string}, index: number) => {
          generatedReport += `${String(index + 1).padStart(3, ' ')}. Name: ${p.name}\n     Key:  ${p.key}\n`;
        });
      } else {
        generatedReport += "\n--- No projects found only in Pipedrive ---";
      }
      generatedReport += "\n"; // Extra newline for separation

      if (result.onlyInXeroCount > 0) {
        generatedReport += `
--- Projects in Xero but not in Pipedrive (${result.onlyInXeroCount}) ---
`;
        result.projectsOnlyInXero.forEach((x: {name: string, key: string}, index: number) => {
          generatedReport += `${String(index + 1).padStart(3, ' ')}. Name: ${x.name}\n     Key:  ${x.key}\n`;
        });
      } else {
        generatedReport += "\n--- No projects found only in Xero ---";
      }
      generatedReport += "\n"; // Extra newline for separation

      if (result.matchedCount > 0 && result.onlyInPipedriveCount === 0 && result.onlyInXeroCount === 0) {
        generatedReport += "\n--- All projects are perfectly matched based on the comparison key! ---";
      } else if (result.matchedCount === 0 && result.onlyInPipedriveCount === 0 && result.onlyInXeroCount === 0) {
        generatedReport += "\n--- No projects found in either system to compare. ---";
      }

      generatedReport += `
========================================
End of Report
========================================
`;

      addLog({ message: 'Comparison complete. Report generated (see below):\n' + generatedReport, idToUpdate: logId, mode: 'replace' });
      return { ...result, reportText: generatedReport }; // Return the report text along with other results
    } catch (error) {
      generatedReport = `Comparing Pipedrive and Xero projects... Failed.\nError: ${(error as Error).message}`;
      addLog({ message: generatedReport, idToUpdate: logId, mode: 'replace' });
      // Store partial error report if needed, or ensure it's clear
      // For now, just rethrow, handleSyncProject will catch it.
      throw error; // Re-throw to be caught by handleSyncProject
    }
  };

  const handleSyncProject = async () => {
    setIsSyncing(true);
    setComparisonReportContent(null); // Reset previous report
    setShowDownloadReportButton(false); // Hide button at start of new sync
    const mainLogId = addLog({ message: 'Sync Project: Initiated\n', source: 'SyncProject' }); 

    try {
      addLog({ message: 'Sync Project: Fetching Pipedrive projects (see separate log entry for details)...\\n', idToUpdate: mainLogId, mode: 'append' });
      const pipedriveProjects = await fetchPipedriveProjects(); 
      if (pipedriveProjects) {
        addLog({ message: `Sync Project: Pipedrive projects processing complete. Found ${pipedriveProjects.length} projects.\\n`, idToUpdate: mainLogId, mode: 'append' });
      } else {
        addLog({ message: 'Sync Project: Pipedrive project data was not in the expected format or fetch was unsuccessful. Check separate Pipedrive fetch log.\\n', idToUpdate: mainLogId, mode: 'append' });
      }

      addLog({ message: 'Sync Project: Fetching Xero projects (see separate log entry for details)...\\n', idToUpdate: mainLogId, mode: 'append' });
      const xeroProjects = await fetchXeroProjects(); 
      
      if (xeroProjects) { 
        addLog({ message: `Sync Project: Xero projects processing complete. Found ${xeroProjects.length} projects.\\n`, idToUpdate: mainLogId, mode: 'append' });

        const totalXeroProjects = xeroProjects.length;
        if (totalXeroProjects > 0) {
          const statusSummaryMap: { [key: string]: number } = {};
          xeroProjects.forEach((project: any) => {
            const status = project.status || 'Unknown Status';
            statusSummaryMap[status] = (statusSummaryMap[status] || 0) + 1;
          });
          const sortedStatusSummary = Object.entries(statusSummaryMap)
            .map(([status, count]) => ({ status, count }))
            .sort((a, b) => b.count - a.count);

          addLog({ message: 'Summary by Xero Project Status (Sorted by Count):\\n', idToUpdate: mainLogId, mode: 'append' });
          sortedStatusSummary.forEach(item => {
            addLog({ message: `  ${item.status}: ${item.count} project(s)\\n`, idToUpdate: mainLogId, mode: 'append' });
          });

          if (totalXeroProjects <= 10) { 
              const projectNames = xeroProjects.map((project: any) => project.name || 'Unnamed Project').join(', ');
              addLog({ message: `Xero Project Names (sample): ${projectNames}\\n`, idToUpdate: mainLogId, mode: 'append' });
          } else if (totalXeroProjects > 10) {
              addLog({ message: `Displaying full list of ${totalXeroProjects} Xero project names is omitted for brevity.\\n`, idToUpdate: mainLogId, mode: 'append' });
          }
        } else {
          addLog({ message: 'Sync Project: No projects found in Xero to summarize.\\n', idToUpdate: mainLogId, mode: 'append' });
        }
      } else {
        addLog({ message: 'Sync Project: Xero project data was not in the expected format or fetch was unsuccessful. Check separate Xero fetch log.\\n', idToUpdate: mainLogId, mode: 'append' });
      }
      
      addLog({ message: 'Sync Project: Comparing projects (see separate log entry for details)...\\n', idToUpdate: mainLogId, mode: 'append' });
      if (pipedriveProjects && xeroProjects) { 
        const comparisonData = await compareProjects(pipedriveProjects, xeroProjects);
        addLog({ message: `Sync Project: Comparison finished.\n`, idToUpdate: mainLogId, mode: 'append' });
        if (comparisonData && comparisonData.reportText) {
          setComparisonReportContent(comparisonData.reportText);
          setShowDownloadReportButton(true);
          addLog({ message: 'Sync Project: Comparison report is available for download.\n', idToUpdate: mainLogId, mode: 'append' });
        }
      } else {
        addLog({ message: 'Sync Project: Skipping comparison due to missing data from Pipedrive or Xero.\\n', idToUpdate: mainLogId, mode: 'append' });
      }

    } catch (error) {
      // This catches errors thrown by fetchPipedriveProjects, fetchXeroProjects, or compareProjects
      addLog({
        message: `Sync Project: Process failed.\\nError: ${(error as Error).message}\\n(Check individual step logs for more details)`,
        idToUpdate: mainLogId,
        mode: 'append',
      });
    } finally {
      setIsSyncing(false);
      // Ensure the final "Process finished" message is appended after all other appends to mainLogId
      // Use a slight delay if necessary, or rely on the natural flow if robust enough.
      addLog({ message: 'Sync Project: Process finished.\n', idToUpdate: mainLogId, mode: 'append' });
    }
  };

  const handleDownloadReport = () => {
    if (!comparisonReportContent) {
      addLog({ message: 'No report content available to download.', source: 'XeroPage' });
      return;
    }
    const blob = new Blob([comparisonReportContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.download = `project_comparison_report_${timestamp}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addLog({ message: 'Comparison report downloaded.', source: 'XeroPage' });
  };

  // --- End of new async functions ---

  const functions = [
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
      // Specific actions and icons for this card type
      uploadAction: () => {
        addLog({ message: 'Upload File button clicked for Update Project Cost', source: 'XeroPage' });
        setProjectCostFileUploaded(true);
      },
      runAction: () => addLog({ message: 'Run button clicked for Update Project Cost', source: 'XeroPage' }),
      uploadIcon: ArrowUpTrayIcon,
      runIcon: PlayIcon,
    },
    {
      name: 'Manhour Billing',
      description: 'Generates invoices for clients based on billable manhours logged for specific projects in Xero.',
      action: () => addLog({ message: 'Manhour Billing button clicked', source: 'XeroPage' }),
      icon: PlayIcon,
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Xero Functions</h1>
      <p className="mt-2 text-sm text-gray-700 mb-8">
        This page provides custom functions to interact with Xero data and streamline your project management workflows.
      </p>

      {showDownloadReportButton && comparisonReportContent && (
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
