'use client';

import { useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { ProfessionalReportGenerator, ReportMetadata, ProjectComparisonData } from '@/lib/reportGenerator';

export const useSyncProject = () => {
  const { data: session } = useSession();
  const [isSyncing, setIsSyncing] = useState(false);
  const [comparisonData, setComparisonData] = useState<ProjectComparisonData | null>(null);
  const [showDownloadOptions, setShowDownloadOptions] = useState(false);
  const [reportMetadata, setReportMetadata] = useState<ReportMetadata | null>(null);

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

  const fetchTenantInfo = useCallback(async () => {
    try {
      const response = await fetch('/api/tenants');
      if (response.ok) {
        const tenantData = await response.json();
        const currentTenant = tenantData.availableTenants?.find(
          (t: any) => t.tenantId === tenantData.selectedTenant
        );
        return {
          tenantName: currentTenant?.tenantName || 'Unknown Organisation',
          tenantId: tenantData.selectedTenant || 'unknown',
          tenantType: currentTenant?.tenantType || 'ORGANISATION'
        };
      }
    } catch (error) {
      console.error('Failed to fetch tenant info:', error);
    }
    return {
      tenantName: 'Unknown Organisation',
      tenantId: 'unknown',
      tenantType: 'ORGANISATION'
    };
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

    // Transform the data to include more details for professional reporting
    const enhancedResult: ProjectComparisonData = {
      matchedCount: result.matchedCount,
      onlyInPipedriveCount: result.onlyInPipedriveCount,
      onlyInXeroCount: result.onlyInXeroCount,
      projectsOnlyInPipedrive: result.projectsOnlyInPipedrive?.map((p: any) => ({
        name: p.name,
        key: p.key,
        id: p.id,
        status: p.status || 'Active'
      })) || [],
      projectsOnlyInXero: result.projectsOnlyInXero?.map((x: any) => ({
        name: x.name,
        key: x.key,
        id: x.projectId,
        status: x.status || 'INPROGRESS'
      })) || [],
      // Include matched projects for detailed reporting
      matchedProjects: result.matchedProjects || []
    };

    return enhancedResult;
  }, []);

  const handleSyncProject = useCallback(async () => {
    setIsSyncing(true);
    setComparisonData(null);
    setShowDownloadOptions(false);
    setReportMetadata(null);

    try {
      // Fetch projects from both systems and tenant info in parallel
      const [pdProjects, xrProjects, tenantInfo] = await Promise.all([
        fetchPipedriveProjects(),
        fetchXeroProjects(),
        fetchTenantInfo()
      ]);

      // Compare projects
      const comparisonResult = await compareProjects(pdProjects, xrProjects);
      
      // Create metadata for the report
      const metadata: ReportMetadata = {
        reportTitle: 'Project Comparison Report',
        generatedBy: session?.user?.name || session?.user?.email || 'Unknown User',
        userEmail: session?.user?.email || 'unknown@example.com',
        tenantName: tenantInfo.tenantName,
        tenantId: tenantInfo.tenantId,
        generatedAt: new Date(),
        reportType: 'Project Synchronization Analysis',
        version: '2.0'
      };
      
      setComparisonData(comparisonResult);
      setReportMetadata(metadata);
      setShowDownloadOptions(true);
    } catch (error) {
      console.error('Sync project failed:', error);
      throw error;
    } finally {
      setIsSyncing(false);
    }
  }, [fetchPipedriveProjects, fetchXeroProjects, fetchTenantInfo, compareProjects, session]);

  const handleDownloadReport = useCallback(async (format: 'xlsx' | 'csv' | 'txt' = 'xlsx') => {
    if (!comparisonData || !reportMetadata) {
      console.error('No comparison data or metadata available for download');
      return;
    }
    
    try {
      await ProfessionalReportGenerator.generateProjectComparisonReport(
        comparisonData,
        reportMetadata,
        format
      );
    } catch (error) {
      console.error('Failed to generate report:', error);
      throw error;
    }
  }, [comparisonData, reportMetadata]);

  // Generate summary text for display (keeping backwards compatibility)
  const generateSummaryText = useCallback((data: ProjectComparisonData, metadata: ReportMetadata): string => {
    const reportDateTime = metadata.generatedAt.toLocaleString();

    return `========================================
Project Comparison Report
========================================
Date: ${reportDateTime}
Organisation: ${metadata.tenantName}
Generated by: ${metadata.generatedBy}

Source Systems:
  - Pipedrive (Deals)
  - Xero (Projects)

Comparison Key Logic:
  - Extracts text before " - " in project name.
  - Removes all spaces.
  - Converts to lowercase.
========================================

Summary:
  - Matched Projects: ${data.matchedCount}
  - Projects in Pipedrive only: ${data.onlyInPipedriveCount}
  - Projects in Xero only: ${data.onlyInXeroCount}
  - Synchronization Level: ${getSyncStatus(data)}
========================================

${data.onlyInPipedriveCount > 0 ? `--- Projects in Pipedrive but not in Xero (${data.onlyInPipedriveCount}) ---
${data.projectsOnlyInPipedrive.map((p, i) => `${String(i + 1).padStart(3, ' ')}. Name: ${p.name}\n     Key:  ${p.key}`).join('\n')}` : '--- No projects found only in Pipedrive ---'}

${data.onlyInXeroCount > 0 ? `--- Projects in Xero but not in Pipedrive (${data.onlyInXeroCount}) ---
${data.projectsOnlyInXero.map((x, i) => `${String(i + 1).padStart(3, ' ')}. Name: ${x.name}\n     Key:  ${x.key}`).join('\n')}` : '--- No projects found only in Xero ---'}

${data.matchedCount > 0 && data.onlyInPipedriveCount === 0 && data.onlyInXeroCount === 0 
  ? '--- All projects are perfectly matched! ---' 
  : data.matchedCount === 0 && data.onlyInPipedriveCount === 0 && data.onlyInXeroCount === 0 
    ? '--- No projects found in either system. ---' 
    : ''}

========================================
End of Report
========================================`;
  }, []);

  const getSyncStatus = (data: ProjectComparisonData): string => {
    const total = data.matchedCount + data.onlyInPipedriveCount + data.onlyInXeroCount;
    if (total === 0) return 'No Data';
    
    const syncPercentage = (data.matchedCount / total) * 100;
    
    if (syncPercentage === 100) return 'Perfect Sync (100%)';
    if (syncPercentage >= 90) return `Excellent (${syncPercentage.toFixed(1)}%)`;
    if (syncPercentage >= 75) return `Good (${syncPercentage.toFixed(1)}%)`;
    if (syncPercentage >= 50) return `Moderate (${syncPercentage.toFixed(1)}%)`;
    return `Needs Attention (${syncPercentage.toFixed(1)}%)`;
  };

  // Legacy text report for backwards compatibility
  const comparisonReportContent = comparisonData && reportMetadata 
    ? generateSummaryText(comparisonData, reportMetadata) 
    : null;

  return {
    isSyncing,
    comparisonReportContent, // Legacy support
    comparisonData, // New structured data
    reportMetadata, // New metadata
    showDownloadReportButton: showDownloadOptions, // Legacy support
    showDownloadOptions, // New property name
    handleSyncProject,
    handleDownloadReport,
    // Legacy method for backwards compatibility
    handleDownloadReportLegacy: () => handleDownloadReport('txt')
  };
};
