'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { 
  ArrowPathIcon, 
  CheckCircleIcon, 
  XCircleIcon,
  DocumentMagnifyingGlassIcon,
  DocumentArrowDownIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleIconSolid } from '@heroicons/react/24/solid';
import { FunctionCardProps } from './types';
import { useSession } from 'next-auth/react';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';

interface ProjectSyncCardProps extends FunctionCardProps {}

interface ProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  detail?: string;
}

interface ValidationSummary {
  totalWonDeals: number;
  dealsWithQuoteId: number;
  dealsWithoutQuoteId: number;
  fullySyncedDeals: number;
  dealsWithErrors: number;
  dealsWithWarnings: number;
  totalValue: number;
  currency: string;
  pipelineBreakdown: {
    [pipelineName: string]: {
      total: number;
      withQuoteId: number;
      withoutQuoteId: number;
      fullySynced: number;
      withErrors: number;
      totalValue: number;
    };
  };
  issueBreakdown: {
    [issueCode: string]: number;
  };
  results: any[];
}

export default function ProjectSyncValidationTenantEA67107E({ disabled = false }: ProjectSyncCardProps) {
  const { data: sessionData } = useSession();
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTenantId, setCurrentTenantId] = useState<string>('');
  const [validationSummary, setValidationSummary] = useState<ValidationSummary | null>(null);
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
  const [showProgress, setShowProgress] = useState(false);
  const [report, setReport] = useState<string>('');

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
    fetchTenantInfo().then(info => {
      setCurrentTenantId(info.tenantId);
    });
  }, [fetchTenantInfo]);

  const updateProgress = (stepId: string, status: 'running' | 'completed' | 'error', detail?: string) => {
    setProgressSteps(prev => prev.map(step => 
      step.id === stepId ? { ...step, status, detail } : step
    ));
  };

  const handleProjectSync = useCallback(async () => {
    setIsRunning(true);
    setError(null);
    setValidationSummary(null);
    setShowProgress(true);
    setReport('');
    
    const steps: ProgressStep[] = [
      { id: 'pipeline_6', label: 'Processing WIP - Afloat Repairs', status: 'pending' },
      { id: 'pipeline_7', label: 'Processing WIP - Engine Overhauling', status: 'pending' },
      { id: 'pipeline_8', label: 'Processing WIP - Electricals', status: 'pending' },
      { id: 'pipeline_3', label: 'Processing WIP - Engine Recon', status: 'pending' },
      { id: 'pipeline_5', label: 'Processing WIP - Laser Cladding', status: 'pending' },
      { id: 'pipeline_4', label: 'Processing WIP - Machine Shop', status: 'pending' },
      { id: 'pipeline_9', label: 'Processing WIP - Mechanical', status: 'pending' },
      { id: 'pipeline_16', label: 'Processing WIP - Navy', status: 'pending' },
      { id: 'validate', label: 'Validating deals comprehensively', status: 'pending' },
      { id: 'complete', label: 'Generating final report', status: 'pending' }
    ];
    setProgressSteps(steps);
    
    try {
      const eventSource = new EventSource('/api/sync/validate-stream-tenant-ea67107e');
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'progress':
            updateProgress(data.step, data.status, data.detail);
            break;
            
          case 'pipeline_progress':
            if (data.pipelineId) {
              updateProgress(`pipeline_${data.pipelineId}`, data.status, data.detail);
            }
            break;
            
          case 'validation_progress':
            if (data.current && data.total) {
              updateProgress('validate', 'running', data.detail);
            }
            break;
            
          case 'log':
            console.log('Server:', data.message);
            if (data.message.includes('=== Project Sync Validation Report ===')) {
              setReport(data.message);
            }
            break;
            
          case 'error':
            setError(data.message || 'Validation failed');
            eventSource.close();
            setIsRunning(false);
            break;
            
          case 'complete':
            if (data.data?.summary) {
              setValidationSummary(data.data.summary);
              if (data.data.report) {
                setReport(data.data.report);
              }
            }
            eventSource.close();
            setIsRunning(false);
            break;
        }
      };
      
      eventSource.onerror = (error) => {
        console.error('EventSource error:', error);
        setError('Connection to server lost');
        eventSource.close();
        setIsRunning(false);
        
        const runningStep = progressSteps.find(s => s.status === 'running');
        if (runningStep) {
          updateProgress(runningStep.id, 'error', 'Connection lost');
        }
      };
      
    } catch (error) {
      console.error('Error running validation:', error);
      setError('Failed to start validation');
      setIsRunning(false);
    }
  }, [progressSteps]);

  const handleDownloadReport = useCallback(() => {
    if (!validationSummary) return;

    const workbook = XLSX.utils.book_new();
    
    // Summary Sheet
    const summaryData = [
      ['Project Sync Validation Report - Tenant EA67107E'],
      [''],
      ['Generated By', sessionData?.user?.name || sessionData?.user?.email || 'Unknown'],
      ['Generated At', new Date().toLocaleString()],
      [''],
      ['Validation Statistics'],
      ['Total Won Deals in WIP Pipelines', validationSummary.totalWonDeals],
      ['Deals with Quote ID', validationSummary.dealsWithQuoteId],
      ['Deals without Quote ID', validationSummary.dealsWithoutQuoteId],
      ['Total Deal Value', `${validationSummary.currency} ${validationSummary.totalValue.toLocaleString()}`],
      [''],
      ['Pipeline Breakdown']
    ];
    
    Object.entries(validationSummary.pipelineBreakdown).forEach(([pipeline, stats]) => {
      summaryData.push(
        [pipeline],
        [`  Total Deals`, stats.total],
        [`  With Quote ID`, stats.withQuoteId],
        [`  Without Quote ID`, stats.withoutQuoteId],
        [`  Total Value`, `${validationSummary.currency} ${stats.totalValue.toLocaleString()}`],
        ['']
      );
    });
    
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
    
    // Detailed Results Sheet
    if (validationSummary.results && validationSummary.results.length > 0) {
      const detailData = [
        ['Deal Validation Details'],
        [''],
        ['Deal ID', 'Deal Title', 'Pipeline', 'Has Quote ID', 'Quote ID', 'Quote Number', 'Deal Value', 'Currency', 'Won Time', 'Error Count', 'Warning Count', 'Issue Codes', 'Issue Messages', 'Fix Actions'],
        ...validationSummary.results.map((result: any) => {
          const errors = result.validationIssues.filter((i: any) => i.severity === 'error');
          const warnings = result.validationIssues.filter((i: any) => i.severity === 'warning');
          
          return [
            result.dealId,
            result.dealTitle,
            result.pipelineName,
            result.hasQuoteId ? 'YES' : 'NO',
            result.quoteId || 'N/A',
            result.quoteNumber || 'N/A',
            result.dealValue,
            result.currency,
            result.wonTime,
            errors.length,
            warnings.length,
            result.validationIssues.map((i: any) => i.code).join(', ') || 'None',
            result.validationIssues.map((i: any) => i.message).join(', ') || 'None',
            result.validationIssues.filter((i: any) => i.fixAction).map((i: any) => i.fixAction).join(', ') || 'None'
          ];
        })
      ];
      
      const detailSheet = XLSX.utils.aoa_to_sheet(detailData);
      XLSX.utils.book_append_sheet(workbook, detailSheet, 'Deal Details');
    }
    
    // Validation Issues Sheet - Only deals with issues
    const dealsWithIssues = validationSummary.results.filter((r: any) => r.validationIssues && r.validationIssues.length > 0);
    if (dealsWithIssues.length > 0) {
      const issuesData = [
        ['Deals with Validation Issues'],
        [''],
        ['Deal ID', 'Deal Title', 'Pipeline', 'Deal Value', 'Currency', 'Severity', 'Issue Code', 'Issue Message', 'Fix Action', 'Current Value', 'Expected Value'],
        ...dealsWithIssues.flatMap((result: any) => 
          result.validationIssues.map((issue: any) => [
            result.dealId,
            result.dealTitle,
            result.pipelineName,
            result.dealValue,
            result.currency,
            issue.severity.toUpperCase(),
            issue.code,
            issue.message,
            issue.fixAction || '',
            issue.currentValue !== undefined ? String(issue.currentValue) : '',
            issue.expectedValue !== undefined ? String(issue.expectedValue) : ''
          ])
        )
      ];
      
      const issuesSheet = XLSX.utils.aoa_to_sheet(issuesData);
      XLSX.utils.book_append_sheet(workbook, issuesSheet, 'Validation Issues');
    }
    
    // Missing Quote IDs Sheet
    const missingQuoteDeals = validationSummary.results.filter((r: any) => !r.hasQuoteId);
    if (missingQuoteDeals.length > 0) {
      const missingData = [
        ['Deals Missing Quote ID'],
        [''],
        ['Deal ID', 'Deal Title', 'Pipeline', 'Deal Value', 'Currency', 'Won Time', 'All Issues'],
        ...missingQuoteDeals.map((result: any) => [
          result.dealId,
          result.dealTitle,
          result.pipelineName,
          result.dealValue,
          result.currency,
          result.wonTime,
          result.validationIssues.map((i: any) => `[${i.code}] ${i.message}`).join(', ') || 'Missing Quote ID only'
        ])
      ];
      
      const missingSheet = XLSX.utils.aoa_to_sheet(missingData);
      XLSX.utils.book_append_sheet(workbook, missingSheet, 'Missing Quote IDs');
    }
    
    // Generate and download file
    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    saveAs(blob, `project-sync-validation-tenant-ea67107e-${timestamp}.xlsx`);
  }, [validationSummary, sessionData]);

  // Only show for tenant ea67107e-c352-40a9-a8b8-24d81ae3fc85
  if (currentTenantId !== 'ea67107e-c352-40a9-a8b8-24d81ae3fc85') {
    return null;
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-200">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Project Sync Validation</h2>
            <p className="text-sm text-gray-500 mt-1">
              Validate WIP pipeline deals for quote ID presence
            </p>
          </div>
          <div className="p-2 bg-gray-100 rounded-lg">
            <DocumentMagnifyingGlassIcon className="h-6 w-6 text-gray-600" />
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-center">
              <XCircleIcon className="h-5 w-5 text-red-600 mr-2" />
              <span className="text-sm text-red-700">{error}</span>
            </div>
          </div>
        )}

        {/* Progress Steps */}
        {showProgress && progressSteps.length > 0 && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-3 flex items-center">
              <DocumentMagnifyingGlassIcon className="h-4 w-4 mr-2" />
              Validation Progress
            </h3>
            <div className="space-y-2">
              {progressSteps.map((step) => (
                <div key={step.id} className="flex items-start">
                  <div className="flex-shrink-0 mt-0.5">
                    {step.status === 'completed' && (
                      <CheckCircleIconSolid className="h-5 w-5 text-green-500" />
                    )}
                    {step.status === 'running' && (
                      <div className="relative">
                        <div className="h-5 w-5 rounded-full border-2 border-blue-200 border-t-blue-500 animate-spin" />
                      </div>
                    )}
                    {step.status === 'error' && (
                      <ExclamationCircleIcon className="h-5 w-5 text-red-500" />
                    )}
                    {step.status === 'pending' && (
                      <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
                    )}
                  </div>
                  <div className="ml-3 flex-1">
                    <p className={`text-sm ${
                      step.status === 'completed' ? 'text-gray-900' : 
                      step.status === 'running' ? 'text-blue-700 font-medium' : 
                      step.status === 'error' ? 'text-red-700' : 
                      'text-gray-500'
                    }`}>
                      {step.label}
                    </p>
                    {step.detail && (
                      <p className="text-xs text-gray-500 mt-0.5">{step.detail}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Validation Results */}
        {validationSummary && (
          <div className="space-y-4">
            {/* Summary Stats */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-blue-900 mb-3">Validation Results</h3>
              
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-white rounded-lg p-3">
                  <div className="text-2xl font-bold text-gray-900">{validationSummary.totalWonDeals}</div>
                  <div className="text-xs text-gray-600">Total Won Deals</div>
                </div>
                <div className="bg-white rounded-lg p-3">
                  <div className="text-2xl font-bold text-green-600">{validationSummary.fullySyncedDeals}</div>
                  <div className="text-xs text-gray-600">Fully Synced</div>
                  <div className="text-xs text-gray-500">{((validationSummary.fullySyncedDeals / validationSummary.totalWonDeals) * 100).toFixed(1)}%</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-white rounded-lg p-2 text-center">
                  <div className="text-lg font-semibold text-red-600">{validationSummary.dealsWithErrors}</div>
                  <div className="text-xs text-gray-600">With Errors</div>
                </div>
                <div className="bg-white rounded-lg p-2 text-center">
                  <div className="text-lg font-semibold text-amber-600">{validationSummary.dealsWithWarnings}</div>
                  <div className="text-xs text-gray-600">With Warnings</div>
                </div>
                <div className="bg-white rounded-lg p-2 text-center">
                  <div className="text-lg font-semibold text-blue-600">{validationSummary.dealsWithoutQuoteId}</div>
                  <div className="text-xs text-gray-600">No Quote ID</div>
                </div>
              </div>

              {/* Total Value */}
              <div className="mt-3 bg-white rounded-lg p-3">
                <div className="text-xs text-gray-600">Total Deal Value</div>
                <div className="text-lg font-semibold text-gray-900">
                  {validationSummary.currency} {validationSummary.totalValue.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Issue Breakdown */}
            {validationSummary.issueBreakdown && Object.keys(validationSummary.issueBreakdown).length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-amber-900 mb-3">Top Issues Found</h3>
                <div className="space-y-1">
                  {Object.entries(validationSummary.issueBreakdown)
                    .sort(([,a], [,b]) => b - a)
                    .slice(0, 5)
                    .map(([code, count]) => (
                      <div key={code} className="flex justify-between text-xs">
                        <span className="text-gray-700">{code}</span>
                        <span className="font-medium">{count} occurrences</span>
                      </div>
                    ))}
                </div>
              </div>
            )}


            {/* Validation Issues - By Department */}
            {validationSummary.results && validationSummary.results.length > 0 && (() => {
              // Group deals by pipeline
              const dealsByPipeline = validationSummary.results
                .filter((result: any) => result.validationIssues && result.validationIssues.length > 0)
                .reduce((acc: any, result: any) => {
                  const pipeline = result.pipelineName || 'Unknown Pipeline';
                  if (!acc[pipeline]) {
                    acc[pipeline] = [];
                  }
                  acc[pipeline].push(result);
                  return acc;
                }, {});
              
              return Object.keys(dealsByPipeline).length > 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-amber-900">
                      Validation Issues by Department ({validationSummary.dealsWithErrors + validationSummary.dealsWithWarnings} deals affected)
                    </h3>
                  </div>
                  <div className="space-y-4 max-h-96 overflow-y-auto">
                    {Object.entries(dealsByPipeline)
                      .sort(([pipelineA], [pipelineB]) => pipelineA.localeCompare(pipelineB))
                      .map(([pipelineName, deals]: [string, any]) => {
                        const pipelineErrorCount = deals.reduce((sum: number, deal: any) => 
                          sum + deal.validationIssues.filter((i: any) => i.severity === 'error').length, 0);
                        const pipelineWarningCount = deals.reduce((sum: number, deal: any) => 
                          sum + deal.validationIssues.filter((i: any) => i.severity === 'warning').length, 0);
                        
                        return (
                          <div key={pipelineName} className="border-l-4 border-amber-400 pl-3">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="text-sm font-semibold text-gray-800">{pipelineName}</h4>
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-gray-600">{deals.length} deals</span>
                                {pipelineErrorCount > 0 && (
                                  <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
                                    {pipelineErrorCount} errors
                                  </span>
                                )}
                                {pipelineWarningCount > 0 && (
                                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                                    {pipelineWarningCount} warnings
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="space-y-2">
                              {deals
                                .sort((a: any, b: any) => {
                                  // Sort by error count first, then by total issues
                                  const aErrors = a.validationIssues.filter((i: any) => i.severity === 'error').length;
                                  const bErrors = b.validationIssues.filter((i: any) => i.severity === 'error').length;
                                  if (aErrors !== bErrors) return bErrors - aErrors;
                                  return b.validationIssues.length - a.validationIssues.length;
                                })
                                .map((result: any) => {
                                  const errorCount = result.validationIssues.filter((i: any) => i.severity === 'error').length;
                                  const warningCount = result.validationIssues.filter((i: any) => i.severity === 'warning').length;
                                  const infoCount = result.validationIssues.filter((i: any) => i.severity === 'info').length;
                                  
                                  return (
                                    <div key={result.dealId} className="bg-white rounded-lg p-3 border border-amber-100">
                                      <div className="flex items-start justify-between mb-2">
                                        <div className="flex-1">
                                          <div className="text-sm font-medium text-gray-900">
                                            {result.dealTitle}
                                          </div>
                                          <div className="text-xs text-gray-500 mt-0.5">
                                            Deal #{result.dealId} • {result.currency} {result.dealValue.toLocaleString()}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs">
                                          {errorCount > 0 && (
                                            <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
                                              {errorCount} error{errorCount > 1 ? 's' : ''}
                                            </span>
                                          )}
                                          {warningCount > 0 && (
                                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                                              {warningCount} warning{warningCount > 1 ? 's' : ''}
                                            </span>
                                          )}
                                          {infoCount > 0 && (
                                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                                              {infoCount} info
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="space-y-1.5">
                                        {result.validationIssues
                                          .sort((a: any, b: any) => {
                                            // Sort by severity: error > warning > info
                                            const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2 };
                                            return severityOrder[a.severity] - severityOrder[b.severity];
                                          })
                                          .map((issue: any, idx: number) => (
                                            <div key={idx} className="ml-3">
                                              <div className="text-xs text-gray-700">
                                                <span className="font-medium">[{issue.code}]</span> {issue.message}
                                              </div>
                                              {issue.fixAction && (
                                                <div className="text-xs text-gray-500 italic mt-0.5">
                                                  → {issue.fixAction}
                                                </div>
                                              )}
                                              {issue.currentValue !== undefined && issue.expectedValue !== undefined && (
                                                <div className="text-xs text-gray-500 mt-0.5">
                                                  Current: {issue.currentValue} | Expected: {issue.expectedValue}
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ) : null;
            })()}
          </div>
        )}


        {/* Action Buttons */}
        <div className="space-y-3 mt-4">
          <button
            onClick={handleProjectSync}
            disabled={disabled || isRunning}
            className="w-full inline-flex items-center justify-center px-4 py-3 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
            style={{
              backgroundColor: (disabled || isRunning) 
                ? 'oklch(21.6% 0.006 56.043)' 
                : 'oklch(27.4% 0.006 286.033)'
            }}
            onMouseEnter={(e) => {
              if (!disabled && !isRunning) {
                e.currentTarget.style.backgroundColor = 'oklch(21.6% 0.006 56.043)';
              }
            }}
            onMouseLeave={(e) => {
              if (!disabled && !isRunning) {
                e.currentTarget.style.backgroundColor = 'oklch(27.4% 0.006 286.033)';
              }
            }}
          >
            {isRunning ? (
              <>
                <ArrowPathIcon className="h-5 w-5 mr-2 animate-spin" />
                Running Validation...
              </>
            ) : (
              <>
                <DocumentMagnifyingGlassIcon className="h-5 w-5 mr-2" />
                Run Validation
              </>
            )}
          </button>

          {validationSummary && !isRunning && (
            <button
              onClick={handleDownloadReport}
              className="w-full inline-flex items-center justify-center px-4 py-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors duration-200"
            >
              <DocumentArrowDownIcon className="h-4 w-4 mr-2" />
              Download Validation Report
            </button>
          )}
        </div>

        {/* Info Text */}
        <p className="text-xs text-gray-500 text-center mt-3">
          Validates won deals in WIP pipelines for quote ID presence
        </p>
      </div>
    </div>
  );
}