'use client';

import { useState, useCallback } from 'react';

export const useSyncProject = () => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [comparisonReportContent, setComparisonReportContent] = useState<string | null>(null);
  const [showDownloadReportButton, setShowDownloadReportButton] = useState(false);

  const fetchPipedriveProjects = useCallback(async () => {
    const response = await fetch('/api/pipedrive/projects');
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`HTTP error! status: ${response.status} - ${errorData.message || 'Unknown error'}`);
    }
    const data = await response.json();
    return data.projects; 
  }, []);

  const fetchXeroProjects = useCallback(async () => {
    const response = await fetch('/api/xero/projects');
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }
    const data = await response.json();
    return data.projects;
  }, []);

  const compareProjects = useCallback(async (pipedriveProjects: any[], xeroProjects: any[]) => {
    const response = await fetch('/api/compare/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipedriveProjects, xeroProjects }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    const result = data.comparisonResult;
    const now = new Date();
    const reportDateTime = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;

    let generatedReport = `========================================
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
========================================

Summary:
  - Matched Projects: ${result.matchedCount}
  - Projects in Pipedrive only: ${result.onlyInPipedriveCount}
  - Projects in Xero only: ${result.onlyInXeroCount}
========================================
`;

    if (result.onlyInPipedriveCount > 0) {
      generatedReport += `\n--- Projects in Pipedrive but not in Xero (${result.onlyInPipedriveCount}) ---\n`;
      result.projectsOnlyInPipedrive.forEach((p: {name: string, key: string}, index: number) => {
        generatedReport += `${String(index + 1).padStart(3, ' ')}. Name: ${p.name}\n     Key:  ${p.key}\n`;
      });
    } else {
      generatedReport += "\n--- No projects found only in Pipedrive ---";
    }
    
    generatedReport += "\n";
    
    if (result.onlyInXeroCount > 0) {
      generatedReport += `\n--- Projects in Xero but not in Pipedrive (${result.onlyInXeroCount}) ---\n`;
      result.projectsOnlyInXero.forEach((x: {name: string, key: string}, index: number) => {
        generatedReport += `${String(index + 1).padStart(3, ' ')}. Name: ${x.name}\n     Key:  ${x.key}\n`;
      });
    } else {
      generatedReport += "\n--- No projects found only in Xero ---";
    }
    
    generatedReport += "\n";
    
    if (result.matchedCount > 0 && result.onlyInPipedriveCount === 0 && result.onlyInXeroCount === 0) {
      generatedReport += "\n--- All projects are perfectly matched! ---";
    } else if (result.matchedCount === 0 && result.onlyInPipedriveCount === 0 && result.onlyInXeroCount === 0) {
      generatedReport += "\n--- No projects found in either system. ---";
    }
    
    generatedReport += `
========================================
End of Report
========================================
`;
    
    return { ...result, reportText: generatedReport };
  }, []);

  const handleSyncProject = useCallback(async () => {
    setIsSyncing(true);
    setComparisonReportContent(null);
    setShowDownloadReportButton(false);

    try {
      // Fetch projects from both systems
      const [pdProjects, xrProjects] = await Promise.all([
        fetchPipedriveProjects(),
        fetchXeroProjects()
      ]);

      // Compare projects
      const comparisonData = await compareProjects(pdProjects, xrProjects);
      
      if (comparisonData && comparisonData.reportText) {
        setComparisonReportContent(comparisonData.reportText);
        setShowDownloadReportButton(true);
      }
    } catch (error) {
      console.error('Sync project failed:', error);
      throw error;
    } finally {
      setIsSyncing(false);
    }
  }, [fetchPipedriveProjects, fetchXeroProjects, compareProjects]);

  const handleDownloadReport = useCallback(() => {
    if (!comparisonReportContent) {
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
  }, [comparisonReportContent]);

  return {
    isSyncing,
    comparisonReportContent,
    showDownloadReportButton,
    handleSyncProject,
    handleDownloadReport,
  };
};
