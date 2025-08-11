/**
 * @fileoverview Fix confirmation dialog component for validating and confirming fix operations
 * @module components/xero/FixConfirmationDialog
 * @description Provides a comprehensive confirmation dialog that displays validation issues
 * categorized by type, statistics, and configuration options before executing fix operations.
 * Includes dry-run mode toggle and detailed issue previews with suggested fixes.
 * @since 1.0.0
 */

'use client';

import React, { Fragment, useMemo } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { 
  ExclamationTriangleIcon, 
  XCircleIcon,
  InformationCircleIcon,
  WrenchScrewdriverIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';
import { FixConfirmationData, FixValidationIssue } from '@/lib/types/fix';

/**
 * Props interface for the FixConfirmationDialog component
 * 
 * @interface FixConfirmationDialogProps
 * @property {boolean} isOpen - Whether the dialog is currently open/visible
 * @property {FixConfirmationData | null} data - Confirmation data containing issues and statistics
 * @property {function} onConfirm - Callback function called when user confirms the fix operation
 * @property {function} onCancel - Callback function called when user cancels or closes the dialog
 * @property {boolean} [isDryRun=false] - Whether dry-run mode is currently enabled
 * @property {function} [onToggleDryRun] - Optional callback for toggling dry-run mode
 * 
 * @since 1.0.0
 */
interface FixConfirmationDialogProps {
  isOpen: boolean;
  data: FixConfirmationData | null;
  onConfirm: () => void;
  onCancel: () => void;
  isDryRun?: boolean;
  onToggleDryRun?: (value: boolean) => void;
}

/**
 * Fix confirmation dialog component for validating fix operations before execution
 * 
 * @description Displays a comprehensive confirmation dialog showing validation issues
 * categorized by type (title, pipeline, quote, other) with statistics and configuration
 * options. Provides detailed issue previews with suggested fixes and supports dry-run mode.
 * 
 * @component
 * @param {FixConfirmationDialogProps} props - Component props
 * @returns {JSX.Element | null} Dialog component or null if no data provided
 * 
 * @example
 * ```tsx
 * function FixInterface() {
 *   const [showConfirmation, setShowConfirmation] = useState(false);
 *   const [isDryRun, setIsDryRun] = useState(false);
 *   
 *   return (
 *     <FixConfirmationDialog
 *       isOpen={showConfirmation}
 *       data={confirmationData}
 *       onConfirm={() => {
 *         setShowConfirmation(false);
 *         startFixOperation();
 *       }}
 *       onCancel={() => setShowConfirmation(false)}
 *       isDryRun={isDryRun}
 *       onToggleDryRun={setIsDryRun}
 *     />
 *   );
 * }
 * ```
 * 
 * @since 1.0.0
 */
export default function FixConfirmationDialog({
  isOpen,
  data,
  onConfirm,
  onCancel,
  isDryRun = false,
  onToggleDryRun
}: FixConfirmationDialogProps) {
  
  /**
   * Memoized computation to group validation issues by category for organized display
   * 
   * @description Groups issues into categories (title, pipeline, quote, other) based on
   * their error codes. Each group includes the issues, a display label, and color scheme
   * for consistent UI presentation. Only creates groups for categories that have issues.
   * 
   * @returns {Record<string, {issues: FixValidationIssue[], label: string, color: string}> | null}
   * Grouped issues object or null if no data available
   */
  const groupedIssues = useMemo(() => {
    if (!data) return null;
    
    const groups: Record<string, { issues: FixValidationIssue[], label: string, color: string }> = {};
    
    // Title format issues - deals with incorrect title formatting
    const titleIssues = data.issues.filter(i => i.code === 'INVALID_TITLE_FORMAT');
    if (titleIssues.length > 0) {
      groups.title = {
        issues: titleIssues,
        label: 'Title Format Issues',
        color: 'yellow'
      };
    }
    
    // Pipeline validation issues - deals in wrong pipelines or incorrect status
    const pipelineIssues = data.issues.filter(i => 
      i.code === 'WON_DEAL_IN_UNQUALIFIED_PIPELINE' || 
      i.code === 'OPEN_DEAL_IN_WRONG_PIPELINE'
    );
    if (pipelineIssues.length > 0) {
      groups.pipeline = {
        issues: pipelineIssues,
        label: 'Pipeline Validation Issues',
        color: 'red'
      };
    }
    
    // Quote-related issues - orphaned quotes, invalid formats, missing deal references
    const quoteIssues = data.issues.filter(i => 
      i.code === 'ORPHANED_ACCEPTED_QUOTE' || 
      i.code === 'ACCEPTED_QUOTE_INVALID_FORMAT' ||
      i.code === 'QUOTE_REFERENCES_MISSING_DEAL'
    );
    if (quoteIssues.length > 0) {
      groups.quote = {
        issues: quoteIssues,
        label: 'Quote Related Issues',
        color: 'amber'
      };
    }
    
    // Other miscellaneous issues that don't fit the main categories
    const otherIssues = data.issues.filter(i => 
      !titleIssues.includes(i) && 
      !pipelineIssues.includes(i) && 
      !quoteIssues.includes(i)
    );
    if (otherIssues.length > 0) {
      groups.other = {
        issues: otherIssues,
        label: 'Other Issues',
        color: 'gray'
      };
    }
    
    return groups;
  }, [data]);
  
  if (!data) return null;
  
  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-30" onClose={onCancel}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative transform overflow-hidden rounded-xl bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl">
                <div className="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
                  <div className="sm:flex sm:items-start">
                    <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 sm:mx-0 sm:h-10 sm:w-10">
                      <WrenchScrewdriverIcon className="h-6 w-6 text-amber-600" aria-hidden="true" />
                    </div>
                    <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full">
                      <Dialog.Title as="h3" className="text-xl font-semibold text-gray-900">
                        Confirm Fix Operations
                      </Dialog.Title>
                      
                      <div className="mt-4">
                        <p className="text-sm text-gray-600">
                          The following issues will be automatically fixed. Please review before proceeding.
                        </p>
                        
                        {/* Summary Stats */}
                        <div className="mt-4 grid grid-cols-3 gap-3">
                          <div className="bg-white rounded-lg p-3 text-center border border-gray-100">
                            <div className="text-2xl font-bold text-gray-900">{data.totalCount}</div>
                            <div className="text-xs text-gray-600">Total Issues</div>
                          </div>
                          <div className="bg-red-50 rounded-lg p-3 text-center">
                            <div className="text-2xl font-bold text-red-900">{data.errorCount}</div>
                            <div className="text-xs text-red-600">Errors</div>
                          </div>
                          <div className="bg-amber-50 rounded-lg p-3 text-center">
                            <div className="text-2xl font-bold text-amber-900">{data.warningCount}</div>
                            <div className="text-xs text-amber-600">Warnings</div>
                          </div>
                        </div>
                        
                        {/* Grouped Issues */}
                        <div className="mt-6 space-y-4 max-h-64 overflow-y-auto">
                          {groupedIssues && Object.entries(groupedIssues).map(([key, group]) => (
                            <div key={key} className="border border-gray-200 rounded-lg p-4">
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="text-sm font-semibold text-gray-900">{group.label}</h4>
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  group.color === 'red' ? 'bg-red-100 text-red-800' :
                                  group.color === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                                  group.color === 'amber' ? 'bg-amber-100 text-amber-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {group.issues.length} {group.issues.length === 1 ? 'issue' : 'issues'}
                                </span>
                              </div>
                              
                              <div className="space-y-2">
                                {group.issues.slice(0, 3).map((issue, idx) => (
                                  <div key={idx} className="flex items-start text-xs">
                                    <ChevronRightIcon className="h-3 w-3 text-gray-400 mt-0.5 mr-1 flex-shrink-0" />
                                    <div className="flex-1">
                                      <span className="text-gray-700">
                                        {issue.metadata?.dealTitle || issue.dealTitle || issue.message}
                                      </span>
                                      {issue.suggestedFix && (
                                        <div className="text-green-600 mt-0.5">
                                          → {issue.suggestedFix}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                                {group.issues.length > 3 && (
                                  <div className="text-xs text-gray-500 pl-4">
                                    ... and {group.issues.length - 3} more
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        
                        {/* Warning */}
                        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-3">
                          <div className="flex">
                            <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 flex-shrink-0" />
                            <div className="ml-2">
                              <p className="text-sm text-amber-800">
                                <strong>Important:</strong> This will modify {data.totalCount} deals in Pipedrive.
                                {' These changes cannot be automatically undone.'}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
                  <button
                    type="button"
                    className="w-full inline-flex items-center justify-center px-4 py-3 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 sm:ml-3 sm:w-auto"
                    style={{
                      backgroundColor: 'oklch(27.4% 0.006 286.033)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'oklch(21.6% 0.006 56.043)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'oklch(27.4% 0.006 286.033)';
                    }}
                    onClick={onConfirm}
                  >
                    Apply Fixes
                  </button>
                  <button
                    type="button"
                    className="mt-3 inline-flex w-full justify-center rounded-lg bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors duration-200 sm:mt-0 sm:w-auto"
                    onClick={onCancel}
                  >
                    Cancel
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}