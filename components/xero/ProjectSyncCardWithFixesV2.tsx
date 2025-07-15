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

export default function ProjectSyncCardWithFixesV2({ disabled = false }: ProjectSyncCardProps) {
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
  const [showAllHighlighted, setShowAllHighlighted] = useState(false);

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
      { id: 'fetch', label: 'Phase 1: Fetching won deals from Pipedrive', status: 'pending' },
      { id: 'validate', label: 'Phase 1: Validating deals and Xero quotes', status: 'pending' },
      { id: 'analyze', label: 'Phase 1: Analyzing sync status', status: 'pending' },
      { id: 'report', label: 'Phase 1: Generating report', status: 'pending' },
      { id: 'phase2_fetch', label: 'Phase 2: Fetching Pipeline 3 deals', status: 'pending' },
      { id: 'phase2_validate', label: 'Phase 2: Validating invoices', status: 'pending' },
      { id: 'phase3_fetch', label: 'Phase 3: Fetching accepted Xero quotes', status: 'pending' },
      { id: 'phase3_validate', label: 'Phase 3: Comparing quotes with deals', status: 'pending' },
      { id: 'phase4_fetch', label: 'Phase 4: Fetching Xero projects', status: 'pending' },
      { id: 'phase4_validate', label: 'Phase 4: Validating projects', status: 'pending' }
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
          expectedQuoteNumber: null,
          org_id: dealData.org_id,
          xeroQuote: dealData.xeroQuote
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
        
        // Don't refresh validation - just show success
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
      ['PHASE 1: Deal Validation Statistics'],
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
    
    // Add Phase 2 data if available - Invoice Validation
    if (validationData.phase2) {
      summaryData.push(
        [''],
        [''],
        ['PHASE 2: Invoice Validation Analysis'],
        ['Total Pipeline 3 Deals', validationData.phase2.stats.totalPipeline3Deals],
        ['Deals with Invoice ID', validationData.phase2.stats.dealsWithInvoiceId],
        ['Deals without Invoice ID', validationData.phase2.stats.dealsWithoutInvoiceId],
        ['Invoices Found in Xero', validationData.phase2.stats.invoicesFound],
        ['Invoices Not Found', validationData.phase2.stats.invoicesNotFound],
        [''],
        ['Invoice Value Analysis'],
        ['Total Deals Value', `$${validationData.phase2.stats.totalDealsValue?.toLocaleString() || 0}`],
        ['Total Invoices Value', `$${validationData.phase2.stats.totalInvoicesValue?.toLocaleString() || 0}`],
        ['Value Difference', `$${Math.abs(validationData.phase2.stats.valueDifference || 0).toLocaleString()}`],
        ['Invoice Value Matches', validationData.phase2.stats.invoiceValueMatches],
        ['Invoice Value Mismatches', validationData.phase2.stats.invoiceValueMismatches]
      );
    }
    
    // Add Phase 3 data if available - Quote Comparison
    if (validationData.phase3) {
      summaryData.push(
        [''],
        [''],
        ['PHASE 3: Quote Comparison Analysis'],
        ['Total Accepted Quotes', validationData.phase3.stats.totalAcceptedQuotes],
        ['Total Accepted Quotes Value', `$${validationData.phase3.stats.totalAcceptedQuotesValue?.toLocaleString() || 0}`],
        ['Total Won Deals', validationData.phase3.stats.totalWonDeals],
        ['Total Won Deals Value', `$${validationData.phase3.stats.totalWonDealsValue?.toLocaleString() || 0}`],
        [''],
        ['Quote Analysis'],
        ['Quotes with Matching Deals', validationData.phase3.stats.quotesWithDeals],
        ['Orphaned Quotes', validationData.phase3.stats.orphanedQuotes],
        ['Deals without Quotes', validationData.phase3.stats.dealsWithoutQuotes],
        ['Value Mismatch', validationData.phase3.stats.valueMismatch ? 'YES' : 'NO'],
        ['Value Difference', `$${Math.abs(validationData.phase3.stats.valueDifference || 0).toLocaleString()}`]
      );
      
      if (validationData.phase3.duplicateQuotes?.length > 0) {
        summaryData.push(
          [''],
          ['Duplicate Quotes', validationData.phase3.duplicateQuotes.length + ' deals have multiple quotes']
        );
      }
      
      // Add Phase 4 summary
      if (validationData.phase4) {
        summaryData.push(
          [''],
          [''],
          ['PHASE 4: Project Validation Analysis'],
          ['Total In-Progress Projects', validationData.phase4.stats.totalInProgressProjects],
          ['Projects with Quotes', validationData.phase4.stats.projectsWithQuotes],
          ['Projects without Quotes', validationData.phase4.stats.projectsWithoutQuotes],
          ['Projects with Estimate Mismatch', validationData.phase4.stats.projectsWithEstimateMismatch],
          ['Projects with Invalid Deals', validationData.phase4.stats.projectsWithInvalidDeals],
          [''],
          ['Project Financial Summary'],
          ['Total Project Estimates', `$${validationData.phase4.stats.totalProjectEstimates?.toLocaleString() || 0}`],
          ['Total Quotes for Projects', `$${validationData.phase4.stats.totalQuotesForProjects?.toLocaleString() || 0}`],
          ['Estimate Difference', `$${Math.abs(validationData.phase4.stats.estimateDifference || 0).toLocaleString()}`]
        );
      }
    }
    
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
    
    // Add Phase 2 Invoice Validation Sheet if available
    if (validationData.phase2?.deals) {
      const invoiceData = [
        ['Invoice Validation Report'],
        [''],
        ['Deal ID', 'Deal Title', 'Deal Value', 'Currency', 'Invoice ID', 'Invoice Number', 'Invoice Status', 'Invoice Total', 'Issues'],
        ...validationData.phase2.deals.map((deal: any) => [
          deal.dealId,
          deal.dealTitle,
          deal.dealValue,
          deal.dealCurrency,
          deal.invoiceId || 'No Invoice ID',
          deal.invoiceNumber || 'N/A',
          deal.xeroInvoice?.Status || 'N/A',
          deal.xeroInvoice?.Total || 'N/A',
          deal.validationIssues.map((i: any) => i.code).join(', ') || 'None'
        ])
      ];
      
      const invoiceSheet = XLSX.utils.aoa_to_sheet(invoiceData);
      XLSX.utils.book_append_sheet(workbook, invoiceSheet, 'Invoice Validation');
    }
    
    // Add Phase 3 Reconciliation Sheet if available
    if (validationData.phase3?.quotes) {
      const reconciliationData = [
        ['Quote Reconciliation Report'],
        [''],
        ['Quote Number', 'Quote Value', 'Currency', 'Status', 'Deal ID Reference', 'Matched Deal ID', 'Deal Value', 'Value Match', 'Issues'],
        ...validationData.phase3.quotes.map((quote: any) => {
          const matchedDeal = validationData.deals.find((d: any) => d.id.toString() === quote.associatedDealId);
          const hasValueMismatch = quote.validationIssues.some((i: any) => i.code === 'QUOTE_VALUE_MISMATCH');
          const isOrphaned = quote.validationIssues.some((i: any) => i.code === 'QUOTE_ORPHANED');
          
          return [
            quote.quoteNumber,
            quote.total,
            quote.currency,
            isOrphaned ? 'ORPHANED' : (matchedDeal ? 'MATCHED' : 'NO MATCH'),
            quote.reference || 'No reference',
            quote.associatedDealId || 'N/A',
            matchedDeal ? (matchedDeal.productsTotal || matchedDeal.value) : 'N/A',
            hasValueMismatch ? 'MISMATCH' : (matchedDeal ? 'MATCH' : 'N/A'),
            quote.validationIssues.map((i: any) => i.code).join(', ') || 'None'
          ];
        })
      ];
      
      const reconciliationSheet = XLSX.utils.aoa_to_sheet(reconciliationData);
      XLSX.utils.book_append_sheet(workbook, reconciliationSheet, 'Quote Reconciliation');
      
      // Add Orphaned Quotes Sheet
      const orphanedQuotes = validationData.phase3.quotes.filter((q: any) => 
        q.validationIssues.some((i: any) => i.code === 'QUOTE_ORPHANED')
      );
      
      if (orphanedQuotes.length > 0) {
        const orphanedData = [
          ['Orphaned Quotes Report'],
          [''],
          ['Quote Number', 'Value', 'Currency', 'Reference', 'Contact Name'],
          ...orphanedQuotes.map((quote: any) => [
            quote.quoteNumber,
            quote.total,
            quote.currency,
            quote.reference || 'No reference',
            'Check Xero for contact details'
          ])
        ];
        
        const orphanedSheet = XLSX.utils.aoa_to_sheet(orphanedData);
        XLSX.utils.book_append_sheet(workbook, orphanedSheet, 'Orphaned Quotes');
      }
      
      // Add Phase 4 Project Validation Sheet if available
      if (validationData.phase4?.projects) {
        const projectData = [
          ['Project Validation Report'],
          [''],
          ['Project Name', 'Project Code', 'Status', 'Estimate', 'Total Quotes', 'Quote Count', 'Has Valid Deal', 'Issues'],
          ...validationData.phase4.projects.map((project: any) => [
            project.projectName,
            project.projectCode,
            project.status,
            project.estimateValue,
            project.totalQuotesValue,
            project.associatedQuotes.length,
            project.hasValidDeal ? 'YES' : 'NO',
            project.validationIssues.map((i: any) => i.code).join(', ') || 'None'
          ])
        ];
        
        const projectSheet = XLSX.utils.aoa_to_sheet(projectData);
        XLSX.utils.book_append_sheet(workbook, projectSheet, 'Project Validation');
        
        // Add Projects Without Quotes Sheet
        const projectsWithoutQuotes = validationData.phase4.projects.filter((p: any) => 
          p.associatedQuotes.length === 0
        );
        
        if (projectsWithoutQuotes.length > 0) {
          const noQuotesData = [
            ['Projects Without Quotes'],
            [''],
            ['Project Name', 'Project Code', 'Estimate', 'Currency'],
            ...projectsWithoutQuotes.map((project: any) => [
              project.projectName,
              project.projectCode,
              project.estimateValue,
              project.currency
            ])
          ];
          
          const noQuotesSheet = XLSX.utils.aoa_to_sheet(noQuotesData);
          XLSX.utils.book_append_sheet(workbook, noQuotesSheet, 'Projects Without Quotes');
        }
      }
    }
    
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
  
  // Get deals with highlighted issues (warnings, info, non-fixable errors)
  const dealsWithHighlightedIssues = validationData?.deals?.filter((deal: any) => 
    deal.validationIssues?.some((issue: any) => 
      (issue.severity === 'warning' || issue.severity === 'info' || 
       (issue.severity === 'error' && !issue.fixable))
    )
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

        {/* Success Message for Fixes */}
        {fixProgress.some(p => p.status === 'success') && !isRunning && !isFixing && !isFixingAll && (
          <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <CheckCircleIconSolid className="h-5 w-5 text-green-500 mr-2" />
                <span className="text-sm text-green-800 font-medium">
                  {fixProgress.filter(p => p.status === 'success').length} issue{fixProgress.filter(p => p.status === 'success').length > 1 ? 's' : ''} fixed successfully
                </span>
              </div>
              <button
                onClick={() => {
                  setFixProgress([]);
                  handleProjectSync();
                }}
                className="text-xs text-green-700 hover:text-green-800 underline"
              >
                Refresh Validation
              </button>
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
                  onClick={handleFixAll}
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

        {/* Highlighted Issues Section */}
        {dealsWithHighlightedIssues.length > 0 && !isRunning && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-amber-900 flex items-center">
                <ExclamationCircleIcon className="h-4 w-4 mr-2" />
                Highlighted Issues ({dealsWithHighlightedIssues.length} deals)
              </h3>
              <button
                onClick={() => setShowAllHighlighted(!showAllHighlighted)}
                className="text-xs text-amber-700 hover:text-amber-800 underline"
              >
                {showAllHighlighted ? 'Show Less' : 'Show All'}
              </button>
            </div>
            <div className={`space-y-2 overflow-y-auto ${showAllHighlighted ? 'max-h-96' : 'max-h-64'}`}>
              {(showAllHighlighted ? dealsWithHighlightedIssues : dealsWithHighlightedIssues.slice(0, 5)).map((deal: any) => (
                <div key={deal.id} className="bg-white rounded-lg p-3 border border-amber-100">
                  <div className="font-medium text-sm text-gray-900 mb-1">{deal.title}</div>
                  {deal.validationIssues
                    ?.filter((issue: any) => 
                      issue.severity === 'warning' || issue.severity === 'info' || 
                      (issue.severity === 'error' && !issue.fixable)
                    )
                    .map((issue: any) => (
                      <div key={issue.code} className="mt-2">
                        <div className="flex items-start">
                          <div className={`flex-shrink-0 mt-0.5 ${
                            issue.severity === 'error' ? 'text-red-500' :
                            issue.severity === 'warning' ? 'text-amber-500' :
                            'text-blue-500'
                          }`}>
                            <ExclamationCircleIcon className="h-4 w-4" />
                          </div>
                          <div className="ml-2 flex-1">
                            <div className="text-xs text-gray-600">{issue.message}</div>
                            {issue.fixAction && (
                              <div className="text-xs text-gray-500 mt-0.5 italic">{issue.fixAction}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              ))}
              {!showAllHighlighted && dealsWithHighlightedIssues.length > 5 && (
                <div className="text-xs text-gray-500 text-center pt-2">
                  And {dealsWithHighlightedIssues.length - 5} more deals with highlighted issues...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Validation Stats */}
        {validationStats && (
          <div className="space-y-4">
            {/* Phase 1 Results */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-blue-900 mb-3">Phase 1: Deal Validation Results</h3>
              
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

            {/* Phase 2 Results - Invoice Validation */}
            {validationData?.phase2 && (
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 mt-4">
                <h3 className="text-sm font-semibold text-teal-900 mb-3">Phase 2: Invoice Validation Results</h3>
                
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-2xl font-bold text-gray-900">{validationData.phase2.stats.totalPipeline3Deals}</div>
                    <div className="text-xs text-gray-600">Pipeline 3 Deals</div>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-2xl font-bold text-green-600">{validationData.phase2.stats.invoicesFound}</div>
                    <div className="text-xs text-gray-600">Invoices Found</div>
                  </div>
                </div>

                {/* Invoice Issues */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="bg-white rounded-lg p-2 text-center">
                    <div className="text-lg font-semibold text-red-600">{validationData.phase2.stats.dealsWithoutInvoiceId}</div>
                    <div className="text-xs text-gray-600">No Invoice ID</div>
                  </div>
                  <div className="bg-white rounded-lg p-2 text-center">
                    <div className="text-lg font-semibold text-orange-600">{validationData.phase2.stats.invoicesNotFound}</div>
                    <div className="text-xs text-gray-600">Invoice Not Found</div>
                  </div>
                  <div className="bg-white rounded-lg p-2 text-center">
                    <div className="text-lg font-semibold text-yellow-600">{validationData.phase2.stats.invoiceValueMismatches}</div>
                    <div className="text-xs text-gray-600">Value Mismatch</div>
                  </div>
                </div>

                {/* Invoice Value Comparison */}
                {Math.abs(validationData.phase2.stats.valueDifference) > 0.01 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                    <div className="text-sm font-medium text-red-800">
                      ⚠️ Invoice Values Mismatch
                    </div>
                    <div className="text-xs text-red-600 mt-1">
                      Total Deals: SGD {validationData.phase2.stats.totalDealsValue.toLocaleString()}<br/>
                      Total Invoices: SGD {validationData.phase2.stats.totalInvoicesValue.toLocaleString()}<br/>
                      Difference: SGD {Math.abs(validationData.phase2.stats.valueDifference).toLocaleString()}
                    </div>
                  </div>
                )}

                {/* Deals without Invoices */}
                {validationData.phase2.stats.dealsWithoutInvoiceId > 0 && (
                  <details className="mt-3 group">
                    <summary className="cursor-pointer text-xs text-black hover:text-gray-800">
                      View deals without invoice IDs
                    </summary>
                    <div className="mt-2 max-h-32 overflow-y-auto space-y-1">
                      {validationData.phase2.deals
                        .filter((d: any) => !d.invoiceId)
                        .map((deal: any) => (
                          <div key={deal.dealId} className="text-xs bg-white rounded p-2">
                            <span className="font-medium text-black">{deal.dealTitle}</span>
                            <span className="text-black ml-2">
                              {deal.dealCurrency} {deal.dealValue.toLocaleString()}
                            </span>
                          </div>
                        ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            {/* Phase 3 Results - Quote Comparison */}
            {validationData?.phase3 && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mt-4">
                <h3 className="text-sm font-semibold text-purple-900 mb-3">Phase 3: Quote Comparison Results</h3>
                
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-2xl font-bold text-gray-900">{validationData.phase3.stats.totalAcceptedQuotes}</div>
                    <div className="text-xs text-gray-600">Accepted Quotes</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Total: {validationData.phase3.stats.currency || 'SGD'} {validationData.phase3.stats.totalAcceptedQuotesValue.toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-2xl font-bold text-gray-900">{validationData.phase3.stats.totalWonDeals}</div>
                    <div className="text-xs text-gray-600">Won Deals</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Total: SGD {validationData.phase3.stats.totalWonDealsValue.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Value Mismatch Alert */}
                {validationData.phase3.stats.valueMismatch && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                    <div className="text-sm font-medium text-red-800">
                      ⚠️ Total Values Mismatch
                    </div>
                    <div className="text-xs text-red-600 mt-1">
                      Difference: SGD {Math.abs(validationData.phase3.stats.valueDifference).toLocaleString()}
                    </div>
                    
                    {/* Detailed Value Breakdown */}
                    {validationData.phase3.stats.valueBreakdown && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-red-700 hover:text-red-800">
                          View detailed breakdown
                        </summary>
                        <div className="mt-2 bg-white rounded p-2 text-xs space-y-1">
                          <div className="font-semibold text-black mb-2">Value Reconciliation Analysis:</div>
                          
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-gray-600">Orphaned Quotes Value:</span>
                            </div>
                            <div className="text-right font-medium text-black">
                              SGD {validationData.phase3.stats.valueBreakdown.orphanedQuotesValue.toLocaleString()}
                            </div>
                            
                            <div>
                              <span className="text-gray-600">Duplicate Quotes Value:</span>
                            </div>
                            <div className="text-right font-medium text-black">
                              SGD {validationData.phase3.stats.valueBreakdown.duplicateQuotesValue.toLocaleString()}
                            </div>
                            
                            <div>
                              <span className="text-gray-600">Matched Quotes Value:</span>
                            </div>
                            <div className="text-right font-medium text-black">
                              SGD {validationData.phase3.stats.valueBreakdown.matchedQuotesValue.toLocaleString()}
                            </div>
                            
                            <div className="col-span-2 border-t pt-1 mt-1"></div>
                            
                            <div>
                              <span className="text-gray-600">Deals with Quotes Value:</span>
                            </div>
                            <div className="text-right font-medium text-black">
                              SGD {validationData.phase3.stats.valueBreakdown.dealsWithQuotesValue.toLocaleString()}
                            </div>
                            
                            <div>
                              <span className="text-gray-600">Deals without Quotes Value:</span>
                            </div>
                            <div className="text-right font-medium text-black">
                              SGD {validationData.phase3.stats.valueBreakdown.dealsWithoutQuotesValue.toLocaleString()}
                            </div>
                            
                            <div className="col-span-2 border-t pt-1 mt-1"></div>
                            
                            <div className="col-span-2">
                              <div className="text-gray-600">Quotes with Value Mismatch: {validationData.phase3.stats.valueBreakdown.quotesWithValueMismatch}</div>
                              {validationData.phase3.stats.valueBreakdown.quotesWithValueMismatch > 0 && (
                                <div className="mt-1 pl-2 space-y-1">
                                  {validationData.phase3.quotes
                                    .filter((q: any) => q.validationIssues.some((i: any) => i.code === 'QUOTE_VALUE_MISMATCH'))
                                    .slice(0, 5)
                                    .map((quote: any) => {
                                      const deal = validationData.deals.find((d: any) => d.id.toString() === quote.associatedDealId);
                                      const dealValue = deal ? (deal.productsTotal > 0 ? deal.productsTotal : deal.value) : 0;
                                      return (
                                        <div key={quote.quoteId} className="text-xs">
                                          <span className="font-medium text-black">{quote.quoteNumber}</span>: 
                                          <span className="text-red-600"> {quote.currency} {quote.total.toLocaleString()}</span> vs 
                                          <span className="text-blue-600"> {deal?.currency || 'SGD'} {dealValue.toLocaleString()}</span>
                                        </div>
                                      );
                                    })}
                                  {validationData.phase3.quotes.filter((q: any) => 
                                    q.validationIssues.some((i: any) => i.code === 'QUOTE_VALUE_MISMATCH')
                                  ).length > 5 && (
                                    <div className="text-xs text-gray-500">
                                      ... and {validationData.phase3.quotes.filter((q: any) => 
                                        q.validationIssues.some((i: any) => i.code === 'QUOTE_VALUE_MISMATCH')
                                      ).length - 5} more
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            
                            <div>
                              <span className="text-gray-600">Total Mismatch Amount:</span>
                            </div>
                            <div className="text-right font-medium text-black">
                              SGD {validationData.phase3.stats.valueBreakdown.totalValueMismatchAmount.toLocaleString()}
                            </div>
                          </div>
                          
                          <div className="mt-3 p-2 bg-yellow-50 rounded">
                            <div className="text-yellow-800 font-medium">Unexplained Difference:</div>
                            <div className="text-yellow-700">
                              SGD {(Math.abs(validationData.phase3.stats.valueDifference) - 
                                validationData.phase3.stats.valueBreakdown.orphanedQuotesValue - 
                                validationData.phase3.stats.valueBreakdown.duplicateQuotesValue -
                                validationData.phase3.stats.valueBreakdown.dealsWithoutQuotesValue).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      </details>
                    )}
                  </div>
                )}

                {/* Quote Statistics */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white rounded-lg p-2 text-center">
                    <div className="text-lg font-semibold text-green-600">{validationData.phase3.stats.quotesWithDeals}</div>
                    <div className="text-xs text-gray-600">Matched Quotes</div>
                  </div>
                  <div className="bg-white rounded-lg p-2 text-center">
                    <div className="text-lg font-semibold text-red-600">{validationData.phase3.stats.orphanedQuotes}</div>
                    <div className="text-xs text-gray-600">Orphaned Quotes</div>
                  </div>
                  <div className="bg-white rounded-lg p-2 text-center">
                    <div className="text-lg font-semibold text-orange-600">{validationData.phase3.stats.dealsWithoutQuotes}</div>
                    <div className="text-xs text-gray-600">Deals w/o Quotes</div>
                  </div>
                </div>

                {/* Duplicate Quotes Warning */}
                {validationData.phase3.duplicateQuotes?.length > 0 && (
                  <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <div className="text-sm font-medium text-yellow-800 mb-2">
                      ⚠️ Duplicate Quotes Found
                    </div>
                    <div className="text-xs text-yellow-700 mb-2">
                      {validationData.phase3.duplicateQuotes.length} deals have multiple accepted quotes
                    </div>
                    <details className="group">
                      <summary className="cursor-pointer text-xs text-black hover:text-gray-800">
                        View duplicate quotes details
                      </summary>
                      <div className="mt-2 max-h-32 overflow-y-auto space-y-2">
                        {validationData.phase3.duplicateQuotes.map((dup: any) => (
                          <div key={dup.dealId} className="text-xs bg-white rounded p-2 border border-yellow-100">
                            <div className="font-medium text-yellow-800">Deal ID: {dup.dealId}</div>
                            <div className="mt-1 space-y-1">
                              {dup.quotes.map((quote: any, idx: number) => (
                                <div key={quote.quoteId} className="text-gray-600 pl-2">
                                  {idx + 1}. {quote.quoteNumber} - {quote.currency || 'SGD'} {quote.total.toLocaleString()}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                )}

                {/* Orphaned Quotes List */}
                {validationData.phase3.stats.orphanedQuotes > 0 && (
                  <div className="mt-3">
                    <details className="group">
                      <summary className="cursor-pointer text-xs text-black hover:text-gray-800">
                        View orphaned quotes details
                      </summary>
                      <div className="mt-2 max-h-32 overflow-y-auto space-y-1">
                        {validationData.phase3.quotes
                          .filter((q: any) => q.validationIssues.some((i: any) => i.code === 'QUOTE_ORPHANED'))
                          .map((quote: any) => (
                            <div key={quote.quoteId} className="text-xs bg-white rounded p-2">
                              <span className="font-medium text-black">{quote.quoteNumber}</span>
                              <span className="text-black ml-2">
                                {quote.currency} {quote.total.toLocaleString()}
                              </span>
                            </div>
                          ))}
                      </div>
                    </details>
                  </div>
                )}
              </div>
            )}
            
            {/* Phase 4 Results - Projects */}
            {validationData?.phase4 && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mt-4">
                <h3 className="text-sm font-semibold text-indigo-900 mb-3">Phase 4: Project Validation Results</h3>
                
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-2xl font-bold text-gray-900">{validationData.phase4.stats.totalInProgressProjects}</div>
                    <div className="text-xs text-gray-600">In-Progress Projects</div>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-2xl font-bold text-green-600">{validationData.phase4.stats.projectsWithQuotes}</div>
                    <div className="text-xs text-gray-600">Projects with Quotes</div>
                  </div>
                </div>

                {/* Project Issues */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-white rounded-lg p-2 text-center">
                    <div className="text-lg font-semibold text-red-600">{validationData.phase4.stats.projectsWithoutQuotes}</div>
                    <div className="text-xs text-gray-600">Without Quotes</div>
                  </div>
                  <div className="bg-white rounded-lg p-2 text-center">
                    <div className="text-lg font-semibold text-orange-600">{validationData.phase4.stats.projectsWithEstimateMismatch}</div>
                    <div className="text-xs text-gray-600">Estimate Mismatch</div>
                  </div>
                </div>

                {/* Duplicate Projects Warning */}
                {validationData.phase4.stats.duplicateProjects > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                    <div className="text-sm font-medium text-red-800 mb-2">
                      ⚠️ Duplicate Projects Found
                    </div>
                    <div className="text-xs text-red-700 mb-2">
                      {validationData.phase4.stats.duplicateProjects} project codes have duplicates
                    </div>
                    {validationData.phase4.duplicates && (
                      <details className="group">
                        <summary className="cursor-pointer text-xs text-black hover:text-gray-800">
                          View duplicate projects
                        </summary>
                        <div className="mt-2 max-h-32 overflow-y-auto space-y-2">
                          {validationData.phase4.duplicates.map((dup: any) => (
                            <div key={dup.projectCode} className="text-xs bg-white rounded p-2">
                              <div className="font-medium text-red-800">Code: {dup.projectCode}</div>
                              {dup.projects.map((proj: any, idx: number) => (
                                <div key={idx} className="pl-2 mt-1">
                                  {proj.projectName} - Est: SGD {proj.estimate.toLocaleString()}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}

                {/* Projects Without Quotes Warning */}
                {validationData.phase4.stats.projectsWithoutQuotes > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                    <div className="text-sm font-medium text-red-800 mb-2">
                      ⚠️ Projects Without Accepted Quotes
                    </div>
                    <details className="group">
                      <summary className="cursor-pointer text-xs text-black hover:text-gray-800">
                        View projects without quotes
                      </summary>
                      <div className="mt-2 max-h-32 overflow-y-auto space-y-1">
                        {validationData.phase4.projects
                          .filter((p: any) => p.associatedQuotes.length === 0)
                          .map((project: any) => (
                            <div key={project.projectId} className="text-xs bg-white rounded p-2">
                              <span className="font-medium text-black">{project.projectName}</span>
                              <span className="text-black ml-2">
                                Estimate: {project.currency} {project.estimateValue.toLocaleString()}
                              </span>
                            </div>
                          ))}
                      </div>
                    </details>
                  </div>
                )}

                {/* Invalid Pipeline Warning */}
                {validationData.phase4.stats.projectsWithInvalidDeals > 0 && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-3">
                    <div className="text-sm font-medium text-orange-800 mb-2">
                      ⚠️ Projects with Deals in Wrong Pipeline
                    </div>
                    <div className="text-xs text-orange-700 mb-2">
                      {validationData.phase4.stats.projectsWithInvalidDeals} projects have deals not in Pipeline 2
                    </div>
                    {validationData.phase4.stats.projectBreakdown?.withPipelineIssues && (
                      <details className="group">
                        <summary className="cursor-pointer text-xs text-black hover:text-gray-800">
                          View pipeline issue details
                        </summary>
                        <div className="mt-2 max-h-48 overflow-y-auto space-y-2">
                          {validationData.phase4.stats.projectBreakdown.withPipelineIssues.map((project: any, idx: number) => (
                            <div key={idx} className="text-xs bg-white rounded p-2">
                              <div className="font-medium text-black">{project.projectName}</div>
                              {project.deals.map((deal: any, dealIdx: number) => (
                                <div key={dealIdx} className="mt-1 pl-2 text-gray-700">
                                  Deal {deal.dealId}: Pipeline {deal.pipeline} - {deal.title}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}

                {/* Estimate vs Quotes Total */}
                <div className="bg-white rounded-lg p-3">
                  <div className="text-xs text-gray-600 mb-2">Project Estimates vs Quote Totals</div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-600">Total Estimates:</span>
                      <div className="font-medium text-black">SGD {validationData.phase4.stats.totalProjectEstimates.toLocaleString()}</div>
                    </div>
                    <div>
                      <span className="text-gray-600">Total Quotes:</span>
                      <div className="font-medium text-black">SGD {validationData.phase4.stats.totalQuotesForProjects.toLocaleString()}</div>
                    </div>
                  </div>
                  {Math.abs(validationData.phase4.stats.estimateDifference) > 0.01 && (
                    <>
                      <div className="mt-2 text-xs text-red-600">
                        Difference: SGD {Math.abs(validationData.phase4.stats.estimateDifference).toLocaleString()}
                      </div>
                      {validationData.phase4.stats.projectBreakdown?.withEstimateMismatch && 
                       validationData.phase4.stats.projectBreakdown.withEstimateMismatch.length > 0 && (
                        <details className="mt-2 group">
                          <summary className="cursor-pointer text-xs text-black hover:text-gray-800">
                            View estimate mismatch breakdown
                          </summary>
                          <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
                            <div className="text-xs font-semibold text-gray-700 grid grid-cols-4 gap-2 pb-1 border-b">
                              <div>Project</div>
                              <div className="text-right">Estimate</div>
                              <div className="text-right">Quotes</div>
                              <div className="text-right">Diff</div>
                            </div>
                            {validationData.phase4.stats.projectBreakdown.withEstimateMismatch
                              .sort((a: any, b: any) => Math.abs(b.difference) - Math.abs(a.difference))
                              .slice(0, 10)
                              .map((project: any, idx: number) => (
                                <div key={idx} className="text-xs grid grid-cols-4 gap-2">
                                  <div className="truncate font-medium text-black" title={project.projectName}>
                                    {project.projectName}
                                  </div>
                                  <div className="text-right">{project.estimate.toLocaleString()}</div>
                                  <div className="text-right">{project.quotesTotal.toLocaleString()}</div>
                                  <div className={`text-right font-medium ${project.difference > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    {project.difference > 0 ? '+' : ''}{project.difference.toLocaleString()}
                                  </div>
                                </div>
                              ))}
                            {validationData.phase4.stats.projectBreakdown.withEstimateMismatch.length > 10 && (
                              <div className="text-xs text-gray-500 text-center pt-2">
                                ... and {validationData.phase4.stats.projectBreakdown.withEstimateMismatch.length - 10} more
                              </div>
                            )}
                          </div>
                        </details>
                      )}
                    </>
                  )}
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