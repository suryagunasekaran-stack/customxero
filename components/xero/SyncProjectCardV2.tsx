'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { 
  ArrowPathIcon, 
  CheckCircleIcon, 
  XCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DocumentArrowDownIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleIconSolid } from '@heroicons/react/24/solid';
import { FunctionCardProps } from './types';
import { SyncStep, SyncSession } from '@/lib/orchestration/types';
import { ProjectSyncOrchestrator } from '@/lib/orchestration/ProjectSyncOrchestrator';
import { SimpleProjectSync } from '@/lib/orchestration/SimpleProjectSync';
import { useSession } from 'next-auth/react';
import ReportDownloadOptions from './ReportDownloadOptions';

interface SyncProjectCardV2Props extends FunctionCardProps {}

const StepIcon = ({ status }: { status: SyncStep['status'] }) => {
  switch (status) {
    case 'completed':
      return <CheckCircleIconSolid className="h-5 w-5 text-green-500" />;
    case 'running':
      return <ClockIcon className="h-5 w-5 text-blue-500 animate-spin" />;
    case 'error':
      return <XCircleIcon className="h-5 w-5 text-red-500" />;
    case 'skipped':
      return <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />;
    default:
      return <div className="h-5 w-5 rounded-full border-2 border-gray-300" />;
  }
};

const StepProgress = ({ step }: { step: SyncStep }) => {
  const getStatusColor = () => {
    switch (step.status) {
      case 'completed': return 'bg-green-500';
      case 'running': return 'bg-blue-500';
      case 'error': return 'bg-red-500';
      case 'skipped': return 'bg-yellow-500';
      default: return 'bg-gray-200';
    }
  };

  const getDuration = () => {
    if (!step.startTime) return null;
    const start = new Date(step.startTime).getTime();
    const end = step.endTime ? new Date(step.endTime).getTime() : Date.now();
    const duration = (end - start) / 1000;
    return `${duration.toFixed(1)}s`;
  };

  return (
    <div className="flex items-center space-x-3 py-3 px-4 hover:bg-gray-50 transition-colors">
      <StepIcon status={step.status} />
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-gray-900">{step.name}</h4>
            <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>
            {step.error && (
              <p className="text-xs text-red-600 mt-1">{step.error}</p>
            )}
          </div>
          {step.status === 'running' && (
            <div className="text-xs text-blue-600 font-medium">Processing...</div>
          )}
          {step.status === 'completed' && getDuration() && (
            <div className="text-xs text-gray-500">{getDuration()}</div>
          )}
        </div>
        {step.status === 'running' && step.progress !== undefined && (
          <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
            <div 
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${step.progress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

const SyncSummaryCard = ({ summary }: { summary: SyncSession['summary'] }) => {
  if (!summary) return null;

  const syncPercentage = summary.pipedriveDealsCount + summary.xeroProjectsCount > 0
    ? (summary.matchedCount / ((summary.pipedriveDealsCount + summary.xeroProjectsCount) / 2)) * 100
    : 0;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-blue-900">Sync Analysis Complete</h3>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-lg p-3">
          <div className="text-2xl font-bold text-gray-900">{summary.pipedriveDealsCount}</div>
          <div className="text-xs text-gray-600">Pipedrive Won Deals</div>
        </div>
        <div className="bg-white rounded-lg p-3">
          <div className="text-2xl font-bold text-gray-900">{summary.xeroProjectsCount}</div>
          <div className="text-xs text-gray-600">Xero Projects</div>
        </div>
      </div>

      <div className="bg-white rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Sync Status</span>
          <span className="text-sm font-bold text-gray-900">{syncPercentage.toFixed(0)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className={`h-2 rounded-full transition-all duration-500 ${
              syncPercentage === 100 ? 'bg-green-500' : 
              syncPercentage >= 75 ? 'bg-blue-500' : 
              syncPercentage >= 50 ? 'bg-yellow-500' : 'bg-red-500'
            }`}
            style={{ width: `${syncPercentage}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-green-50 rounded-lg p-2">
          <div className="text-lg font-bold text-green-700">{summary.matchedCount}</div>
          <div className="text-xs text-green-600">Matched</div>
        </div>
        <div className="bg-orange-50 rounded-lg p-2">
          <div className="text-lg font-bold text-orange-700">{summary.unmatchedPipedriveCount}</div>
          <div className="text-xs text-orange-600">Pipedrive Only</div>
        </div>
        <div className="bg-purple-50 rounded-lg p-2">
          <div className="text-lg font-bold text-purple-700">{summary.unmatchedXeroCount}</div>
          <div className="text-xs text-purple-600">Xero Only</div>
        </div>
      </div>

      {summary.valueDiscrepancies.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <div className="flex items-center space-x-2">
            <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600" />
            <span className="text-sm font-medium text-yellow-800">
              {summary.valueDiscrepancies.length} Value Discrepancies Found
            </span>
          </div>
        </div>
      )}

      {summary.recommendations.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700">Recommendations:</h4>
          <ul className="space-y-1">
            {summary.recommendations.map((rec, idx) => (
              <li key={idx} className="flex items-start space-x-2">
                <InformationCircleIcon className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <span className="text-xs text-gray-600">{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.matchedCount === 0 && summary.pipedriveDealsCount > 0 && summary.xeroProjectsCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-center space-x-2">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
            <div>
              <span className="text-sm font-medium text-red-800">No Matches Found</span>
              <p className="text-xs text-red-600 mt-1">
                Project names don't match between systems. Check naming conventions.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function SyncProjectCardV2({ disabled = false }: SyncProjectCardV2Props) {
  const { data: sessionData } = useSession();
  const [orchestrator] = useState(() => new ProjectSyncOrchestrator());
  const [syncSession, setSyncSession] = useState<SyncSession | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [showDownloadOptions, setShowDownloadOptions] = useState(false);
  const [currentTenantId, setCurrentTenantId] = useState<string>('');

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
        };
      }
    } catch (error) {
      console.error('Failed to fetch tenant info:', error);
    }
    return { tenantName: 'Unknown Organisation', tenantId: 'unknown' };
  }, []);

  useEffect(() => {
    // Set up progress callback
    orchestrator.setProgressCallback(() => {
      setSyncSession(current => {
        if (!current) return null;
        return { ...orchestrator.getSession()! };
      });
    });
    
    // Fetch tenant ID on mount
    fetchTenantInfo().then(info => {
      setCurrentTenantId(info.tenantId);
    });
  }, [orchestrator, fetchTenantInfo]);

  const fetchPipedriveProjects = useCallback(async () => {
    const response = await fetch('/api/pipedrive/projects');
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      if (response.status === 403) {
        throw new Error(`PIPEDRIVE_DISABLED: ${errorData.message || 'Pipedrive integration is disabled'}`);
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    console.log('Pipedrive API Response:', data);
    console.log('First few projects:', data.projects?.slice(0, 3));
    return data.projects || [];
  }, []);

  const fetchXeroProjects = useCallback(async () => {
    const response = await fetch('/api/xero/projects');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.projects;
  }, []);

  const handleTestSimpleSync = useCallback(async () => {
    console.log('=== STARTING SIMPLE SYNC TEST ===');
    
    try {
      const response = await fetch('/api/sync/simple-test');
      const data = await response.json();
      
      if (!response.ok) {
        console.error('Test failed:', data);
        return;
      }
      
      console.log('Test Results:', data);
      console.log(`Total Deals: ${data.totalDeals}`);
      console.log('Grouped by prefix:', data.groupedByPrefix);
      
      // Log first 5 deals to browser console
      console.log('\nFirst 5 deals with matching keys:');
      data.deals.slice(0, 5).forEach((deal: any, index: number) => {
        console.log(`${index + 1}. "${deal.title}"`);
        console.log(`   Key: ${deal.matchingKey}`);
        console.log(`   Value: ${deal.value} ${deal.currency}`);
      });
      
    } catch (error) {
      console.error('Error running test:', error);
    }
  }, []);

  const handleStartSync = useCallback(async () => {
    setShowDownloadOptions(false);
    
    try {
      // Get tenant info
      const tenantInfo = await fetchTenantInfo();
      
      // Initialize session
      const session = orchestrator.initializeSession(tenantInfo.tenantId, tenantInfo.tenantName);
      setSyncSession(session);

      // Execute workflow
      const completedSession = await orchestrator.executeSyncWorkflow(
        fetchPipedriveProjects,
        fetchXeroProjects
      );
      
      setSyncSession(completedSession);
      setShowDownloadOptions(true);
    } catch (error) {
      console.error('Sync failed:', error);
      setSyncSession(orchestrator.getSession());
    }
  }, [orchestrator, fetchTenantInfo, fetchPipedriveProjects, fetchXeroProjects]);

  const handleDownloadReport = useCallback(async (format: 'xlsx' | 'csv' | 'txt' = 'xlsx') => {
    if (!syncSession?.summary) return;

    // Create report data from sync session
    const comparisonData = {
      matchedCount: syncSession.summary.matchedCount,
      onlyInPipedriveCount: syncSession.summary.unmatchedPipedriveCount,
      onlyInXeroCount: syncSession.summary.unmatchedXeroCount,
      pipedriveDisabled: syncSession.steps[0].status === 'skipped',
      pipedriveError: syncSession.steps[0].error,
      projectsOnlyInPipedrive: syncSession.summary.unmatchedPipedriveDeals?.map((deal: any) => ({
        name: deal.title,
        key: deal._normalizedKey || deal.id,
        id: deal.id,
        status: deal.status
      })) || [],
      projectsOnlyInXero: syncSession.summary.unmatchedXeroProjects?.map((project: any) => ({
        name: project.name,
        key: project._normalizedKey || project.projectId,
        id: project.projectId,
        status: project.status
      })) || [],
      matchedProjects: syncSession.summary.matchedProjects?.map(match => ({
        pipedriveProject: match.pipedriveProject,
        xeroProject: match.xeroProject,
        key: match.matchKey
      })) || [],
      rawPipedriveDeals: syncSession.summary.rawPipedriveDeals,
      rawXeroProjects: syncSession.summary.rawXeroProjects,
      valueDiscrepancies: syncSession.summary.valueDiscrepancies,
    };

    const reportMetadata = {
      reportTitle: 'Project Synchronization Report',
      generatedBy: sessionData?.user?.name || sessionData?.user?.email || 'Unknown User',
      userEmail: sessionData?.user?.email || 'unknown@example.com',
      tenantName: syncSession.tenantName,
      tenantId: syncSession.tenantId,
      generatedAt: new Date(),
      reportType: 'Project Synchronization Analysis',
      version: '3.0'
    };

    // Use existing report generator
    const { ProfessionalReportGenerator } = await import('@/lib/reportGenerator');
    await ProfessionalReportGenerator.generateProjectComparisonReport(
      comparisonData,
      reportMetadata,
      format
    );
  }, [syncSession, sessionData]);

  const isRunning = syncSession?.status === 'running';
  const isCompleted = syncSession?.status === 'completed';
  const hasFailed = syncSession?.status === 'failed';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-200">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Project Synchronization</h2>
            <p className="text-sm text-gray-500 mt-1">
              Analyze and sync projects between Pipedrive and Xero
            </p>
          </div>
          {isCompleted && (
            <CheckCircleIcon className="h-8 w-8 text-green-500" />
          )}
          {hasFailed && (
            <XCircleIcon className="h-8 w-8 text-red-500" />
          )}
        </div>

        {/* Progress Section */}
        {syncSession && (
          <div className="mb-4">
            <div className="bg-gray-50 rounded-lg border border-gray-200">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-100 transition-colors"
              >
                <span className="text-sm font-medium text-gray-700">
                  {isRunning ? 'Sync in Progress...' : 
                   isCompleted ? 'Sync Completed' : 
                   hasFailed ? 'Sync Failed' : 'Ready to Sync'}
                </span>
                {isExpanded ? 
                  <ChevronUpIcon className="h-5 w-5 text-gray-400" /> : 
                  <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                }
              </button>
              
              {isExpanded && (
                <div className="border-t border-gray-200">
                  {syncSession.steps.map((step) => (
                    <StepProgress key={step.id} step={step} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Summary Section */}
        {syncSession?.summary && (
          <div className="mb-4">
            <SyncSummaryCard summary={syncSession.summary} />
          </div>
        )}

        {/* Download Options */}
        {showDownloadOptions && syncSession?.summary && (
          <div className="mb-4">
            <ReportDownloadOptions
              comparisonData={{
                matchedCount: syncSession.summary.matchedCount,
                onlyInPipedriveCount: syncSession.summary.unmatchedPipedriveCount,
                onlyInXeroCount: syncSession.summary.unmatchedXeroCount,
                projectsOnlyInPipedrive: [],
                projectsOnlyInXero: [],
              }}
              reportMetadata={{
                reportTitle: 'Project Synchronization Report',
                generatedBy: sessionData?.user?.name || sessionData?.user?.email || 'Unknown User',
                userEmail: sessionData?.user?.email || 'unknown@example.com',
                tenantName: syncSession.tenantName,
                tenantId: syncSession.tenantId,
                generatedAt: new Date(),
                reportType: 'Project Synchronization Analysis',
                version: '3.0'
              }}
              onDownload={handleDownloadReport}
              className="rounded-lg"
            />
          </div>
        )}

        {/* Test Button - Only show for BSENI tenant */}
        {currentTenantId === '6dd39ea4-e6a6-4993-a37a-21482ccf8d22' && (
          <div className="mb-4">
            <button
              onClick={handleTestSimpleSync}
              className="w-full inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-all duration-200"
            >
              <DocumentArrowDownIcon className="h-5 w-5 mr-2" />
              Test Simple Sync (Console Log)
            </button>
          </div>
        )}

        {/* Action Button */}
        <button
          onClick={handleStartSync}
          disabled={disabled || isRunning}
          className={`w-full inline-flex items-center justify-center px-4 py-3 text-sm font-medium text-white rounded-lg transition-all duration-200 ${
            disabled || isRunning
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
          }`}
        >
          {isRunning ? (
            <>
              <ArrowPathIcon className="h-5 w-5 mr-2 animate-spin" />
              Analyzing Projects...
            </>
          ) : isCompleted ? (
            <>
              <ArrowPathIcon className="h-5 w-5 mr-2" />
              Re-analyze Projects
            </>
          ) : (
            <>
              <ArrowPathIcon className="h-5 w-5 mr-2" />
              Start Project Analysis
            </>
          )}
        </button>
      </div>
    </div>
  );
}