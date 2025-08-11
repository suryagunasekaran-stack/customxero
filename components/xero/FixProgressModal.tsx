/**
 * @fileoverview Fix progress modal component for displaying real-time fix operation progress
 * @module components/xero/FixProgressModal
 * @description Provides a modal interface for displaying real-time progress updates during
 * fix operations. Shows current step progress, activity logs, error states, and final results
 * with detailed fix statistics and recommendations.
 * @since 1.0.0
 */

'use client';

import React, { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { 
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import { UseFixSessionState } from '@/lib/types/fix';

/**
 * Props interface for the FixProgressModal component
 * 
 * @interface FixProgressModalProps
 * @property {boolean} isOpen - Whether the modal is currently open/visible
 * @property {UseFixSessionState} state - Current fix session state from useFixSession hook
 * @property {function} onClose - Callback function called when user closes the modal
 * @property {function} [onCancel] - Optional callback for cancelling the fix operation
 * 
 * @since 1.0.0
 */
interface FixProgressModalProps {
  isOpen: boolean;
  state: UseFixSessionState;
  onClose: () => void;
  onCancel?: () => void;
}

/**
 * Fix progress modal component for displaying real-time fix operation status
 * 
 * @description Displays a modal with real-time progress updates during fix operations.
 * Shows current step progress with progress bars, activity logs, error messages,
 * and final results including statistics and detailed fix outcomes. Prevents
 * accidental closure during active operations.
 * 
 * @component
 * @param {FixProgressModalProps} props - Component props
 * @returns {JSX.Element} Modal component with progress display
 * 
 * @example
 * ```tsx
 * function FixInterface() {
 *   const fixSession = useFixSession();
 *   const [showProgress, setShowProgress] = useState(false);
 *   
 *   return (
 *     <FixProgressModal
 *       isOpen={showProgress}
 *       state={fixSession}
 *       onClose={() => {
 *         setShowProgress(false);
 *         fixSession.reset(); // Clear session data
 *       }}
 *       onCancel={fixSession.cancel}
 *     />
 *   );
 * }
 * ```
 * 
 * @since 1.0.0
 */
export default function FixProgressModal({
  isOpen,
  state,
  onClose,
  onCancel
}: FixProgressModalProps) {
  const { isFixing, currentStep, logs, error, results } = state;
  
  // Calculate current progress percentage from step data
  const progressPercentage = currentStep?.progress || 0;
  
  // Determine modal closure permissions - prevent closing during active operations
  const canClose = !isFixing || !!error || !!results;
  
  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog 
        as="div" 
        className="relative z-30" 
        onClose={() => {
          if (canClose) onClose();
        }}
      >
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
              <Dialog.Panel className="relative transform overflow-hidden rounded-xl bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-3xl">
                <div className="bg-white px-4 pb-4 pt-5 sm:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <Dialog.Title as="h3" className="text-xl font-semibold text-gray-900">
                      {isFixing ? 'Fixing Issues...' : results ? 'Fix Complete' : 'Fix Status'}
                    </Dialog.Title>
                    {canClose && (
                      <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 rounded-lg p-1 transition-colors duration-200"
                        aria-label="Close modal"
                      >
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                  
                  {/* Current Step Progress */}
                  {currentStep && isFixing && (
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center">
                          <ArrowPathIcon className="h-5 w-5 animate-spin text-blue-500 mr-2" />
                          <span className="text-sm font-medium text-gray-900">{currentStep.name}</span>
                        </div>
                        <span className="text-sm text-gray-500">{progressPercentage}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="h-2 rounded-full transition-all duration-200"
                          style={{ 
                            width: `${progressPercentage}%`,
                            backgroundColor: 'oklch(27.4% 0.006 286.033)'
                          }}
                        />
                      </div>
                      <p className="text-sm text-gray-600 mt-2">{currentStep.description}</p>
                    </div>
                  )}
                  
                  {/* Error Display */}
                  {error && (
                    <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-3">
                      <div className="flex items-center">
                        <XCircleIcon className="h-5 w-5 text-red-600 mr-2" />
                        <div>
                          <span className="text-sm font-medium text-red-800">Fix operation failed:</span>
                          <span className="text-sm text-red-700 ml-1">{error}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Results Summary */}
                  {results && (
                    <div className="mb-6">
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        <div className="bg-white rounded-lg p-3 text-center border border-green-200">
                          <div className="text-2xl font-bold text-green-900">{results.fixedCount}</div>
                          <div className="text-xs text-green-600">Fixed</div>
                        </div>
                        <div className="bg-white rounded-lg p-3 text-center border border-yellow-200">
                          <div className="text-2xl font-bold text-yellow-900">{results.skippedCount}</div>
                          <div className="text-xs text-yellow-600">Skipped</div>
                        </div>
                        <div className="bg-white rounded-lg p-3 text-center border border-red-200">
                          <div className="text-2xl font-bold text-red-900">{results.failedCount}</div>
                          <div className="text-xs text-red-600">Failed</div>
                        </div>
                      </div>
                      
                      {/* Duration */}
                      <div className="text-sm text-gray-600 text-center">
                        Completed in {(results.duration / 1000).toFixed(1)} seconds
                      </div>
                      
                      {/* Recommendations */}
                      {results.recommendations && results.recommendations.length > 0 && (
                        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <h4 className="text-sm font-semibold text-blue-900 mb-2">Recommendations</h4>
                          <ul className="space-y-1">
                            {results.recommendations.map((rec, idx) => (
                              <li key={idx} className="text-sm text-blue-700 flex items-start">
                                <span className="mr-1">•</span>
                                <span>{rec}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {/* Fix Details */}
                      {results.fixResults && results.fixResults.length > 0 && (
                        <div className="mt-4">
                          <h4 className="text-sm font-semibold text-gray-900 mb-2">Fix Details</h4>
                          <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                            <div className="divide-y divide-gray-200">
                              {results.fixResults.slice(0, 20).map((result, idx) => (
                                <div key={idx} className="px-3 py-2 hover:bg-gray-50">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center flex-1">
                                      {result.status === 'fixed' ? (
                                        <CheckCircleIcon className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                                      ) : result.status === 'skipped' ? (
                                        <ExclamationTriangleIcon className="h-4 w-4 text-yellow-500 mr-2 flex-shrink-0" />
                                      ) : (
                                        <XCircleIcon className="h-4 w-4 text-red-500 mr-2 flex-shrink-0" />
                                      )}
                                      <div className="text-sm">
                                        <div className="font-medium text-gray-900">
                                          Deal #{result.dealId}
                                        </div>
                                        {result.newTitle && result.originalTitle !== result.newTitle && (
                                          <div className="text-xs text-gray-600 mt-0.5">
                                            {result.originalTitle} → {result.newTitle}
                                          </div>
                                        )}
                                        {result.error && (
                                          <div className="text-xs text-red-600 mt-0.5">
                                            {result.error}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    <span className={`text-xs px-2 py-1 rounded-full ${
                                      result.status === 'fixed' ? 'bg-green-100 text-green-800' :
                                      result.status === 'skipped' ? 'bg-yellow-100 text-yellow-800' :
                                      'bg-red-100 text-red-800'
                                    }`}>
                                      {result.status}
                                    </span>
                                  </div>
                                </div>
                              ))}
                              {results.fixResults.length > 20 && (
                                <div className="px-3 py-2 text-center text-sm text-gray-500">
                                  ... and {results.fixResults.length - 20} more
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Logs */}
                  {logs.length > 0 && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                      <div className="px-3 py-2 bg-gray-100 border-b border-gray-200">
                        <h4 className="text-xs font-semibold text-gray-700">Activity Log</h4>
                      </div>
                      <div className="p-3 max-h-32 overflow-y-auto">
                        <div className="space-y-1">
                          {logs.slice(-10).map((log, i) => (
                            <div key={i} className="text-xs text-gray-600 font-mono leading-relaxed">
                              {log}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Footer Actions */}
                <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
                  {isFixing && onCancel ? (
                    <button
                      type="button"
                      onClick={onCancel}
                      className="inline-flex w-full justify-center rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors duration-200 sm:ml-3 sm:w-auto"
                    >
                      Cancel Fix
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onClose}
                      className="inline-flex w-full justify-center rounded-lg bg-gray-600 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors duration-200 sm:ml-3 sm:w-auto"
                    >
                      {results ? 'Close' : 'Dismiss'}
                    </button>
                  )}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}