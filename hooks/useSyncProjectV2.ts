'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { ProjectSyncOrchestrator } from '@/lib/orchestration/ProjectSyncOrchestrator';
import { SyncSession, SyncStep, OrchestrationConfig } from '@/lib/orchestration/types';
import { ProfessionalReportGenerator, ReportMetadata } from '@/lib/reportGenerator';

export interface UseSyncProjectV2Options {
  config?: Partial<OrchestrationConfig>;
  onStepUpdate?: (step: SyncStep) => void;
}

/**
 * Enhanced hook for project synchronization with orchestration support
 * Provides real-time progress tracking and comprehensive analysis
 */
export const useSyncProjectV2 = (options: UseSyncProjectV2Options = {}) => {
  const { data: session } = useSession();
  const [orchestrator] = useState(() => new ProjectSyncOrchestrator(options.config));
  const [syncSession, setSyncSession] = useState<SyncSession | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    // Set up progress callback
    orchestrator.setProgressCallback((step) => {
      setSyncSession(orchestrator.getSession());
      if (options.onStepUpdate) {
        options.onStepUpdate(step);
      }
    });
  }, [orchestrator, options]);

  /**
   * Fetches project data from Pipedrive API (won deals)
   */
  const fetchPipedriveProjects = useCallback(async () => {
    const response = await fetch('/api/pipedrive/projects');
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      
      if (response.status === 403) {
        throw new Error(`PIPEDRIVE_DISABLED: ${errorData.message || 'Pipedrive integration is disabled for this organization'}`);
      }
      
      throw new Error(`HTTP error! status: ${response.status} - ${errorData.message || 'Unknown error'}`);
    }
    const data = await response.json();
    return data.projects; 
  }, []);

  /**
   * Fetches project data from Xero API
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

  /**
   * Fetches tenant information
   */
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
   * Main analysis workflow using orchestrator
   */
  const handleAnalyzeProjects = useCallback(async () => {
    setIsAnalyzing(true);
    setSyncSession(null);

    try {
      // Get tenant info
      const tenantInfo = await fetchTenantInfo();
      
      // Initialize orchestration session
      const session = orchestrator.initializeSession(tenantInfo.tenantId, tenantInfo.tenantName);
      setSyncSession(session);

      // Execute workflow
      const completedSession = await orchestrator.executeSyncWorkflow(
        fetchPipedriveProjects,
        fetchXeroProjects
      );
      
      setSyncSession(completedSession);
      
      return completedSession;
    } catch (error) {
      console.error('Project analysis failed:', error);
      setSyncSession(orchestrator.getSession());
      throw error;
    } finally {
      setIsAnalyzing(false);
    }
  }, [orchestrator, fetchTenantInfo, fetchPipedriveProjects, fetchXeroProjects]);

  /**
   * Generate and download report
   */
  const handleDownloadReport = useCallback(async (format: 'xlsx' | 'csv' | 'txt' = 'xlsx') => {
    if (!syncSession?.summary) {
      console.error('No sync session data available for download');
      return;
    }

    try {
      // Transform orchestrator data to legacy format for report generator
      const comparisonData = {
        matchedCount: syncSession.summary.matchedCount,
        onlyInPipedriveCount: syncSession.summary.unmatchedPipedriveCount,
        onlyInXeroCount: syncSession.summary.unmatchedXeroCount,
        pipedriveDisabled: syncSession.steps.find(s => s.id === 'fetch_pipedrive')?.status === 'skipped',
        pipedriveError: syncSession.steps.find(s => s.id === 'fetch_pipedrive')?.error,
        projectsOnlyInPipedrive: [], // TODO: Store in session
        projectsOnlyInXero: [], // TODO: Store in session
        matchedProjects: [], // TODO: Store in session
      };

      const reportMetadata: ReportMetadata = {
        reportTitle: 'Project Synchronization Report',
        generatedBy: session?.user?.name || session?.user?.email || 'Unknown User',
        userEmail: session?.user?.email || 'unknown@example.com',
        tenantName: syncSession.tenantName,
        tenantId: syncSession.tenantId,
        generatedAt: new Date(),
        reportType: 'Project Synchronization Analysis',
        version: '3.0'
      };

      await ProfessionalReportGenerator.generateProjectComparisonReport(
        comparisonData,
        reportMetadata,
        format
      );
    } catch (error) {
      console.error('Failed to generate report:', error);
      throw error;
    }
  }, [syncSession, session]);

  /**
   * Cancel ongoing sync
   */
  const cancelSync = useCallback(() => {
    orchestrator.cancelSession();
    setIsAnalyzing(false);
  }, [orchestrator]);

  /**
   * Get current step being executed
   */
  const currentStep = syncSession?.steps.find(s => s.status === 'running');

  /**
   * Get overall progress percentage
   */
  const overallProgress = syncSession ? 
    (syncSession.steps.filter(s => s.status === 'completed').length / syncSession.steps.length) * 100 : 0;

  return {
    // Session data
    syncSession,
    isAnalyzing,
    currentStep,
    overallProgress,
    
    // Summary data for UI
    summary: syncSession?.summary,
    steps: syncSession?.steps || [],
    
    // Actions
    handleAnalyzeProjects,
    handleDownloadReport,
    cancelSync,
    
    // Status helpers
    isRunning: syncSession?.status === 'running',
    isCompleted: syncSession?.status === 'completed',
    hasFailed: syncSession?.status === 'failed',
    isCancelled: syncSession?.status === 'cancelled',
  };
};