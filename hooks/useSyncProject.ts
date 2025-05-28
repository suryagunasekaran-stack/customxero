
'use client';

import { useState, useCallback } from 'react';
import { useLog } from '../contexts/LogContext';

export const useSyncProject = () => {
  const { addLog } = useLog();
  const [isSyncing, setIsSyncing] = useState(false);
  const [comparisonReportContent, setComparisonReportContent] = useState<string | null>(null);
  const [showDownloadReportButton, setShowDownloadReportButton] = useState(false);

  const fetchPipedriveProjects = useCallback(async () => {
    const logId = addLog({ message: 'Fetching Pipedrive projects...', source: 'useSyncProject' });
    try {
      const response = await fetch('/api/pipedrive/projects');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        const errorMessage = `Fetching Pipedrive projects... HTTP Error.\\nStatus: ${response.status} - ${errorData.message || 'Unknown error'}`;
        addLog({ message: errorMessage, idToUpdate: logId, mode: 'replace', source: 'useSyncProject' });
        throw new Error(`HTTP error! status: ${response.status} - ${errorData.message || 'Unknown error'}`);
      }
      const data = await response.json();

      if (data.projects && Array.isArray(data.projects)) {
        const totalProjects = data.projects.length;
        addLog({ message: 'Fetching Pipedrive projects... Success.', idToUpdate: logId, mode: 'replace', source: 'useSyncProject' });
        addLog({ message: `\\nSuccessfully fetched ${totalProjects} project(s) from Pipedrive.`, idToUpdate: logId, mode: 'append', source: 'useSyncProject' });

        const stageSummaryMap: { [key: string]: number } = {};
        data.projects.forEach((project: any) => {
          const stageName = project.stage_name || 'Unknown Stage';
          stageSummaryMap[stageName] = (stageSummaryMap[stageName] || 0) + 1;
        });
        const sortedStageSummary = Object.entries(stageSummaryMap)
          .map(([stageName, count]) => ({ stageName, count }))
          .sort((a, b) => b.count - a.count);

        if (totalProjects > 0) {
          addLog({ message: '\\nSummary by Pipedrive Project Stage (Sorted by Count): ', idToUpdate: logId, mode: 'append', source: 'useSyncProject' });
          sortedStageSummary.forEach(item => {
            addLog({ message: `\\n  ${item.stageName}: ${item.count} project(s)`, idToUpdate: logId, mode: 'append', source: 'useSyncProject' });
          });
        } else {
          addLog({ message: '\\nNo Pipedrive projects found to summarize by stage.', idToUpdate: logId, mode: 'append', source: 'useSyncProject' });
        }

        if (totalProjects > 0 && totalProjects <= 10) {
            const projectNames = data.projects.map((project: any) => project.name || 'Unnamed Project').join(', ');
            addLog({ message: `\\nPipedrive Project Names (sample): ${projectNames}`, idToUpdate: logId, mode: 'append', source: 'useSyncProject' });
        } else if (totalProjects > 10) {
            addLog({ message: `\\nDisplaying full list of ${totalProjects} Pipedrive project names is omitted for brevity.`, idToUpdate: logId, mode: 'append', source: 'useSyncProject' });
        }
      } else {
        const warningMessage = 'Fetching Pipedrive projects... Warning.\\nPipedrive response did not contain a valid .projects array or data is not in expected format.';
        addLog({ message: warningMessage, idToUpdate: logId, mode: 'replace', source: 'useSyncProject' });
        addLog({ message: `\\nResponse data: ${JSON.stringify(data, null, 2)}`, idToUpdate: logId, mode: 'append', source: 'useSyncProject' });
      }
      return data.projects; 
    } catch (error) {
      const failureMessage = `Fetching Pipedrive projects... Failed.\\nError: ${(error as Error).message}`;
      addLog({ message: failureMessage, idToUpdate: logId, mode: 'replace', source: 'useSyncProject' });
      throw error;
    }
  }, [addLog]);

  const fetchXeroProjects = useCallback(async () => {
    const logId = addLog({ message: 'Fetching projects from Xero...', source: 'useSyncProject' });
    try {
      const response = await fetch('/api/xero/projects');
      if (!response.ok) {
        const errorText = await response.text();
        addLog({
          message: `Fetching projects from Xero... HTTP Error.\\nStatus: ${response.status} - ${errorText}`,
          idToUpdate: logId,
          mode: 'replace',
          source: 'useSyncProject',
        });
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }
      const data = await response.json();
      if (data.projects && Array.isArray(data.projects)) {
        addLog({
          message: 'Fetching projects from Xero... Success.',
          idToUpdate: logId,
          mode: 'replace',
          source: 'useSyncProject',
        });
        addLog({
          message: `\\nSuccessfully fetched ${data.projects.length} Xero projects.`,
          idToUpdate: logId,
          mode: 'append',
          source: 'useSyncProject',
        });
      } else {
        addLog({
          message: 'Fetching projects from Xero... Warning.\\nNo projects array in Xero response or data is not in expected format.',
          idToUpdate: logId,
          mode: 'replace',
          source: 'useSyncProject',
        });
      }
      return data.projects;
    } catch (error) {
      addLog({
        message: `Fetching projects from Xero... Failed.\\nError: ${(error as Error).message}`,
        idToUpdate: logId,
        mode: 'replace',
        source: 'useSyncProject',
      });
      throw error;
    }
  }, [addLog]);

  const compareProjects = useCallback(async (pipedriveProjects: any[], xeroProjects: any[]) => {
    const logId = addLog({ message: 'Comparing Pipedrive and Xero projects...\\nThis may take a moment.', source: 'useSyncProject' });
    let generatedReport = '';
    try {
      const response = await fetch('/api/compare/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipedriveProjects, xeroProjects }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        addLog({ message: `Comparing Pipedrive and Xero projects... HTTP Error.\\nStatus: ${response.status} - ${errorText}`, idToUpdate: logId, mode: 'replace', source: 'useSyncProject' });
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
        generatedReport += `\\n--- Projects in Pipedrive but not in Xero (${result.onlyInPipedriveCount}) ---\\n`;
        result.projectsOnlyInPipedrive.forEach((p: {name: string, key: string}, index: number) => {
          generatedReport += `${String(index + 1).padStart(3, ' ')}. Name: ${p.name}\\n     Key:  ${p.key}\\n`;
        });
      } else {
        generatedReport += "\\n--- No projects found only in Pipedrive ---";
      }
      generatedReport += "\\n";
      if (result.onlyInXeroCount > 0) {
        generatedReport += `\\n--- Projects in Xero but not in Pipedrive (${result.onlyInXeroCount}) ---\\n`;
        result.projectsOnlyInXero.forEach((x: {name: string, key: string}, index: number) => {
          generatedReport += `${String(index + 1).padStart(3, ' ')}. Name: ${x.name}\\n     Key:  ${x.key}\\n`;
        });
      } else {
        generatedReport += "\\n--- No projects found only in Xero ---";
      }
      generatedReport += "\\n";
      if (result.matchedCount > 0 && result.onlyInPipedriveCount === 0 && result.onlyInXeroCount === 0) {
        generatedReport += "\\n--- All projects are perfectly matched based on the comparison key! ---";
      } else if (result.matchedCount === 0 && result.onlyInPipedriveCount === 0 && result.onlyInXeroCount === 0) {
        generatedReport += "\\n--- No projects found in either system to compare. ---";
      }
      generatedReport += `
========================================
End of Report
========================================
`;
      addLog({ message: 'Comparison complete. Report generated (see below):\\n' + generatedReport, idToUpdate: logId, mode: 'replace', source: 'useSyncProject' });
      return { ...result, reportText: generatedReport };
    } catch (error) {
      generatedReport = `Comparing Pipedrive and Xero projects... Failed.\\nError: ${(error as Error).message}`;
      addLog({ message: generatedReport, idToUpdate: logId, mode: 'replace', source: 'useSyncProject' });
      throw error;
    }
  }, [addLog]);

  const handleSyncProject = useCallback(async () => {
    setIsSyncing(true);
    setComparisonReportContent(null);
    setShowDownloadReportButton(false);
    const mainLogId = addLog({ message: 'Sync Project: Initiated\\n', source: 'useSyncProject' });

    try {
      addLog({ message: 'Sync Project: Fetching Pipedrive projects (see separate log entry for details)...\\n', idToUpdate: mainLogId, mode: 'append', source: 'useSyncProject' });
      const pdProjects = await fetchPipedriveProjects();
      if (pdProjects) {
        addLog({ message: `Sync Project: Pipedrive projects processing complete. Found ${pdProjects.length} projects.\\n`, idToUpdate: mainLogId, mode: 'append', source: 'useSyncProject' });
      } else {
        addLog({ message: 'Sync Project: Pipedrive project data was not in the expected format or fetch was unsuccessful. Check separate Pipedrive fetch log.\\n', idToUpdate: mainLogId, mode: 'append', source: 'useSyncProject' });
      }

      addLog({ message: 'Sync Project: Fetching Xero projects (see separate log entry for details)...\\n', idToUpdate: mainLogId, mode: 'append', source: 'useSyncProject' });
      const xrProjects = await fetchXeroProjects();
      if (xrProjects) {
        addLog({ message: `Sync Project: Xero projects processing complete. Found ${xrProjects.length} projects.\\n`, idToUpdate: mainLogId, mode: 'append', source: 'useSyncProject' });
        const totalXeroProjects = xrProjects.length;
        if (totalXeroProjects > 0) {
          const statusSummaryMap: { [key: string]: number } = {};
          xrProjects.forEach((project: any) => {
            const status = project.status || 'Unknown Status';
            statusSummaryMap[status] = (statusSummaryMap[status] || 0) + 1;
          });
          const sortedStatusSummary = Object.entries(statusSummaryMap)
            .map(([status, count]) => ({ status, count }))
            .sort((a, b) => b.count - a.count);
          addLog({ message: 'Summary by Xero Project Status (Sorted by Count):\\n', idToUpdate: mainLogId, mode: 'append', source: 'useSyncProject' });
          sortedStatusSummary.forEach(item => {
            addLog({ message: `  ${item.status}: ${item.count} project(s)\\n`, idToUpdate: mainLogId, mode: 'append', source: 'useSyncProject' });
          });
          // Summary for Xero projects can be part of the main log or its own evolving log. Keeping it in main for now.
        } else {
          addLog({ message: 'Sync Project: No projects found in Xero to summarize.\\n', idToUpdate: mainLogId, mode: 'append', source: 'useSyncProject' });
        }
      } else {
        addLog({ message: 'Sync Project: Xero project data was not in the expected format or fetch was unsuccessful. Check separate Xero fetch log.\\n', idToUpdate: mainLogId, mode: 'append', source: 'useSyncProject' });
      }

      addLog({ message: 'Sync Project: Comparing projects (see separate log entry for details)...\\n', idToUpdate: mainLogId, mode: 'append', source: 'useSyncProject' });
      if (pdProjects && xrProjects) {
        const comparisonData = await compareProjects(pdProjects, xrProjects);
        addLog({ message: `Sync Project: Comparison finished.\\n`, idToUpdate: mainLogId, mode: 'append', source: 'useSyncProject' });
        if (comparisonData && comparisonData.reportText) {
          setComparisonReportContent(comparisonData.reportText);
          setShowDownloadReportButton(true);
          addLog({ message: 'Sync Project: Comparison report is available for download.\\n', idToUpdate: mainLogId, mode: 'append', source: 'useSyncProject' });
        }
      } else {
        addLog({ message: 'Sync Project: Skipping comparison due to missing data from Pipedrive or Xero.\\n', idToUpdate: mainLogId, mode: 'append', source: 'useSyncProject' });
      }
    } catch (error) {
      addLog({
        message: `Sync Project: Process failed.\\nError: ${(error as Error).message}\\n(Check individual step logs for more details)`,
        idToUpdate: mainLogId,
        mode: 'append',
        source: 'useSyncProject',
      });
    } finally {
      setIsSyncing(false);
      addLog({ message: 'Sync Project: Process finished.\\n', idToUpdate: mainLogId, mode: 'append', source: 'useSyncProject' });
    }
  }, [addLog, fetchPipedriveProjects, fetchXeroProjects, compareProjects]);

  const handleDownloadReport = useCallback(() => {
    if (!comparisonReportContent) {
      addLog({ message: 'No report content available to download.', source: 'useSyncProject' });
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
    addLog({ message: 'Comparison report downloaded.', source: 'useSyncProject' });
  }, [addLog, comparisonReportContent]);

  return {
    isSyncing,
    comparisonReportContent,
    showDownloadReportButton,
    handleSyncProject,
    handleDownloadReport,
  };
};
