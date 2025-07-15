'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { 
  ArrowPathIcon, 
  CheckCircleIcon, 
  XCircleIcon,
  DocumentMagnifyingGlassIcon,
  DocumentArrowDownIcon,
  ClockIcon,
  ExclamationCircleIcon,
  WrenchScrewdriverIcon
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

interface FixProgress {
  dealId: string;
  issueCode: string;
  status: 'fixing' | 'success' | 'error';
  message?: string;
}

export default function ProjectSyncCardWithFixes({ disabled = false }: ProjectSyncCardProps) {
  const { data: sessionData } = useSession();
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTenantId, setCurrentTenantId] = useState<string>('');
  const [validationStats, setValidationStats] = useState<any>(null);
  const [validationData, setValidationData] = useState<any>(null);
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
  const [showProgress, setShowProgress] = useState(false);
  const [fixProgress, setFixProgress] = useState<FixProgress[]>([]);
  const [isFixing, setIsFixing] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [isFixingAll, setIsFixingAll] = useState(false);
  const [showAllFixable, setShowAllFixable] = useState(false);

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
    setValidationStats(null);
    setValidationData(null);
    setShowProgress(true);
    setFixProgress([]);
    
    const steps: ProgressStep[] = [
      { id: 'fetch', label: 'Fetching won deals from Pipedrive', status: 'pending' },
      { id: 'validate', label: 'Validating deals and Xero quotes', status: 'pending' },
      { id: 'analyze', label: 'Analyzing sync status', status: 'pending' },
      { id: 'report', label: 'Generating report', status: 'pending' }
    ];
    setProgressSteps(steps);
    
    try {
      const eventSource = new EventSource('/api/sync/validate-stream');
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'progress':
            updateProgress(data.step, data.status, data.detail);
            break;
            
          case 'log':
            console.log('Server:', data.message);
            break;
            
          case 'error':
            setError(data.message || 'Sync failed');
            eventSource.close();
            setIsRunning(false);
            break;
            
          case 'complete':
            if (data.data.validationStats) {
              setValidationStats(data.data.validationStats);
              setValidationData(data.data);
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
      console.error('Error running sync:', error);
      setError('Failed to start sync');
      setIsRunning(false);
    }
  }, [progressSteps]);

  const handleFixIssue = useCallback(async (dealId: string, issueCode: string, dealData: any, isBulkFix: boolean = false) => {
    if (!isBulkFix) {
      setIsFixing(true);
      setSelectedDealId(dealId);
    }
    
    const fixId = `${dealId}-${issueCode}`;
    setFixProgress(prev => [...prev, { dealId, issueCode, status: 'fixing' }]);
    
    try {
      // Prepare fix data based on issue code
      const fixData: any = {
        dealId,
        issueCode,
        dealData: {
          xeroQuoteId: dealData.xeroQuoteId,
          dealProducts: dealData.dealProducts,
          expectedQuoteNumber: null
        }
      };
      
      // For quote number fixes, calculate expected number
      if (issueCode === 'XERO_QUOTE_NUMBER_NO_PROJECT') {
        const titleMatch = dealData.title?.match(/^([A-Z]+\d+)/);
        const projectCode = titleMatch?.[1];
        if (projectCode && dealData.xeroQuoteNumber) {
          fixData.dealData.expectedQuoteNumber = `${projectCode}-${dealData.xeroQuoteNumber}-1`;
        }
      }
      
      const response = await fetch('/api/sync/fix-issue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(fixData)
      });
      
      const result = await response.json();
      
      if (response.ok) {
        setFixProgress(prev => prev.map(p => 
          p.dealId === dealId && p.issueCode === issueCode 
            ? { ...p, status: 'success', message: result.message }
            : p
        ));
        
        // Refresh validation after successful fix
        setTimeout(() => {
          handleProjectSync();
        }, 2000);
      } else {
        setFixProgress(prev => prev.map(p => 
          p.dealId === dealId && p.issueCode === issueCode 
            ? { ...p, status: 'error', message: result.error }
            : p
        ));
      }
    } catch (error) {
      console.error('Error fixing issue:', error);
      setFixProgress(prev => prev.map(p => 
        p.dealId === dealId && p.issueCode === issueCode 
          ? { ...p, status: 'error', message: 'Failed to fix issue' }
          : p
      ));
    } finally {
      if (!isBulkFix) {
        setIsFixing(false);
        setSelectedDealId(null);
      }
    }
  }, [handleProjectSync]);

  const handleFixAll = useCallback(async () => {
    if (!validationData?.deals) return;
    
    setIsFixingAll(true);
    setFixProgress([]);
    
    // Collect all fixable issues
    const fixableTasks: Array<{dealId: string, issueCode: string, dealData: any}> = [];
    
    validationData.deals.forEach((deal: any) => {
      if (deal.validationIssues) {
        deal.validationIssues
          .filter((issue: any) => issue.fixable)
          .forEach((issue: any) => {
            fixableTasks.push({
              dealId: deal.id,
              issueCode: issue.code,
              dealData: deal
            });
          });
      }
    });
    
    console.log(`Starting bulk fix for ${fixableTasks.length} issues...`);
    
    // Process fixes in batches to avoid overwhelming the server
    const batchSize = 5;
    for (let i = 0; i < fixableTasks.length; i += batchSize) {
      const batch = fixableTasks.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (task) => {
        try {
          await handleFixIssue(task.dealId, task.issueCode, task.dealData, true);
        } catch (error) {
          console.error(`Failed to fix ${task.issueCode} for deal ${task.dealId}:`, error);
        }
      }));
      
      // Small delay between batches
      if (i + batchSize < fixableTasks.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    setIsFixingAll(false);
    
    // Note: Refresh will be triggered manually after this completes
  }, [validationData, handleFixIssue]);

  const handleDownloadReport = useCallback(() => {
    if (!validationData) return;

    const workbook = XLSX.utils.book_new();
    
    // Summary Sheet
    const summaryData = [
      ['Project Sync Validation Report'],
      [''],
      ['Generated By', sessionData?.user?.name || sessionData?.user?.email || 'Unknown'],
      ['Generated At', new Date().toLocaleString()],
      [''],
      ['Summary Statistics'],
      ['Total Won Deals', validationData.validationStats.totalDeals],
      ['Fully Synced', validationData.validationStats.fullySynced],
      ['With Errors', validationData.validationStats.withErrors],
      ['With Warnings', validationData.validationStats.withWarnings],
      ['Fixable Issues', validationData.validationStats.fixableIssues],
      [''],
      ['Financial Summary'],
      ['Total Deal Value', `$${validationData.validationStats.dealsTotal?.toLocaleString() || 0}`],
      ['Total Accepted Quotes', `$${validationData.validationStats.acceptedQuotesTotal?.toLocaleString() || 0}`],
      ['Totals Match', validationData.validationStats.totalsMismatch ? 'NO' : 'YES'],
      [''],
      ['Top Issues']
    ];
    
    if (validationData.validationStats.issueBreakdown) {
      Object.entries(validationData.validationStats.issueBreakdown)
        .sort(([,a], [,b]) => (b as number) - (a as number))
        .slice(0, 10)
        .forEach(([code, count]) => {
          summaryData.push([code, count]);
        });
    }
    
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
    
    // Generate and download file
    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    saveAs(blob, `project-sync-validation-${timestamp}.xlsx`);
  }, [validationData, sessionData]);

  // Only show for BSENI tenant
  if (currentTenantId !== '6dd39ea4-e6a6-4993-a37a-21482ccf8d22') {
    return null;
  }

  // Get deals with fixable issues
  const dealsWithFixableIssues = validationData?.deals?.filter((deal: any) => 
    deal.validationIssues?.some((issue: any) => issue.fixable)
  ) || [];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-200">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Project Sync Validation</h2>
            <p className="text-sm text-gray-500 mt-1">
              Validate and fix Pipedrive deals against Xero quotes
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

        {/* Fixable Issues Section */}
        {dealsWithFixableIssues.length > 0 && !isRunning && (
          <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-green-900 flex items-center">
                <WrenchScrewdriverIcon className="h-4 w-4 mr-2" />
                Fixable Issues ({validationStats.fixableIssues} total)
                {isFixingAll && (
                  <span className="ml-2 text-xs text-green-600">
                    - Processing {fixProgress.filter(p => p.status === 'success').length}/{validationStats.fixableIssues}
                  </span>
                )}
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAllFixable(!showAllFixable)}
                  className="text-xs text-green-700 hover:text-green-800 underline"
                >
                  {showAllFixable ? 'Show Less' : 'Show All'}
                </button>
                <button
                  onClick={async () => {
                    await handleFixAll();
                    setTimeout(() => {
                      handleProjectSync();
                    }, 2000);
                  }}
                  disabled={isFixingAll || isFixing}
                  className="px-3 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {isFixingAll ? (
                    <>
                      <ArrowPathIcon className="h-3 w-3 mr-1 animate-spin" />
                      Fixing All...
                    </>
                  ) : (
                    <>
                      <WrenchScrewdriverIcon className="h-3 w-3 mr-1" />
                      Fix All Issues
                    </>
                  )}
                </button>
              </div>
            </div>
            <div className={`space-y-2 overflow-y-auto ${showAllFixable ? 'max-h-96' : 'max-h-64'}`}>
              {(showAllFixable ? dealsWithFixableIssues : dealsWithFixableIssues.slice(0, 5)).map((deal: any) => (
                <div key={deal.id} className="bg-white rounded-lg p-3 border border-green-100">
                  <div className="font-medium text-sm text-gray-900 mb-1">{deal.title}</div>
                  {deal.validationIssues
                    ?.filter((issue: any) => issue.fixable)
                    .map((issue: any) => {
                      const fixStatus = fixProgress.find(
                        f => f.dealId === deal.id && f.issueCode === issue.code
                      );
                      
                      return (
                        <div key={issue.code} className="flex items-center justify-between mt-2">
                          <div className="flex-1">
                            <div className="text-xs text-gray-600">{issue.message}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{issue.fixAction}</div>
                          </div>
                          <button
                            onClick={() => handleFixIssue(deal.id, issue.code, deal)}
                            disabled={isFixing || isFixingAll || fixStatus?.status === 'fixing'}
                            className="ml-3 px-3 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                          >
                            {fixStatus?.status === 'fixing' ? (
                              <>
                                <ArrowPathIcon className="h-3 w-3 mr-1 animate-spin" />
                                Fixing...
                              </>
                            ) : fixStatus?.status === 'success' ? (
                              <>
                                <CheckCircleIcon className="h-3 w-3 mr-1" />
                                Fixed
                              </>
                            ) : fixStatus?.status === 'error' ? (
                              <>
                                <XCircleIcon className="h-3 w-3 mr-1" />
                                Retry
                              </>
                            ) : (
                              <>
                                <WrenchScrewdriverIcon className="h-3 w-3 mr-1" />
                                Fix
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })}
                </div>
              ))}
              {!showAllFixable && dealsWithFixableIssues.length > 5 && (
                <div className="text-xs text-gray-500 text-center pt-2">
                  And {dealsWithFixableIssues.length - 5} more deals with fixable issues...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Validation Stats */}
        {validationStats && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-3">Validation Results</h3>
            
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-white rounded-lg p-3">
                <div className="text-2xl font-bold text-gray-900">{validationStats.totalDeals}</div>
                <div className="text-xs text-gray-600">Total Won Deals</div>
              </div>
              <div className="bg-white rounded-lg p-3">
                <div className="text-2xl font-bold text-green-600">{validationStats.fullySynced}</div>
                <div className="text-xs text-gray-600">Fully Synced</div>
              </div>
            </div>

            {validationStats.withErrors > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="text-sm font-medium text-red-800 mb-2">
                  {validationStats.withErrors} Deals with Errors
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3">
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
                Validating Projects...
              </>
            ) : (
              <>
                <DocumentMagnifyingGlassIcon className="h-5 w-5 mr-2" />
                Validate Project Sync
              </>
            )}
          </button>

          {validationData && !isRunning && (
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
          Validates deals and provides one-click fixes for common issues
        </p>
      </div>
    </div>
  );
}