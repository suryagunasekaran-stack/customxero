'use client';

import { useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { ProfessionalReportGenerator, ReportMetadata, ProjectComparisonData } from '@/lib/reportGenerator';

/**
 * Custom hook for managing project synchronization workflow between Xero and Pipedrive
 * Provides complete project analysis, comparison, and professional report generation
 * @returns {Object} Hook state and methods for project synchronization workflow
 */
export const useSyncProject = () => {
  const { data: session } = useSession();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [comparisonData, setComparisonData] = useState<ProjectComparisonData | null>(null);
  const [showDownloadOptions, setShowDownloadOptions] = useState(false);
  const [reportMetadata, setReportMetadata] = useState<ReportMetadata | null>(null);

  /**
   * Fetches project data from Pipedrive API (won deals)
   * @returns {Promise<any[]>} Array of Pipedrive project objects
   * @throws {Error} When API request fails or returns non-ok status
   */
  const fetchPipedriveProjects = useCallback(async () => {
    const response = await fetch('/api/pipedrive/projects');
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      
      // Handle cases where Pipedrive is disabled for the tenant
      if (response.status === 403) {
        throw new Error(`PIPEDRIVE_DISABLED: ${errorData.message || 'Pipedrive integration is disabled for this organization'}`);
      }
      
      throw new Error(`HTTP error! status: ${response.status} - ${errorData.message || 'Unknown error'}`);
    }
    const data = await response.json();
    return data.projects; 
  }, []);

  /**
   * Fetches project data from Xero API with caching support
   * @returns {Promise<any[]>} Array of Xero project objects
   * @throws {Error} When API request fails or returns non-ok status
   */
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

  /**
   * Compares projects between Pipedrive and Xero systems using the comparison API
   * @param {any[]} pipedriveProjects - Array of Pipedrive project objects
   * @param {any[]} xeroProjects - Array of Xero project objects
   * @returns {Promise<ProjectComparisonData>} Enhanced comparison result with metadata
   * @throws {Error} When comparison API request fails
   */
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

  /**
   * Main project analysis workflow that fetches, compares, and prepares report data
   * Orchestrates the complete synchronization analysis process
   * @returns {Promise<void>} Promise that resolves when analysis is complete
   * @throws {Error} When any step of the analysis fails
   */
  const handleAnalyzeProjects = useCallback(async () => {
    setIsAnalyzing(true);
    setComparisonData(null);
    setShowDownloadOptions(false);
    setReportMetadata(null);

    try {
      // Fetch tenant info first
      const tenantInfo = await fetchTenantInfo();
      
      let pdProjects: any[] = [];
      let pipedriveDisabled = false;
      let pipedriveError = '';
      
      try {
        // Try to fetch Pipedrive projects
        pdProjects = await fetchPipedriveProjects();
      } catch (error) {
        const errorMessage = (error as Error).message;
        if (errorMessage.startsWith('PIPEDRIVE_DISABLED:')) {
          pipedriveDisabled = true;
          pipedriveError = errorMessage.replace('PIPEDRIVE_DISABLED: ', '');
          console.log('Pipedrive disabled for tenant:', tenantInfo.tenantId, '-', pipedriveError);
        } else {
          throw error; // Re-throw non-Pipedrive-disabled errors
        }
      }
      
      // Fetch Xero projects
      const xrProjects = await fetchXeroProjects();

      // Compare projects (empty array for pdProjects if Pipedrive is disabled)
      const comparisonResult = await compareProjects(pdProjects, xrProjects);
      
      // Create metadata for the report
      const metadata: ReportMetadata = {
        reportTitle: pipedriveDisabled ? 'Xero Projects Report (Pipedrive Disabled)' : 'Project Comparison Report',
        generatedBy: session?.user?.name || session?.user?.email || 'Unknown User',
        userEmail: session?.user?.email || 'unknown@example.com',
        tenantName: tenantInfo.tenantName,
        tenantId: tenantInfo.tenantId,
        generatedAt: new Date(),
        reportType: pipedriveDisabled ? 'Xero Projects Analysis' : 'Project Synchronization Analysis',
        version: '2.0'
      };
      
      // Add Pipedrive status to comparison data
      const enhancedComparisonResult = {
        ...comparisonResult,
        pipedriveDisabled,
        pipedriveError
      };
      
      setComparisonData(enhancedComparisonResult);
      setReportMetadata(metadata);
      setShowDownloadOptions(true);
    } catch (error) {
      console.error('Project analysis failed:', error);
      throw error;
    } finally {
      setIsAnalyzing(false);
    }
  }, [fetchPipedriveProjects, fetchXeroProjects, fetchTenantInfo, compareProjects, session]);

  const handleSyncProject = useCallback(async () => {
    // This is now just for downloading reports - the analysis is separate
    if (!comparisonData || !reportMetadata) {
      await handleAnalyzeProjects();
    }
  }, [comparisonData, reportMetadata, handleAnalyzeProjects]);

  /**
   * Generates and downloads professional project comparison report in specified format
   * @param {'xlsx' | 'csv' | 'txt'} format - Report format to generate (defaults to 'xlsx')
   * @returns {Promise<void>} Promise that resolves when report is generated and downloaded
   * @throws {Error} When no data is available or report generation fails
   */
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
    isAnalyzing,
    comparisonReportContent, // Legacy support
    comparisonData, // New structured data
    reportMetadata, // New metadata
    showDownloadReportButton: showDownloadOptions, // Legacy support
    showDownloadOptions, // New property name
    handleAnalyzeProjects,
    handleSyncProject,
    handleDownloadReport,
    // Legacy method for backwards compatibility
    handleDownloadReportLegacy: () => handleDownloadReport('txt')
  };
};
