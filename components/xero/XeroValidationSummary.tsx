/**
 * @fileoverview Xero Validation Summary React Component - Interactive interface for quote validation
 * 
 * This component provides a comprehensive user interface for initiating and monitoring Xero quote
 * validation workflows. It features real-time progress tracking via Server-Sent Events (SSE),
 * detailed validation results display, and Excel export functionality.
 * 
 * The component integrates with the XeroValidationOrchestrator to provide:
 * - Real-time validation progress updates
 * - Quote format validation results
 * - Line item tracking validation
 * - Expandable issue details view
 * - Color-coded severity indicators
 * - Export to Excel functionality
 * 
 * @module XeroValidationSummary
 * @since 1.0.0
 * @author CustomXero Team
 */

'use client';

import React, { useState, useMemo } from 'react';
import { logger } from '@/lib/logger';
import {
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  PlayIcon,
  DocumentArrowDownIcon
} from '@heroicons/react/24/outline';
import { XeroValidationIssue, XeroValidationSession } from '@/lib/types/validation';

/**
 * Represents a validation step for UI progress tracking.
 * Mirrors the ValidationStep interface from the orchestrator for consistent progress updates.
 * 
 * @interface ValidationStep
 * @since 1.0.0
 */
interface ValidationStep {
  /** Unique identifier for the validation step */
  id: string;
  /** Human-readable name of the validation step */
  name: string;
  /** Detailed description of what the step does */
  description: string;
  /** Current execution status of the step */
  status: 'pending' | 'running' | 'completed' | 'error' | 'skipped';
  /** Progress percentage (0-100) for the current step */
  progress?: number;
  /** Results data from completed step */
  result?: any;
  /** Error message if step failed */
  error?: string;
}

/**
 * Complete validation results structure returned from the API.
 * Contains both the detailed session data and summarized statistics.
 * 
 * @interface ValidationResults
 * @since 1.0.0
 */
interface ValidationResults {
  /** The complete validation session with all issues and metadata */
  session: XeroValidationSession;
  /** Summarized statistics for quick overview */
  summary: {
    /** Total number of accepted quotes retrieved from Xero */
    totalQuotes: number;
    /** Number of quotes successfully processed during validation */
    quotesProcessed: number;
    /** Total number of validation issues found */
    issuesFound: number;
    /** Number of error-level issues */
    errorCount: number;
    /** Number of warning-level issues */
    warningCount: number;
  };
}

/**
 * Interactive React component for initiating and monitoring Xero quote validation workflows.
 * 
 * This component provides a comprehensive user interface for Xero quote validation with the following features:
 * 
 * **Core Functionality:**
 * - Initiates validation workflows via `/api/xero/validate-quotes` endpoint
 * - Real-time progress tracking through Server-Sent Events (SSE)
 * - Displays comprehensive validation results with issue categorization
 * - Exports validation results to Excel format
 * 
 * **Validation Coverage:**
 * - Quote number format validation (ProjectCode-QuoteNumber pattern)
 * - Line item tracking options validation
 * - Project code format compliance
 * 
 * **User Experience:**
 * - Loading states with animated spinners
 * - Color-coded severity indicators (error/warning/info)
 * - Expandable details view for individual quote issues
 * - Responsive design with mobile-friendly layout
 * - Error handling with user-friendly messages
 * 
 * **State Management:**
 * The component manages several state variables:
 * - `isValidating`: Controls validation workflow execution
 * - `currentStep`: Tracks real-time progress updates
 * - `results`: Stores complete validation results
 * - `showDetails`: Controls expandable issue details view
 * - `isExporting`: Controls Excel export process
 * 
 * @component
 * @returns {JSX.Element} The complete Xero validation interface
 * @since 1.0.0
 * @example
 * ```tsx
 * // Basic usage in a dashboard or admin panel
 * import { XeroValidationSummary } from '@/components/xero/XeroValidationSummary';
 * 
 * function AdminDashboard() {
 *   return (
 *     <div className="dashboard-section">
 *       <h2>Xero Quote Validation</h2>
 *       <XeroValidationSummary />
 *     </div>
 *   );
 * }
 * ```
 */
export function XeroValidationSummary() {
  const [isValidating, setIsValidating] = useState(false);
  const [currentStep, setCurrentStep] = useState<ValidationStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ValidationResults | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  /**
   * Initiates the Xero quote validation workflow with real-time progress tracking.
   * 
   * This function establishes a Server-Sent Events (SSE) connection to the validation API
   * endpoint and processes streaming responses in real-time. It handles three types of SSE events:
   * - `progress`: Updates current validation step and progress percentage
   * - `error`: Displays validation errors with optional stack traces
   * - `complete`: Receives final validation results and summary statistics
   * 
   * The function implements proper SSE parsing with buffered line processing to handle
   * incomplete messages and ensures robust error handling throughout the validation process.
   * 
   * @async
   * @function startValidation
   * @returns {Promise<void>} Resolves when validation workflow completes or fails
   * @throws {Error} Network errors, API failures, or SSE parsing issues
   * @since 1.0.0
   */
  const startValidation = async () => {
    setIsValidating(true);
    setCurrentStep(null);
    setError(null);
    setResults(null);
    
    try {
      const response = await fetch('/api/xero/validate-quotes', {
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
        
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim() === '') continue;
          
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.slice(6).trim();
              if (!jsonStr) continue;
              
              const data = JSON.parse(jsonStr);
              
              if (data.type === 'progress') {
                setCurrentStep(data.step);
              } else if (data.type === 'error') {
                setError(data.message);
                if (data.details) {
                  logger.error('Validation error details', { details: data.details });
                }
              } else if (data.type === 'complete') {
                setResults(data.data);
                setCurrentStep(null);
              }
            } catch (e) {
              logger.error('Failed to parse SSE data', { error: e, line });
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
          logger.error('Failed to parse final SSE data', { error: e });
        }
      }
    } catch (err) {
      logger.error('Validation error', { error: err });
      setError(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setIsValidating(false);
    }
  };

  /**
   * Exports the current validation results to an Excel file.
   * 
   * This function sends validation issues to the Excel export API endpoint and handles
   * the binary response to trigger a file download. The exported Excel file contains:
   * - Summary sheet with validation statistics
   * - All issues sheet with detailed problem descriptions
   * - Separate sheets for format and tracking issues (when applicable)
   * 
   * The function manages the export state to show loading indicators and handles
   * errors gracefully by displaying user-friendly error messages.
   * 
   * @async
   * @function handleExportToExcel
   * @returns {Promise<void>} Resolves when export completes or fails
   * @throws {Error} If export API fails or validation results are missing
   * @since 1.0.0
   * @example
   * ```typescript
   * // Export is automatically available when validation results contain issues
   * // Users click the "Export to Excel" button to trigger this function
   * ```
   */
  const handleExportToExcel = async () => {
    if (!results?.session?.issues || results.session.issues.length === 0) return;
    
    setIsExporting(true);
    try {
      const response = await fetch('/api/export/xero-validation-excel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          issues: results.session.issues,
          tenantId: results.session.tenantId,
          timestamp: results.session.startTime
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to export to Excel');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `xero-validation-${new Date().toISOString().split('T')[0]}.xlsx`;
      
      document.body.appendChild(a);
      a.click();
      
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      logger.error('Export error', { error: err });
      setError(err instanceof Error ? err.message : 'Failed to export to Excel');
    } finally {
      setIsExporting(false);
    }
  };

  /**
   * Memoized computation that groups validation issues by severity level.
   * 
   * This computation categorizes all validation issues into three severity groups:
   * - `errors`: Critical issues that must be addressed
   * - `warnings`: Important issues that should be addressed
   * - `info`: Informational issues for awareness
   * 
   * The memoization ensures this computation only runs when validation results change,
   * optimizing performance for large numbers of validation issues.
   * 
   * @type {Object} Object with arrays of issues grouped by severity
   * @since 1.0.0
   */
  const issuesBySeverity = useMemo(() => {
    if (!results?.session?.issues) return { errors: [], warnings: [], info: [] };
    
    return {
      errors: results.session.issues.filter(i => i.severity === 'error'),
      warnings: results.session.issues.filter(i => i.severity === 'warning'),
      info: results.session.issues.filter(i => i.severity === 'info')
    };
  }, [results]);

  /**
   * Memoized computation that groups validation issues by individual quotes.
   * 
   * This computation creates a Map where each key represents a unique quote
   * (combining quote number and ID) and the value is an array of all issues
   * found for that specific quote. This grouping enables the UI to display
   * all issues for each quote together in an organized manner.
   * 
   * The memoization optimizes performance when dealing with large numbers of
   * quotes and issues by only recalculating when validation results change.
   * 
   * @type {Map<string, XeroValidationIssue[]>} Map of quote keys to their issues
   * @since 1.0.0
   */
  const issuesByQuote = useMemo(() => {
    if (!results?.session?.issues) return new Map();
    
    const quoteMap = new Map<string, XeroValidationIssue[]>();
    
    results.session.issues.forEach(issue => {
      const quoteKey = `${issue.quoteNumber}-${issue.quoteId}`;
      
      if (!quoteMap.has(quoteKey)) {
        quoteMap.set(quoteKey, []);
      }
      quoteMap.get(quoteKey)!.push(issue);
    });
    
    return quoteMap;
  }, [results]);

  /**
   * Returns the appropriate icon component for a validation step status.
   * 
   * This utility function maps validation step statuses to their corresponding
   * visual indicators:
   * - `completed`: Green checkmark icon
   * - `error`: Red X icon
   * - `running`: Animated blue spinner
   * - `pending` or other: Gray circle outline
   * 
   * @param {string} status - The current status of the validation step
   * @returns {JSX.Element} The appropriate icon component
   * @since 1.0.0
   */
  const getStepIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircleIcon className="h-4 w-4 text-red-500" />;
      case 'running':
        return <div className="h-4 w-4 rounded-full border-2 border-blue-200 border-t-blue-500 animate-spin" />;
      default:
        return <div className="h-4 w-4 rounded-full border-2 border-gray-300" />;
    }
  };

  /**
   * Returns the appropriate icon component for a validation issue severity level.
   * 
   * This utility function maps issue severity levels to their corresponding
   * visual indicators:
   * - `error`: Red X circle icon
   * - `warning`: Yellow triangle with exclamation icon
   * - `info`: Blue information circle icon
   * - Unknown severity: Returns null
   * 
   * @param {string} severity - The severity level of the validation issue
   * @returns {JSX.Element|null} The appropriate icon component or null
   * @since 1.0.0
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
      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
        <button
          onClick={startValidation}
          disabled={isValidating}
          className="flex-1 inline-flex items-center justify-center px-4 py-3 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
          style={{
            backgroundColor: isValidating ? 'oklch(21.6% 0.006 56.043)' : 'oklch(27.4% 0.006 286.033)'
          }}
          onMouseEnter={(e) => {
            if (!isValidating) e.currentTarget.style.backgroundColor = 'oklch(21.6% 0.006 56.043)';
          }}
          onMouseLeave={(e) => {
            if (!isValidating) e.currentTarget.style.backgroundColor = 'oklch(27.4% 0.006 286.033)';
          }}
        >
          {isValidating ? (
            <>
              <div className="h-5 w-5 rounded-full border-2 border-blue-200 border-t-blue-500 animate-spin mr-2" />
              <span>Validating...</span>
            </>
          ) : (
            <>
              <PlayIcon className="h-5 w-5 mr-2" />
              <span>Validate Xero Quotes</span>
            </>
          )}
        </button>
        
        {results && (
          <>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center px-4 py-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors duration-200"
            >
              {showDetails ? 'Hide' : 'Show'} Details
            </button>
            
            {results.session.issues.length > 0 && (
              <button
                onClick={handleExportToExcel}
                disabled={isExporting}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center px-4 py-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                {isExporting ? (
                  <>
                    <div className="h-5 w-5 rounded-full border-2 border-blue-200 border-t-blue-500 animate-spin mr-2" />
                    <span>Exporting...</span>
                  </>
                ) : (
                  <>
                    <DocumentArrowDownIcon className="h-5 w-5 mr-2" />
                    <span>Export to Excel</span>
                  </>
                )}
              </button>
            )}
          </>
        )}
      </div>

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

      {/* Loading state */}
      {isValidating && !currentStep && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-5 w-5 rounded-full border-2 border-blue-200 border-t-blue-500 animate-spin" />
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Initializing Validation</h3>
                <p className="text-sm text-gray-600 mt-1">Connecting to Xero and preparing validation workflow...</p>
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
      {results && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-200">
            <div className="p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Xero Validation Summary</h3>
              
              {/* Main Statistics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div className="bg-gray-50 rounded-lg p-4 text-center border border-gray-100">
                  <div className="text-2xl font-bold text-gray-900">{results.summary.totalQuotes}</div>
                  <div className="text-xs text-gray-600 mt-1">Accepted Quotes</div>
                </div>
                <div className={`rounded-lg p-4 text-center border ${
                  results.summary.warningCount > 0 
                    ? 'bg-amber-50 border-amber-200' 
                    : 'bg-green-50 border-green-200'
                }`}>
                  <div className={`text-2xl font-bold ${
                    results.summary.warningCount > 0 ? 'text-amber-900' : 'text-green-900'
                  }`}>
                    {results.summary.warningCount}
                  </div>
                  <div className={`text-xs mt-1 ${
                    results.summary.warningCount > 0 ? 'text-amber-600' : 'text-green-600'
                  }`}>
                    Format Issues
                  </div>
                </div>
                <div className={`rounded-lg p-4 text-center border ${
                  results.session.issues.filter(i => i.code === 'MISSING_TRACKING_OPTIONS').length > 0 
                    ? 'bg-red-50 border-red-200' 
                    : 'bg-green-50 border-green-200'
                }`}>
                  <div className={`text-2xl font-bold ${
                    results.session.issues.filter(i => i.code === 'MISSING_TRACKING_OPTIONS').length > 0 ? 'text-red-900' : 'text-green-900'
                  }`}>
                    {results.session.issues.filter(i => i.code === 'MISSING_TRACKING_OPTIONS').length}
                  </div>
                  <div className={`text-xs mt-1 ${
                    results.session.issues.filter(i => i.code === 'MISSING_TRACKING_OPTIONS').length > 0 ? 'text-red-600' : 'text-green-600'
                  }`}>
                    Tracking Issues
                  </div>
                </div>
              </div>

              {/* Validation Status Message */}
              <div className={`p-4 rounded-lg border ${
                results.session.issues.length > 0
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-green-50 border-green-200'
              }`}>
                <div className="flex items-center">
                  {results.session.issues.length > 0 ? (
                    <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 mr-2" />
                  ) : (
                    <CheckCircleIcon className="h-5 w-5 text-green-600 mr-2" />
                  )}
                  <div>
                    <div className={`font-semibold ${
                      results.session.issues.length > 0 ? 'text-amber-900' : 'text-green-900'
                    }`}>
                      {results.session.issues.length > 0
                        ? `Found ${results.session.issues.length} validation issues`
                        : 'All quotes passed validation'}
                    </div>
                    <div className={`text-xs mt-1 ${
                      results.session.issues.length > 0 ? 'text-amber-600' : 'text-green-600'
                    }`}>
                      Validated at {new Date(results.session.startTime).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Issues Details */}
          {results.session.issues.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-200">
              <div className="p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">
                  Issues Found ({issuesByQuote.size} {issuesByQuote.size === 1 ? 'Quote' : 'Quotes'})
                </h3>

                {/* Issues Preview (shown when collapsed) */}
                {!showDetails && issuesByQuote.size > 0 && (
                  <div className="space-y-2">
                    {Array.from(issuesByQuote.entries()).slice(0, 3).map(([quoteKey, quoteIssues]) => {
                      const [quoteNumber] = quoteKey.split('-');
                      const hasWarnings = quoteIssues.some((i: XeroValidationIssue) => i.severity === 'warning');
                      const hasInfo = quoteIssues.some((i: XeroValidationIssue) => i.severity === 'info');
                      
                      return (
                        <div key={quoteKey} className="flex items-center gap-2 text-sm">
                          <div className="flex-shrink-0">
                            {hasWarnings ? (
                              <ExclamationTriangleIcon className="h-4 w-4 text-amber-500" />
                            ) : hasInfo ? (
                              <InformationCircleIcon className="h-4 w-4 text-blue-500" />
                            ) : (
                              <CheckCircleIcon className="h-4 w-4 text-green-500" />
                            )}
                          </div>
                          <span className="text-gray-700 truncate flex-1">
                            {quoteNumber}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            hasWarnings ? 'bg-amber-100 text-amber-700' : 
                            hasInfo ? 'bg-blue-100 text-blue-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {quoteIssues.length}
                          </span>
                        </div>
                      );
                    })}
                    
                    {issuesByQuote.size > 3 && (
                      <div className="text-center text-sm text-gray-500 py-2 border-t border-gray-200 mt-3">
                        ... and {issuesByQuote.size - 3} more {issuesByQuote.size - 3 === 1 ? 'quote' : 'quotes'}. Click "Show Details" to view all.
                      </div>
                    )}
                  </div>
                )}

                {/* Detailed Issues (shown when expanded) */}
                {showDetails && (
                  <div className="space-y-4 max-h-96 overflow-y-auto">
                    {Array.from(issuesByQuote.entries()).map(([quoteKey, quoteIssues]) => {
                      const [quoteNumber, quoteId] = quoteKey.split('-');
                      const hasWarnings = quoteIssues.some((i: XeroValidationIssue) => i.severity === 'warning');
                      const hasInfo = quoteIssues.some((i: XeroValidationIssue) => i.severity === 'info');
                      
                      return (
                        <div key={quoteKey} className="mb-4">
                          <div className={`rounded-lg border ${
                            hasWarnings ? 'border-amber-200 bg-amber-50' : 
                            hasInfo ? 'border-blue-200 bg-blue-50' :
                            'border-green-200 bg-green-50'
                          }`}>
                            <div className="p-3 border-b border-gray-200 bg-white bg-opacity-50">
                              <div className="flex items-center justify-between">
                                <div>
                                  <h4 className="text-sm font-semibold text-gray-900">
                                    Quote: {quoteNumber}
                                  </h4>
                                  {quoteIssues[0]?.metadata?.contactName && (
                                    <span className="text-xs text-gray-500">
                                      {quoteIssues[0].metadata.contactName}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {quoteIssues[0]?.metadata?.quoteTotal !== undefined && (
                                    <span className="text-xs text-gray-600">
                                      SGD {quoteIssues[0].metadata.quoteTotal.toLocaleString()}
                                    </span>
                                  )}
                                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                    hasWarnings ? 'bg-amber-100 text-amber-700' : 
                                    hasInfo ? 'bg-blue-100 text-blue-700' :
                                    'bg-green-100 text-green-700'
                                  }`}>
                                    {quoteIssues.length} {quoteIssues.length === 1 ? 'Issue' : 'Issues'}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="p-3 space-y-2">
                              {quoteIssues.map((issue: XeroValidationIssue, issueIndex: number) => (
                                <div key={`${quoteKey}-issue-${issueIndex}`} className="flex gap-3 text-sm">
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
                                        {issue.metadata.lineItemsWithoutTracking !== undefined && (
                                          <span>
                                            {issue.metadata.lineItemsWithoutTracking} of {issue.metadata.totalLineItems} line items need tracking
                                          </span>
                                        )}
                                        {issue.metadata.actualFormat && (
                                          <span>Current: {issue.metadata.actualFormat}</span>
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
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Success Message */}
          {results.session.issues.length === 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="flex items-center">
                <CheckCircleIcon className="h-5 w-5 text-green-600 mr-2" />
                <span className="text-sm text-green-700">
                  All accepted quotes validated successfully! No issues found.
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}