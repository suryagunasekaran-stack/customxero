'use client';

import React, { useState, useMemo } from 'react';
import {
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  PlayIcon,
  WrenchScrewdriverIcon,
  DocumentArrowDownIcon
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleIconSolid } from '@heroicons/react/24/solid';
import { ValidationIssue } from '@/lib/types/validation';
import { FixValidationIssue, FixConfirmationData } from '@/lib/types/fix';
import { useFixSession } from '@/lib/hooks/useFixSession';
import FixConfirmationDialog from './FixConfirmationDialog';
import FixProgressModal from './FixProgressModal';

interface ValidationStep {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'error' | 'skipped';
  progress?: number;
  result?: any;
  error?: string;
}

interface ValidationResults {
  session: any;
  results?: {
    totalDeals: number;
    issues: ValidationIssue[];
    errorCount: number;
    warningCount: number;
    summary: {
      message: string;
      timestamp: string;
    };
  };
}

/**
 * Interactive React component for initiating and monitoring Pipedrive deal validation workflows
 * 
 * @description Provides a user interface for triggering validation processes with real-time
 * progress tracking via Server-Sent Events (SSE). Displays validation results, issues,
 * and detailed reports in an expandable interface. Handles streaming responses from the
 * validation API endpoint.
 * 
 * @component
 * @example
 * ```tsx
 * // Basic usage in a page or component
 * import { SyncButton } from '@/components/xero/SyncButton';
 * 
 * function ValidationPage() {
 *   return (
 *     <div>
 *       <h1>Pipedrive Validation</h1>
 *       <SyncButton />
 *     </div>
 *   );
 * }
 * ```
 * 
 * @returns {JSX.Element} React component with validation controls and results display
 * 
 * @since 1.0.0
 */
export function SyncButton() {
  const [isValidating, setIsValidating] = useState(false);
  const [currentStep, setCurrentStep] = useState<ValidationStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ValidationResults | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showFixConfirmation, setShowFixConfirmation] = useState(false);
  const [showFixProgress, setShowFixProgress] = useState(false);
  const [isDryRun, setIsDryRun] = useState(false);
  const [tenantId, setTenantId] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  
  // Use fix session hook
  const fixSession = useFixSession();
  
  /**
   * Initiates the validation workflow by calling the API endpoint and processing SSE responses
   * 
   * @description Starts validation process with real-time progress updates via Server-Sent Events.
   * Handles streaming data including progress updates, logs, errors, and final results.
   * Updates component state based on received events.
   * 
   * @async
   * @function
   * @returns {Promise<void>} Promise that resolves when validation completes or fails
   * 
   * @example
   * ```typescript
   * // Called when user clicks validation button
   * await startValidation();
   * ```
   */
  const startValidation = async () => {
    setIsValidating(true);
    setCurrentStep(null);
    setError(null);
    setResults(null);
    
    try {
      const response = await fetch('/api/xero/validate-deals', {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (!reader) {
        throw new Error('No response body');
      }
      
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        // Decode with stream option to handle partial UTF-8 sequences
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        
        // Process complete lines
        const lines = buffer.split('\n');
        
        // Keep the last incomplete line in the buffer
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim() === '') continue; // Skip empty lines
          
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.slice(6).trim();
              if (!jsonStr) continue; // Skip empty data
              
              const data = JSON.parse(jsonStr);
              
              if (data.type === 'progress') {
                setCurrentStep(data.step);
              } else if (data.type === 'error') {
                setError(data.message);
                if (data.details) {
                  console.error('Validation error details:', data.details);
                }
              } else if (data.type === 'complete') {
                setResults(data.data);
                setCurrentStep(null);
                // Extract tenant ID from the session data if available
                if (data.data?.session?.tenantId) {
                  setTenantId(data.data.session.tenantId);
                }
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e, 'Line:', line);
            }
          }
        }
      }
      
      // Process any remaining buffered data
      if (buffer.trim() && buffer.startsWith('data: ')) {
        try {
          const jsonStr = buffer.slice(6).trim();
          if (jsonStr) {
            const data = JSON.parse(jsonStr);
            if (data.type === 'complete') {
              setResults(data.data);
              setCurrentStep(null);
            }
          }
        } catch (e) {
          console.error('Failed to parse final SSE data:', e);
        }
      }
    } catch (err) {
      console.error('Validation error:', err);
      setError(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setIsValidating(false);
    }
  };
  
  /**
   * Prepares fix confirmation data from validation results for the confirmation dialog
   * 
   * @description Transforms validation results into structured confirmation data suitable
   * for the fix confirmation dialog. Automatically categorizes issues by type, calculates
   * statistics, and sets all issues as selected by default. Returns null if no fixable
   * issues are available.
   * 
   * @function fixConfirmationData
   * @returns {FixConfirmationData | null} Structured confirmation data or null if no issues
   * 
   * @example
   * ```typescript
   * // Automatically computed when validation results change
   * if (fixConfirmationData && fixConfirmationData.totalCount > 0) {
   *   // Show fix button and enable fix operations
   *   setShowFixButton(true);
   * }
   * ```
   * 
   * @since 1.0.0
   */
  const fixConfirmationData = useMemo<FixConfirmationData | null>(() => {
    if (!results?.results?.issues || results.results.issues.length === 0) {
      return null;
    }
    
    // Filter out issues that cannot be automatically fixed
    const fixableIssues = results.results.issues.filter(issue => 
      issue.code !== 'REQUIRED_FIELD_MISSING' // Cannot auto-fix missing required fields
    );
    
    if (fixableIssues.length === 0) {
      return null;
    }
    
    // Transform validation issues into fix-ready format with categorization
    const issues: FixValidationIssue[] = fixableIssues.map(issue => ({
      ...issue,
      selected: true, // All issues selected for fixing by default
      category: 
        issue.code === 'INVALID_TITLE_FORMAT' ? 'title' :
        issue.code === 'WON_DEAL_IN_UNQUALIFIED_PIPELINE' || issue.code === 'OPEN_DEAL_IN_WRONG_PIPELINE' ? 'pipeline' :
        issue.code === 'ORPHANED_ACCEPTED_QUOTE' || issue.code === 'ACCEPTED_QUOTE_INVALID_FORMAT' || issue.code === 'QUOTE_REFERENCES_MISSING_DEAL' ? 'quote' :
        'other'
    }));
    
    // Group issues by category for organized display in confirmation dialog
    const issuesByCategory = {
      title: issues.filter(i => i.category === 'title'),
      pipeline: issues.filter(i => i.category === 'pipeline'),
      quote: issues.filter(i => i.category === 'quote'),
      other: issues.filter(i => i.category === 'other')
    };
    
    // Return complete confirmation data structure
    return {
      issues,
      tenantId,
      issuesByCategory,
      totalCount: issues.length,
      errorCount: issues.filter(i => i.severity === 'error').length,
      warningCount: issues.filter(i => i.severity === 'warning').length
    };
  }, [results, tenantId]);
  
  /**
   * Handles user confirmation to start the fix operation
   * 
   * @description Processes user confirmation from the fix confirmation dialog.
   * Closes the confirmation dialog, opens the progress modal, and initiates
   * the fix operation using the fix session hook with the selected configuration.
   * 
   * @async
   * @function handleFixConfirm
   * @returns {Promise<void>} Promise that resolves when fix operation starts
   * 
   * @example
   * ```typescript
   * // Called when user clicks "Apply Fixes" in confirmation dialog
   * <FixConfirmationDialog
   *   onConfirm={handleFixConfirm}
   *   // ... other props
   * />
   * ```
   * 
   * @since 1.0.0
   */
  const handleFixConfirm = async () => {
    if (!fixConfirmationData) return;
    
    // Close confirmation dialog and show progress modal
    setShowFixConfirmation(false);
    setShowFixProgress(true);
    
    // Start fix operation without dry run
    await fixSession.startFix(
      tenantId,
      fixConfirmationData.issues,
      { enableDryRun: false }
    );
  };
  
  /**
   * Handles exporting validation issues to Excel format with automatic file download
   * 
   * @description Sends validation issues data to the Excel export API endpoint and
   * initiates automatic file download. Manages loading states, error handling, and
   * blob conversion for client-side file download. Creates a comprehensive Excel
   * workbook with multiple worksheets containing categorized validation issues.
   * 
   * The function performs the following operations:
   * 1. Validates that validation results contain exportable issues
   * 2. Sets loading state to provide user feedback
   * 3. Sends POST request to export API with validation data
   * 4. Converts response to downloadable blob
   * 5. Creates temporary download link and triggers file download
   * 6. Cleans up temporary resources and handles any errors
   * 
   * @async
   * @function handleExportToExcel
   * @returns {Promise<void>} Promise that resolves when export completes or fails
   * 
   * @throws Will set error state if API request fails or blob conversion fails
   * 
   * @example
   * ```typescript
   * // Called when user clicks "Export to Excel" button
   * await handleExportToExcel();
   * 
   * // Function handles all aspects of file download automatically:
   * // - API communication
   * // - Blob conversion
   * // - File download triggering
   * // - Error handling and user feedback
   * ```
   * 
   * @example
   * ```typescript
   * // Usage in JSX button handler
   * <button
   *   onClick={handleExportToExcel}
   *   disabled={isExporting || !results?.results?.issues?.length}
   * >
   *   {isExporting ? 'Exporting...' : 'Export to Excel'}
   * </button>
   * ```
   * 
   * @since 1.0.0 - Added Excel export functionality for validation issues
   */
  const handleExportToExcel = async () => {
    // Early return if no validation issues are available for export
    if (!results?.results?.issues || results.results.issues.length === 0) return;
    
    setIsExporting(true);
    try {
      // Send validation data to Excel export API endpoint
      const response = await fetch('/api/export/validation-issues-excel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          issues: results.results.issues,
          tenantName: results.session?.tenantName || 'Unknown',
          timestamp: results.results.summary?.timestamp
        }),
      });
      
      // Handle API errors by parsing error response
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to export to Excel');
      }
      
      // Convert API response to binary blob for file download
      const blob = await response.blob();
      
      // Create temporary download link using object URL
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `validation-issues-${new Date().toISOString().split('T')[0]}.xlsx`;
      
      // Trigger file download by programmatically clicking the link
      document.body.appendChild(a);
      a.click();
      
      // Clean up temporary resources to prevent memory leaks
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Export error:', err);
      setError(err instanceof Error ? err.message : 'Failed to export to Excel');
    } finally {
      setIsExporting(false);
    }
  };
  
  /**
   * Groups validation issues by deal for cleaner UI display
   * 
   * @returns {Map<string, any[]>} Map of deal ID to array of issues for that deal
   */
  const issuesByDeal = useMemo(() => {
    if (!results?.results?.issues) return new Map();
    
    const dealMap = new Map<string, any[]>();
    
    results.results.issues.forEach(issue => {
      const dealId = issue.dealId || issue.metadata?.dealId || 'no-deal';
      const dealKey = `${dealId}-${issue.dealTitle || issue.metadata?.dealTitle || 'Unknown'}`;
      
      if (!dealMap.has(dealKey)) {
        dealMap.set(dealKey, []);
      }
      dealMap.get(dealKey)!.push(issue);
    });
    
    return dealMap;
  }, [results]);
  
  /**
   * Counts unique deals with issues for each severity level
   * 
   * @returns {Object} Object with error/warning/info counts by unique deals
   */
  const dealCounts = useMemo(() => {
    const counts = { errors: 0, warnings: 0, info: 0 };
    
    issuesByDeal.forEach((issues) => {
      const hasError = issues.some((i: any) => i.severity === 'error');
      const hasWarning = issues.some((i: any) => i.severity === 'warning');
      const hasInfo = issues.some((i: any) => i.severity === 'info');
      
      if (hasError) counts.errors++;
      else if (hasWarning) counts.warnings++;
      else if (hasInfo) counts.info++;
    });
    
    return counts;
  }, [issuesByDeal]);
  
  /**
   * Returns appropriate icon component based on validation step status
   * 
   * @param {string} status - The current status of the validation step
   * @returns {JSX.Element} Icon component representing the step status
   */
  const getStepIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircleIcon className="h-4 w-4 text-red-500" />;
      case 'running':
        return (
          <svg className="h-4 w-4 animate-spin text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        );
      default:
        return <div className="h-4 w-4 rounded-full border-2 border-gray-300" />;
    }
  };
  
  /**
   * Returns appropriate icon component based on validation issue severity
   * 
   * @param {string} severity - The severity level of the validation issue ('error', 'warning', 'info')
   * @returns {JSX.Element | null} Icon component representing the issue severity or null for unknown types
   */
  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error':
        return <XCircleIcon className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <ExclamationTriangleIcon className="h-4 w-4 text-yellow-500" />;
      case 'info':
        return <InformationCircleIcon className="h-4 w-4 text-blue-500" />;
      default:
        return null;
    }
  };
  
  return (
    <div className="space-y-6">
      {/* First row: Validate and Show Details buttons */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
        <button
          onClick={startValidation}
          disabled={isValidating}
          className="flex-1 inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
          style={{
            backgroundColor: isValidating ? 'oklch(21.6% 0.006 56.043)' : 'oklch(27.4% 0.006 286.033)'
          }}
          onMouseEnter={(e) => {
            if (!isValidating) e.currentTarget.style.backgroundColor = 'oklch(21.6% 0.006 56.043)';
          }}
          onMouseLeave={(e) => {
            if (!isValidating) e.currentTarget.style.backgroundColor = 'oklch(27.4% 0.006 286.033)';
          }}
          aria-label={isValidating ? 'Validation in progress' : 'Start Pipedrive deals validation'}
        >
          {isValidating ? (
            <>
              <div className="h-5 w-5 rounded-full border-2 border-blue-200 border-t-blue-500 animate-spin mr-2" aria-hidden="true" />
              <span>Validating...</span>
            </>
          ) : (
            <>
              <PlayIcon className="h-5 w-5 mr-2" aria-hidden="true" />
              <span>Validate Pipedrive Deals</span>
            </>
          )}
        </button>
        
        {results && (
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex-1 sm:flex-initial sm:min-w-32 inline-flex items-center justify-center px-4 py-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors duration-200"
            aria-expanded={showDetails}
            aria-label={`${showDetails ? 'Hide' : 'Show'} validation details`}
          >
            {showDetails ? 'Hide' : 'Show'} Details
          </button>
        )}
      </div>
      
      {/* Second row: Fix Issues and Export to Excel buttons */}
      {results && ((fixConfirmationData && fixConfirmationData.totalCount > 0) || (results?.results?.issues && results.results.issues.length > 0)) && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
          {/* Fix Issues Button - only show if there are fixable issues */}
          {fixConfirmationData && fixConfirmationData.totalCount > 0 && (
            <button
              onClick={() => setShowFixConfirmation(true)}
              className="flex-1 inline-flex items-center justify-center px-4 py-3 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors duration-200"
              style={{
                backgroundColor: 'oklch(27.4% 0.006 286.033)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'oklch(21.6% 0.006 56.043)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'oklch(27.4% 0.006 286.033)';
              }}
              aria-label="Fix validation issues"
            >
              <WrenchScrewdriverIcon className="h-5 w-5 mr-2" aria-hidden="true" />
              <span>Fix {fixConfirmationData.totalCount} {fixConfirmationData.totalCount === 1 ? 'Issue' : 'Issues'}</span>
            </button>
          )}
          
          {/* Export to Excel Button - only show if there are validation issues */}
          {results?.results?.issues && results.results.issues.length > 0 && (
            <button
              onClick={handleExportToExcel}
              disabled={isExporting}
              className="flex-1 inline-flex items-center justify-center px-4 py-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Export validation issues to Excel"
            >
              {isExporting ? (
                <>
                  <div className="h-5 w-5 rounded-full border-2 border-blue-200 border-t-blue-500 animate-spin mr-2" aria-hidden="true" />
                  <span>Exporting...</span>
                </>
              ) : (
                <>
                  <DocumentArrowDownIcon className="h-5 w-5 mr-2" aria-hidden="true" />
                  <span>Export to Excel</span>
                </>
              )}
            </button>
          )}
        </div>
      )}
      
      {/* Current Step Progress */}
      {currentStep && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-200">
          <div className="p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="flex-shrink-0 mt-0.5">
                {getStepIcon(currentStep.status)}
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-gray-900">{currentStep.name}</h3>
                <p className="text-sm text-gray-600 mt-1">{currentStep.description}</p>
                {currentStep.progress !== undefined && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                      <span>Progress</span>
                      <span>{currentStep.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${currentStep.progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Simple loading state when validating but no current step */}
      {isValidating && !currentStep && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-5 w-5 rounded-full border-2 border-blue-200 border-t-blue-500 animate-spin" />
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Initializing Validation</h3>
                <p className="text-sm text-gray-600 mt-1">Connecting to services and preparing validation workflow...</p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      
      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-center">
            <XCircleIcon className="h-5 w-5 text-red-600 mr-2" />
            <span className="text-sm text-red-700">{error}</span>
          </div>
        </div>
      )}
      
      {/* Results Summary */}
      {results?.results && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-200">
            <div className="p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Pipedrive Validation Summary</h3>
            
              {/* Main Statistics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div className="bg-gray-50 rounded-lg p-4 text-center border border-gray-100">
                  <div className="text-2xl font-bold text-gray-900">{results.results.totalDeals || 0}</div>
                  <div className="text-xs text-gray-600 mt-1">Total Deals Validated</div>
                </div>
                <div className={`rounded-lg p-4 text-center border ${
                  dealCounts.errors > 0 
                    ? 'bg-red-50 border-red-200' 
                    : 'bg-green-50 border-green-200'
                }`}>
                  <div className={`text-2xl font-bold ${
                    dealCounts.errors > 0 ? 'text-red-900' : 'text-green-900'
                  }`}>
                    {dealCounts.errors || 0}
                  </div>
                  <div className={`text-xs mt-1 ${
                    dealCounts.errors > 0 ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {dealCounts.errors === 1 ? 'Deal with Errors' : 'Deals with Errors'}
                  </div>
                </div>
                <div className={`rounded-lg p-4 text-center border ${
                  dealCounts.warnings > 0 
                    ? 'bg-amber-50 border-amber-200' 
                    : 'bg-gray-50 border-gray-100'
                }`}>
                  <div className={`text-2xl font-bold ${
                    dealCounts.warnings > 0 ? 'text-amber-900' : 'text-gray-900'
                  }`}>
                    {dealCounts.warnings || 0}
                  </div>
                  <div className={`text-xs mt-1 ${
                    dealCounts.warnings > 0 ? 'text-amber-600' : 'text-gray-600'
                  }`}>
                    {dealCounts.warnings === 1 ? 'Deal with Warnings' : 'Deals with Warnings'}
                  </div>
                </div>
              </div>
              
              {/* Validation Status Message */}
              {results.results.summary && (
                <div className={`p-4 rounded-lg border ${
                  results.results.issues?.length > 0
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-green-50 border-green-200'
                }`}>
                  <div className="flex items-center">
                    {results.results.issues?.length > 0 ? (
                      <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 mr-2" />
                    ) : (
                      <CheckCircleIcon className="h-5 w-5 text-green-600 mr-2" />
                    )}
                    <div>
                      <div className={`font-semibold ${
                        results.results.issues?.length > 0 ? 'text-amber-900' : 'text-green-900'
                      }`}>
                        {results.results.summary.message}
                      </div>
                      <div className={`text-xs mt-1 ${
                        results.results.issues?.length > 0 ? 'text-amber-600' : 'text-green-600'
                      }`}>
                        Validated at {new Date(results.results.summary.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Pipeline Rules Applied */}
              <div className="border-t pt-4 mt-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Validation Rules Applied</h4>
                <div className="space-y-2">
                  <div className="flex items-start">
                    <CheckCircleIcon className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    <div className="text-sm text-gray-600">
                      No won deals allowed in Pipeline 1 (Unqualified)
                    </div>
                  </div>
                  <div className="flex items-start">
                    <CheckCircleIcon className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    <div className="text-sm text-gray-600">
                      No open deals allowed in Pipelines 3, 4, 5, 6, 7, 8, 9, 16, 11, 17 (must be won/lost)
                    </div>
                  </div>
                  <div className="flex items-start">
                    <InformationCircleIcon className="h-4 w-4 text-blue-500 mt-0.5 mr-2 flex-shrink-0" />
                    <div className="text-sm text-gray-600">
                      Pipelines 12 and 13 are excluded from validation
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Quick Stats if there are issues */}
              {results.results.issues?.length > 0 && (
                <div className="border-t pt-4 mt-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Issue Breakdown</h4>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    {results.results.issues.filter(i => i.code === 'WON_DEAL_IN_UNQUALIFIED_PIPELINE').length > 0 && (
                      <div className="bg-red-50 rounded-lg p-3 border border-red-200">
                        <div className="text-lg font-bold text-red-900">
                          {results.results.issues.filter(i => i.code === 'WON_DEAL_IN_UNQUALIFIED_PIPELINE').length}
                        </div>
                        <div className="text-xs text-red-600">Won deals in unqualified pipeline</div>
                      </div>
                    )}
                    {results.results.issues.filter(i => i.code === 'OPEN_DEAL_IN_WRONG_PIPELINE').length > 0 && (
                      <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                        <div className="text-lg font-bold text-amber-900">
                          {results.results.issues.filter(i => i.code === 'OPEN_DEAL_IN_WRONG_PIPELINE').length}
                        </div>
                        <div className="text-xs text-amber-600">Open deals in closed-only pipelines</div>
                      </div>
                    )}
                    {results.results.issues.filter(i => i.code === 'INVALID_TITLE_FORMAT').length > 0 && (
                      <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-200">
                        <div className="text-lg font-bold text-yellow-900">
                          {results.results.issues.filter(i => i.code === 'INVALID_TITLE_FORMAT').length}
                        </div>
                        <div className="text-xs text-yellow-600">Invalid title format</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Issues Summary */}
          {results.results.issues?.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-200">
              <div className="p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">
                  Issues Found ({issuesByDeal.size} {issuesByDeal.size === 1 ? 'Deal' : 'Deals'})
                </h3>
              
                <div className="flex gap-4 mb-4">
                  {dealCounts.errors > 0 && (
                    <div className="flex items-center gap-2">
                      <XCircleIcon className="h-4 w-4 text-red-500" />
                      <span className="text-sm text-gray-900">
                        {dealCounts.errors} {dealCounts.errors === 1 ? 'Deal' : 'Deals'} with Errors
                      </span>
                    </div>
                  )}
                  {dealCounts.warnings > 0 && (
                    <div className="flex items-center gap-2">
                      <ExclamationTriangleIcon className="h-4 w-4 text-amber-500" />
                      <span className="text-sm text-gray-900">
                        {dealCounts.warnings} {dealCounts.warnings === 1 ? 'Deal' : 'Deals'} with Warnings
                      </span>
                    </div>
                  )}
                  {dealCounts.info > 0 && (
                    <div className="flex items-center gap-2">
                      <InformationCircleIcon className="h-4 w-4 text-blue-500" />
                      <span className="text-sm text-gray-900">
                        {dealCounts.info} {dealCounts.info === 1 ? 'Deal' : 'Deals'} with Info
                      </span>
                    </div>
                  )}
                </div>
                
                {/* Deal Titles Preview (shown when collapsed) */}
                {!showDetails && issuesByDeal.size > 0 && (
                  <div className="border-t border-gray-200 pt-3 mt-3">
                    <div className="space-y-1">
                      {Array.from(issuesByDeal.entries()).slice(0, 3).map(([dealKey, dealIssues]) => {
                        const [dealId, dealTitle] = dealKey.split('-');
                        const hasErrors = dealIssues.some((i: any) => i.severity === 'error');
                        const hasWarnings = dealIssues.some((i: any) => i.severity === 'warning');
                        
                        return (
                          <div key={dealKey} className="flex items-center gap-2 text-sm">
                            <div className="flex-shrink-0">
                              {hasErrors ? (
                                <XCircleIcon className="h-4 w-4 text-red-500" />
                              ) : hasWarnings ? (
                                <ExclamationTriangleIcon className="h-4 w-4 text-amber-500" />
                              ) : (
                                <InformationCircleIcon className="h-4 w-4 text-blue-500" />
                              )}
                            </div>
                            <span className="text-gray-700 truncate flex-1">
                              {dealTitle !== 'Unknown' ? dealTitle : `Deal ${dealId}`}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              hasErrors ? 'bg-red-100 text-red-700' : 
                              hasWarnings ? 'bg-amber-100 text-amber-700' : 
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {dealIssues.length}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              
                {/* Detailed Issues (shown when expanded) - Grouped by Deal */}
                {showDetails && (
                  <div className="space-y-4 max-h-96 overflow-y-auto border-t border-gray-200 pt-4">
                    {/* Issues Grouped by Deal */}
                    {Array.from(issuesByDeal.entries()).map(([dealKey, dealIssues]) => {
                      const [dealId, dealTitle] = dealKey.split('-');
                      const hasErrors = dealIssues.some((i: any) => i.severity === 'error');
                      const hasWarnings = dealIssues.some((i: any) => i.severity === 'warning');
                      
                      return (
                        <div key={dealKey} className="mb-4">
                          <div className={`rounded-lg border ${
                            hasErrors ? 'border-red-200 bg-red-50' : 
                            hasWarnings ? 'border-amber-200 bg-amber-50' : 
                            'border-blue-200 bg-blue-50'
                          }`}>
                            <div className="p-3 border-b border-gray-200 bg-white bg-opacity-50">
                              <div className="flex items-center justify-between">
                                <div>
                                  <h4 className="text-sm font-semibold text-gray-900">
                                    {dealTitle !== 'Unknown' ? dealTitle : `Deal ${dealId}`}
                                  </h4>
                                  {dealId !== 'no-deal' && (
                                    <span className="text-xs text-gray-500">ID: {dealId}</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                    hasErrors ? 'bg-red-100 text-red-700' : 
                                    hasWarnings ? 'bg-amber-100 text-amber-700' : 
                                    'bg-blue-100 text-blue-700'
                                  }`}>
                                    {dealIssues.length} {dealIssues.length === 1 ? 'Issue' : 'Issues'}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="p-3 space-y-2">
                              {dealIssues.map((issue: any, issueIndex: number) => (
                                <div key={`${dealKey}-issue-${issueIndex}`} className="flex gap-3 text-sm">
                                  <div className="flex-shrink-0 mt-0.5">
                                    {getSeverityIcon(issue.severity)}
                                  </div>
                                  <div className="flex-1">
                                    <div className="font-medium text-gray-900">
                                      {issue.message}
                                    </div>
                                    {issue.suggestedFix && (
                                      <div className="text-xs text-green-700 mt-1">
                                        Suggestion: {issue.suggestedFix}
                                      </div>
                                    )}
                                    {issue.metadata && (
                                      <div className="text-xs text-gray-600 mt-1">
                                        {issue.metadata.projectCode && (
                                          <span>Project: {issue.metadata.projectCode} | </span>
                                        )}
                                        {issue.metadata.vesselName && (
                                          <span>Vessel: {issue.metadata.vesselName}</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    
                    {/* Orphaned Accepted Quotes Section (no deal associated) */}
                    {results.results.issues.filter(issue => issue.code === 'ORPHANED_ACCEPTED_QUOTE' && !issue.dealId && !issue.metadata?.dealId).length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Orphaned Accepted Quotes (No Deal Link)</h4>
                        <div className="space-y-2">
                          {results.results.issues
                            .filter(issue => issue.code === 'ORPHANED_ACCEPTED_QUOTE' && !issue.dealId && !issue.metadata?.dealId)
                            .map((issue, i) => (
                              <div key={`orphaned-${i}`} className="flex gap-3 p-3 bg-yellow-50 rounded-lg text-sm border border-yellow-200">
                                <div className="flex-shrink-0 mt-0.5">
                                  <ExclamationTriangleIcon className="h-4 w-4 text-yellow-500" />
                                </div>
                                <div className="flex-1">
                                  <div className="font-medium text-gray-900">
                                    {issue.metadata?.quoteNumber || 'Unknown Quote'}
                                    {issue.metadata?.contactName && (
                                      <span className="text-gray-600"> - {issue.metadata.contactName}</span>
                                    )}
                                  </div>
                                  {issue.metadata?.quoteTotal && (
                                    <div className="text-xs text-gray-700 mt-1">
                                      Value: SGD {issue.metadata.quoteTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                  )}
                                  {issue.metadata?.reference && (
                                    <div className="text-xs text-gray-600 mt-1">
                                      Reference: {issue.metadata.reference}
                                    </div>
                                  )}
                                  <div className="text-xs text-yellow-700 mt-1">
                                    {issue.suggestedFix}
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
                {/* Show More Message */}
                {!showDetails && issuesByDeal.size > 3 && (
                  <div className="text-center text-sm text-gray-500 py-2 border-t border-gray-200 mt-3">
                    ... and {issuesByDeal.size - 3} more {issuesByDeal.size - 3 === 1 ? 'deal' : 'deals'}. Click "Show Details" to view all.
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Success Message */}
          {results.results.issues?.length === 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="flex items-center">
                <CheckCircleIcon className="h-5 w-5 text-green-600 mr-2" />
                <span className="text-sm text-green-700">
                  All deals validated successfully! No issues found.
                </span>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Fix Confirmation Dialog */}
      <FixConfirmationDialog
        isOpen={showFixConfirmation}
        data={fixConfirmationData}
        onConfirm={handleFixConfirm}
        onCancel={() => setShowFixConfirmation(false)}
        isDryRun={isDryRun}
        onToggleDryRun={setIsDryRun}
      />
      
      {/* Fix Progress Modal */}
      <FixProgressModal
        isOpen={showFixProgress}
        state={fixSession}
        onClose={() => {
          setShowFixProgress(false);
          fixSession.reset();
          // If fixes were successfully applied, refresh validation
          if (fixSession.results && fixSession.results.fixedCount > 0) {
            startValidation();
          }
        }}
        onCancel={fixSession.cancel}
      />
    </div>
  );
}