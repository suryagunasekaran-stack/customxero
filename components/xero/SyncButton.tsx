'use client';

import React, { useState } from 'react';
import {
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  PlayIcon
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleIconSolid } from '@heroicons/react/24/solid';
import { ValidationSummary, ValidationIssue } from '@/lib/types/validation';

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
    summary: ValidationSummary;
    issues: ValidationIssue[];
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
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ValidationResults | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  
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
    setLogs([]);
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
              } else if (data.type === 'log') {
                setLogs(prev => [...prev, data.message]);
              } else if (data.type === 'error') {
                setError(data.message);
                if (data.details) {
                  console.error('Validation error details:', data.details);
                }
              } else if (data.type === 'complete') {
                setResults(data.data);
                setCurrentStep(null);
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
      
      {/* Logs */}
      {logs.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-gray-100 border-b border-gray-200">
            <h4 className="text-xs font-semibold text-gray-700">Processing Log</h4>
          </div>
          <div className="p-3 max-h-32 overflow-y-auto">
            <div className="space-y-1">
              {logs.map((log, i) => (
                <div key={i} className="text-xs text-gray-600 font-mono leading-relaxed">
                  {log}
                </div>
              ))}
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
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Validation Summary</h3>
            
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div className="bg-gray-50 rounded-lg p-4 text-center border border-gray-100">
                  <div className="text-2xl font-bold text-gray-900">{results.results.summary.totalDeals}</div>
                  <div className="text-xs text-gray-600 mt-1">Total Deals</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center border border-gray-100">
                  <div className="text-2xl font-bold text-gray-900">{results.results.summary.totalQuotes}</div>
                  <div className="text-xs text-gray-600 mt-1">Total Quotes</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center border border-gray-100">
                  <div className="text-2xl font-bold text-gray-900">{results.results.summary.totalProjects}</div>
                  <div className="text-xs text-gray-600 mt-1">INPROGRESS Projects</div>
                </div>
              </div>
              
              {/* Quotes Breakdown by Status */}
              {results.results.summary.quotesByStatus && (
                <div className="border-t pt-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Quotes by Status</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-200">
                      <div className="text-lg font-bold text-gray-700">{results.results.summary.quotesByStatus.DRAFT}</div>
                      <div className="text-xs text-gray-600">Draft</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-200">
                      <div className="text-lg font-bold text-gray-700">{results.results.summary.quotesByStatus.SENT}</div>
                      <div className="text-xs text-gray-600">Sent</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-200">
                      <div className="text-lg font-bold text-gray-700">{results.results.summary.quotesByStatus.ACCEPTED}</div>
                      <div className="text-xs text-gray-600">Accepted</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-200">
                      <div className="text-lg font-bold text-gray-700">{results.results.summary.quotesByStatus.DECLINED}</div>
                      <div className="text-xs text-gray-600">Declined</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-200">
                      <div className="text-lg font-bold text-gray-700">{results.results.summary.quotesByStatus.INVOICED}</div>
                      <div className="text-xs text-gray-600">Invoiced</div>
                    </div>
                  </div>
                  
                  {/* Total Values */}
                  {(results.results.summary.totalQuoteInProgressValue || results.results.summary.totalPipedriveWorkInProgressValue) && (
                    <div className="mt-4 pt-3 border-t border-gray-200">
                      <h5 className="text-sm font-semibold text-gray-700 mb-2">Work in Progress Values</h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {results.results.summary.totalQuoteInProgressValue && (
                          <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-200">
                            <div className="text-lg font-bold text-gray-700">
                              {results.results.summary.quoteCurrency || 'SGD'} {results.results.summary.totalQuoteInProgressValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <div className="text-xs text-gray-600">Total Quote Value (In Progress)</div>
                          </div>
                        )}
                        {results.results.summary.totalPipedriveWorkInProgressValue && (
                          <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-200">
                            <div className="text-lg font-bold text-gray-700">
                              {results.results.summary.pipedriveCurrency || 'SGD'} {results.results.summary.totalPipedriveWorkInProgressValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <div className="text-xs text-gray-600">Total Pipedrive Value (Work in Progress)</div>
                          </div>
                        )}
                      </div>
                      
                      {/* Orphaned Accepted Quotes Info */}
                      {(results.results.summary.orphanedAcceptedQuotes ?? 0) > 0 && (
                        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <div className="flex items-start">
                            <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 mt-0.5 mr-2 flex-shrink-0" />
                            <div className="text-sm">
                              <div className="font-semibold text-yellow-800">
                                {results.results.summary.orphanedAcceptedQuotes ?? 0} Accepted Quote{(results.results.summary.orphanedAcceptedQuotes ?? 0) > 1 ? 's' : ''} Not in Pipedrive
                              </div>
                              {results.results.summary.orphanedAcceptedQuotesValue && (
                                <div className="text-yellow-700 mt-1">
                                  Value: {results.results.summary.quoteCurrency || 'SGD'} {results.results.summary.orphanedAcceptedQuotesValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                              )}
                              <div className="text-xs text-yellow-600 mt-1">
                                These accepted quotes are not linked to any Pipedrive deal, explaining the value discrepancy
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Invalid Quote Format Warning */}
                      {(results.results.summary.acceptedQuotesWithInvalidFormat ?? 0) > 0 && (
                        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <div className="flex items-start">
                            <XCircleIcon className="h-5 w-5 text-red-600 mt-0.5 mr-2 flex-shrink-0" />
                            <div className="text-sm">
                              <div className="font-semibold text-red-800">
                                {results.results.summary.acceptedQuotesWithInvalidFormat ?? 0} Accepted Quote{(results.results.summary.acceptedQuotesWithInvalidFormat ?? 0) > 1 ? 's' : ''} with Invalid Format
                              </div>
                              <div className="text-xs text-red-600 mt-1">
                                Accepted quotes must follow the format: PROJECTNUMBER-QUNUMBER-VERSION
                              </div>
                              <div className="text-xs text-red-500 mt-1">
                                Example: NY2594-QU22554-1 or NY2450-QU19757-1-v2
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          
          {/* Issues Summary */}
          {results.results.summary.totalIssues > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-200">
              <div className="p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Issues Found</h3>
              
                <div className="flex gap-4 mb-4">
                  {results.results.summary.errorCount > 0 && (
                    <div className="flex items-center gap-2">
                      <XCircleIcon className="h-4 w-4 text-red-500" />
                      <span className="text-sm text-gray-900">{results.results.summary.errorCount} Errors</span>
                    </div>
                  )}
                  {results.results.summary.warningCount > 0 && (
                    <div className="flex items-center gap-2">
                      <ExclamationTriangleIcon className="h-4 w-4 text-amber-500" />
                      <span className="text-sm text-gray-900">{results.results.summary.warningCount} Warnings</span>
                    </div>
                  )}
                  {results.results.summary.infoCount > 0 && (
                    <div className="flex items-center gap-2">
                      <InformationCircleIcon className="h-4 w-4 text-blue-500" />
                      <span className="text-sm text-gray-900">{results.results.summary.infoCount} Info</span>
                    </div>
                  )}
                </div>
              
                {/* Detailed Issues (shown when expanded) */}
                {showDetails && (
                  <div className="space-y-4 max-h-96 overflow-y-auto border-t border-gray-200 pt-4">
                    {/* Orphaned Accepted Quotes Section */}
                    {results.results.issues.filter(issue => issue.code === 'ORPHANED_ACCEPTED_QUOTE').length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Orphaned Accepted Quotes (No Deal Link)</h4>
                        <div className="space-y-2">
                          {results.results.issues
                            .filter(issue => issue.code === 'ORPHANED_ACCEPTED_QUOTE')
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
                    
                    {/* Quotes Referencing Missing Deals */}
                    {results.results.issues.filter(issue => issue.code === 'QUOTE_REFERENCES_MISSING_DEAL').length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Quotes Referencing Missing/Different Pipeline Deals</h4>
                        <div className="space-y-2">
                          {results.results.issues
                            .filter(issue => issue.code === 'QUOTE_REFERENCES_MISSING_DEAL')
                            .map((issue, i) => (
                              <div key={`missing-deal-${i}`} className="flex gap-3 p-3 bg-red-50 rounded-lg text-sm border border-red-200">
                                <div className="flex-shrink-0 mt-0.5">
                                  <XCircleIcon className="h-4 w-4 text-red-500" />
                                </div>
                                <div className="flex-1">
                                  <div className="font-medium text-gray-900">
                                    {issue.metadata?.quoteNumber || 'Unknown Quote'}
                                    {issue.metadata?.contactName && (
                                      <span className="text-gray-600"> - {issue.metadata.contactName}</span>
                                    )}
                                  </div>
                                  <div className="text-xs text-red-600 mt-1">
                                    References Deal ID: {issue.metadata?.referencedDealId}
                                  </div>
                                  {issue.metadata?.quoteTotal && (
                                    <div className="text-xs text-gray-700 mt-1">
                                      Value: SGD {issue.metadata.quoteTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                  )}
                                  <div className="text-xs text-red-700 mt-1">
                                    {issue.suggestedFix}
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Invalid Quote Format Section */}
                    {results.results.issues.filter(issue => issue.code === 'ACCEPTED_QUOTE_INVALID_FORMAT').length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Accepted Quotes with Invalid Format</h4>
                        <div className="space-y-2">
                          {results.results.issues
                            .filter(issue => issue.code === 'ACCEPTED_QUOTE_INVALID_FORMAT')
                            .map((issue, i) => (
                              <div key={`invalid-format-${i}`} className="flex gap-3 p-3 bg-red-50 rounded-lg text-sm border border-red-200">
                                <div className="flex-shrink-0 mt-0.5">
                                  <XCircleIcon className="h-4 w-4 text-red-500" />
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
                                  <div className="text-xs text-red-600 mt-1">
                                    Current format: {issue.metadata?.currentFormat}
                                  </div>
                                  <div className="text-xs text-green-700 mt-1">
                                    {issue.suggestedFix}
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Other Issues */}
                    {results.results.issues.filter(issue => 
                      issue.code !== 'ORPHANED_ACCEPTED_QUOTE' && 
                      issue.code !== 'ACCEPTED_QUOTE_INVALID_FORMAT' &&
                      issue.code !== 'QUOTE_REFERENCES_MISSING_DEAL'
                    ).length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Other Issues</h4>
                        <div className="space-y-2">
                          {results.results.issues
                            .filter(issue => 
                              issue.code !== 'ORPHANED_ACCEPTED_QUOTE' && 
                              issue.code !== 'ACCEPTED_QUOTE_INVALID_FORMAT' &&
                              issue.code !== 'QUOTE_REFERENCES_MISSING_DEAL'
                            )
                            .slice(0, 30)
                            .map((issue, i) => (
                              <div key={`other-${i}`} className="flex gap-3 p-3 bg-gray-50 rounded-lg text-sm">
                                <div className="flex-shrink-0 mt-0.5">
                                  {getSeverityIcon(issue.severity)}
                                </div>
                                <div className="flex-1">
                                  <div className="font-medium text-gray-900">{issue.message}</div>
                                  {issue.dealTitle && (
                                    <div className="text-xs text-gray-600 mt-1">Deal: {issue.dealTitle}</div>
                                  )}
                                  {issue.suggestedFix && (
                                    <div className="text-xs text-green-700 mt-1">
                                      Suggestion: {issue.suggestedFix}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                    {results.results.issues.length > 50 && (
                      <div className="text-center text-sm text-gray-500 py-2">
                        ... and {results.results.issues.length - 50} more issues
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Success Message */}
          {results.results.summary.totalIssues === 0 && (
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
    </div>
  );
}