'use client';

import React, { useState } from 'react';
import {
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  PlayIcon
} from '@heroicons/react/24/outline';

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
    summary: {
      totalDeals: number;
      totalQuotes: number;
      totalProjects: number;
      dealsWithIssues: number;
      quotesWithIssues: number;
      projectsWithIssues: number;
      totalIssues: number;
      errorCount: number;
      warningCount: number;
      infoCount: number;
      matchedDealsToQuotes: number;
      matchedDealsToProjects: number;
      unmatchedDeals: number;
      unmatchedQuotes: number;
      unmatchedProjects: number;
    };
    issues: Array<{
      severity: 'error' | 'warning' | 'info';
      code: string;
      message: string;
      dealId?: number;
      dealTitle?: string;
      field?: string;
      suggestedFix?: string;
    }>;
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
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
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
              console.error('Failed to parse SSE data:', e);
            }
          }
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
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <button
          onClick={startValidation}
          disabled={isValidating}
          className="w-full inline-flex items-center justify-center px-4 py-3 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
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
              Validating...
            </>
          ) : (
            <>
              <PlayIcon className="h-5 w-5 mr-2" />
              Validate Pipedrive Deals
            </>
          )}
        </button>
        
        {results && (
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="w-full inline-flex items-center justify-center px-4 py-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors duration-200"
          >
            {showDetails ? 'Hide' : 'Show'} Details
          </button>
        )}
      </div>
      
      {/* Current Step Progress */}
      {currentStep && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-200">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0">
                {getStepIcon(currentStep.status)}
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-gray-900">{currentStep.name}</h3>
                <p className="text-sm text-gray-600 mt-1">{currentStep.description}</p>
              </div>
            </div>
            {currentStep.progress !== undefined && (
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${currentStep.progress}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Logs */}
      {logs.length > 0 && (
        <div className="bg-gray-100 rounded-lg p-3 max-h-32 overflow-y-auto">
          <div className="space-y-1">
            {logs.map((log, i) => (
              <div key={i} className="text-xs text-gray-600 font-mono">
                {log}
              </div>
            ))}
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
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-200">
            <div className="p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Validation Summary</h3>
            
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-white rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-gray-900">{results.results.summary.totalDeals}</div>
                  <div className="text-xs text-gray-600">Total Deals</div>
                </div>
                <div className="bg-white rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-gray-900">{results.results.summary.totalQuotes}</div>
                  <div className="text-xs text-gray-600">Total Quotes</div>
                </div>
                <div className="bg-white rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-gray-900">{results.results.summary.totalProjects}</div>
                  <div className="text-xs text-gray-600">Total Projects</div>
                </div>
              </div>
            
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Matched to Quotes:</span>
                  <span className="font-medium text-gray-900">{results.results.summary.matchedDealsToQuotes}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Matched to Projects:</span>
                  <span className="font-medium text-gray-900">{results.results.summary.matchedDealsToProjects}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Unmatched Deals:</span>
                  <span className="font-medium text-gray-900">{results.results.summary.unmatchedDeals}</span>
                </div>
              </div>
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
                  <div className="space-y-2 max-h-96 overflow-y-auto border-t border-gray-200 pt-4">
                    {results.results.issues.slice(0, 50).map((issue, i) => (
                      <div key={i} className="flex gap-3 p-3 bg-gray-50 rounded-lg text-sm">
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