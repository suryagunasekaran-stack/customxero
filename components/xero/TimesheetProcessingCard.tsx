'use client';

import React, { useState } from 'react';
import { CloudArrowUpIcon, DocumentArrowDownIcon, CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/solid';
import ProgressBar from '../ProgressBar';
import ConfirmationDialog from '../ConfirmationDialog';
import TenantConfirmationModal from './TenantConfirmationModal';

interface DirectProcessingResult {
  success: boolean;
  summary: {
    entriesProcessed: number;
    projectsAnalyzed: number;
    projectsMatched: number;
    tasksCreated: number;
    tasksUpdated: number;
    tasksFailed: number; // Total failures (for compatibility)
    actualTasksFailed: number; // Actual failures needing attention
    projectsNotFound: number; // Projects not found (likely closed)
    processingTimeMs: number;
  };
  results: Array<{
    projectCode: string;
    projectName: string;
    taskName: string;
    action: 'created' | 'updated' | 'failed';
    success: boolean;
    error?: string;
    details?: string;
  }>;
  downloadableReport: {
    filename: string;
    content: string;
  };
  error?: string;
}

interface ProcessingStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'current' | 'completed' | 'error';
  startTime?: number;
  completedTime?: number;
  details?: string;
}

const PROCESSING_STEPS: Omit<ProcessingStep, 'status' | 'startTime' | 'completedTime' | 'details'>[] = [
  {
    id: 'upload',
    title: 'File Upload',
    description: 'Uploading and validating timesheet file'
  },
  {
    id: 'parse',
    title: 'Data Processing',
    description: 'Parsing timesheet data and consolidating entries'
  },
  {
    id: 'tenant',
    title: 'Xero Connection',
    description: 'Verifying Xero organisation and fetching active projects'
  },
  {
    id: 'match',
    title: 'Project Matching',
    description: 'Matching timesheet projects with Xero projects'
  },
  {
    id: 'update',
    title: 'Task Updates',
    description: 'Creating and updating project tasks in Xero'
  },
  {
    id: 'report',
    title: 'Report Generation',
    description: 'Generating comprehensive processing report'
  }
];

export default function TimesheetProcessingCard({ disabled = false }: { disabled?: boolean }) {
  const [status, setStatus] = useState<'idle' | 'processing' | 'complete' | 'error'>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [results, setResults] = useState<DirectProcessingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showTenantConfirmation, setShowTenantConfirmation] = useState(false);
  const [filePreview, setFilePreview] = useState<{
    fileName: string;
    fileSize: string;
    lastModified: string;
  } | null>(null);
  const [tenantInfo, setTenantInfo] = useState<{
    tenantId: string;
    tenantName: string;
  } | null>(null);
  const [loadingTenant, setLoadingTenant] = useState(false);
  
  // Step tracking state
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);

  // Initialize processing steps
  const initializeSteps = () => {
    const steps: ProcessingStep[] = PROCESSING_STEPS.map(step => ({
      ...step,
      status: 'pending'
    }));
    setProcessingSteps(steps);
    setCurrentStepIndex(-1);
  };

  // Update step status
  const updateStep = (stepId: string, updates: Partial<ProcessingStep>) => {
    setProcessingSteps(prev => prev.map(step => 
      step.id === stepId ? { ...step, ...updates } : step
    ));
  };

  // Start a processing step
  const startStep = (stepId: string, details?: string) => {
    const stepIndex = PROCESSING_STEPS.findIndex(s => s.id === stepId);
    setCurrentStepIndex(stepIndex);
    updateStep(stepId, {
      status: 'current',
      startTime: Date.now(),
      details
    });
  };

  // Complete a processing step
  const completeStep = (stepId: string, details?: string) => {
    updateStep(stepId, {
      status: 'completed',
      completedTime: Date.now(),
      details
    });
  };

  // Mark step as error
  const errorStep = (stepId: string, error: string) => {
    updateStep(stepId, {
      status: 'error',
      completedTime: Date.now(),
      details: error
    });
  };

  // Auto-download report function
  const downloadReport = (report: { filename: string; content: string }) => {
    const blob = new Blob([report.content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = report.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Fetch current Xero tenant information
  const fetchTenantInfo = async () => {
    try {
      setLoadingTenant(true);
      const response = await fetch('/api/xero/projects');
      if (response.ok) {
        const data = await response.json();
        setTenantInfo({
          tenantId: data.metadata.tenantId,
          tenantName: data.metadata.tenantName
        });
        return data.metadata;
      } else {
        throw new Error('Failed to fetch tenant info');
      }
    } catch (error) {
      console.error('Failed to fetch tenant information:', error);
      setError('Unable to verify Xero company. Please check your connection.');
      return null;
    } finally {
      setLoadingTenant(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    
    if (!selectedFile) return;

    // Validate file type
    if (!selectedFile.name.toLowerCase().endsWith('.xlsx') && !selectedFile.name.toLowerCase().endsWith('.xls')) {
      setError('Invalid file format. Please upload an Excel file (.xlsx or .xls).');
      return;
    }

    setFile(selectedFile);
    setError(null);
    
    // Set file preview
    setFilePreview({
      fileName: selectedFile.name,
      fileSize: (selectedFile.size / 1024 / 1024).toFixed(2) + ' MB',
      lastModified: new Date(selectedFile.lastModified).toLocaleString()
    });

    // Fetch tenant info for confirmation
    const tenant = await fetchTenantInfo();
    if (tenant) {
      setShowTenantConfirmation(true);
    }
  };

  const handleConfirmProcessing = () => {
    setShowTenantConfirmation(false);
    handleProcessFile();
  };

  const handleCancelProcessing = () => {
    setShowTenantConfirmation(false);
    setFile(null);
    setFilePreview(null);
    setTenantInfo(null);
    setError(null);
  };

  const handleProcessFile = async () => {
    if (!file) return;
    
    setStatus('processing');
    setError(null);
    setStartTime(Date.now());
    
    // Initialize steps
    initializeSteps();

    try {
      // Step 1: File Upload and Validation
      startStep('upload', `Uploading ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate upload time
      
      // Verify tenant before processing (should already be loaded)
      if (!tenantInfo || !tenantInfo.tenantName) {
        errorStep('upload', 'Unable to verify Xero organisation connection');
        throw new Error('Unable to verify Xero organisation. Please check your connection and try again.');
      }
      
      completeStep('upload', 'File uploaded successfully');

      // Step 2: Data Processing
      startStep('parse', 'Processing timesheet data and consolidating entries...');
      await new Promise(resolve => setTimeout(resolve, 800)); // Simulate parsing time

      console.log(`[Streamlined Processing] Starting processing for: ${file.name} in tenant: ${tenantInfo.tenantName}`);
      
      // Additional check for demo company
      if (tenantInfo.tenantName.toLowerCase().includes('demo')) {
        console.warn(`[Timesheet Processing] Processing for demo company: ${tenantInfo.tenantName}`);
        updateStep('parse', { details: 'Processing demo company data...' });
      }
      
      const formData = new FormData();
      formData.append('file', file);

      completeStep('parse', 'Timesheet data processed and consolidated');

      // Step 3: Xero Connection and Project Fetching
      startStep('tenant', `Connecting to "${tenantInfo.tenantName}" and fetching active projects...`);
      await new Promise(resolve => setTimeout(resolve, 600)); // Simulate connection time

      // Step 4: Project Matching (we'll update this during the API call)
      startStep('match', 'Matching timesheet projects with active Xero projects...');

      // Call the API with enhanced progress tracking
      const response = await fetch('/api/xero/process-timesheet-direct', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        errorStep('match', `Server error: ${errorData.error || `HTTP ${response.status}`}`);
        throw new Error(errorData.error || `Server responded with ${response.status}`);
      }

      // Simulate processing steps with realistic timing
      await new Promise(resolve => setTimeout(resolve, 400));
      completeStep('match', 'Project matching completed');

      // Step 5: Task Updates
      startStep('update', 'Creating and updating project tasks in Xero...');
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate task updates

      const data: DirectProcessingResult = await response.json();
      
      // Update step with results
      const updateDetails = `${data.summary.tasksCreated} created, ${data.summary.tasksUpdated} updated`;
      completeStep('update', updateDetails);

      // Step 6: Report Generation
      startStep('report', 'Generating comprehensive processing report...');
      await new Promise(resolve => setTimeout(resolve, 300));
      completeStep('report', 'Report generated successfully');

      // Consider partial success as success if some tasks were processed
      if (data.success || (data.summary && (data.summary.tasksCreated > 0 || data.summary.tasksUpdated > 0))) {
        setResults(data);
        setStatus('complete');
        
        // Auto-download report
        downloadReport(data.downloadableReport);
        
        console.log('[Streamlined Processing] Success:', data.summary);
        
        // Log partial success or informational messages
        if (!data.success && (data.summary.tasksCreated > 0 || data.summary.tasksUpdated > 0)) {
          console.warn('[Streamlined Processing] Partial success with some failures:', {
            created: data.summary.tasksCreated,
            updated: data.summary.tasksUpdated,
            actualFailures: data.summary.actualTasksFailed,
            projectsNotFound: data.summary.projectsNotFound
          });
        }
        
        // Log informational message about "not found" projects
        if (data.summary.projectsNotFound > 0) {
          console.info(`[Streamlined Processing] ${data.summary.projectsNotFound} projects not found (likely moved to CLOSED/COMPLETED status - this is normal)`);
        }
      } else {
        // Only treat as complete failure if no tasks were processed at all AND there are actual failures
        if (data.summary) {
          setResults(data);
          setStatus('complete');
          downloadReport(data.downloadableReport);
        }
        
        const errorMsg = data.error || 
          (data.summary && data.summary.actualTasksFailed > 0 ? 
            `Processing completed with ${data.summary.actualTasksFailed} actual failures requiring attention (${data.summary.projectsNotFound} projects were not found - likely moved to closed status)` : 
            data.summary && data.summary.tasksFailed > 0 ? 
              `Processing completed - ${data.summary.projectsNotFound} projects not found (likely moved to closed status). No actual failures detected.` :
              'No tasks were processed successfully');
        
        // Only throw error for actual failures, not for "not found" projects
        if (data.summary && data.summary.actualTasksFailed > 0) {
          errorStep('report', errorMsg);
          throw new Error(errorMsg);
        } else {
          // If only "not found" projects, don't throw error - just log as info
          console.info('[Streamlined Processing] Processing completed with informational messages only:', errorMsg);
        }
      }

    } catch (error: any) {
      setStatus('error');
      setError(error.message);
      console.error('[Streamlined Processing] Error:', error);
      
      // Mark current step as error if not already marked
      if (currentStepIndex >= 0 && currentStepIndex < processingSteps.length) {
        const currentStep = processingSteps[currentStepIndex];
        if (currentStep && currentStep.status === 'current') {
          errorStep(currentStep.id, error.message);
        }
      }
    }
  };

  const triggerFileInput = () => {
    document.getElementById('streamlinedTimesheetInput')?.click();
  };

  const resetProcessor = () => {
    setStatus('idle');
    setFile(null);
    setResults(null);
    setError(null);
    setStartTime(null);
    setFilePreview(null);
    setTenantInfo(null);
    setProcessingSteps([]);
    setCurrentStepIndex(-1);
  };

  // Step Progress Component
  const StepProgress = ({ steps, currentIndex }: { steps: ProcessingStep[], currentIndex: number }) => {
    return (
      <div className="space-y-3">
        {steps.map((step, index) => {
          const isActive = step.status === 'current';
          const isCompleted = step.status === 'completed';
          const isError = step.status === 'error';
          const isPending = step.status === 'pending';
          
          return (
            <div key={step.id} className="flex items-start gap-3">
              {/* Step indicator */}
              <div className="flex-shrink-0 mt-0.5">
                {isCompleted && (
                  <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                    <CheckIcon className="w-3 h-3 text-white" />
                  </div>
                )}
                {isActive && (
                  <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  </div>
                )}
                {isError && (
                  <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                    <XMarkIcon className="w-3 h-3 text-white" />
                  </div>
                )}
                {isPending && (
                  <div className="w-5 h-5 bg-gray-300 rounded-full" />
                )}
              </div>
              
              {/* Step content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className={`text-sm font-medium ${
                    isCompleted ? 'text-green-700' :
                    isActive ? 'text-blue-700' :
                    isError ? 'text-red-700' :
                    'text-gray-500'
                  }`}>
                    {step.title}
                  </h4>
                  {step.startTime && (isActive || isCompleted || isError) && (
                    <span className="text-xs text-gray-400">
                      {isCompleted && step.completedTime 
                        ? `${((step.completedTime - step.startTime) / 1000).toFixed(1)}s`
                        : isActive 
                        ? `${((Date.now() - step.startTime) / 1000).toFixed(0)}s`
                        : ''
                      }
                    </span>
                  )}
                </div>
                
                <p className={`text-xs mt-0.5 ${
                  isCompleted ? 'text-green-600' :
                  isActive ? 'text-blue-600' :
                  isError ? 'text-red-600' :
                  'text-gray-400'
                }`}>
                  {step.details || step.description}
                </p>
                
                {isActive && (
                  <div className="mt-1">
                    <div className="w-full bg-blue-200 rounded-full h-1">
                      <div className="bg-blue-500 h-1 rounded-full animate-pulse" style={{ width: '60%' }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-200">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Timesheet Processing</h2>
              <p className="text-sm text-gray-500 mt-1">
                Upload timesheet to directly update project costs and generate reports
              </p>
            </div>
            {status === 'complete' && results && (
              <>
                {results.success && <CheckCircleIcon className="h-8 w-8 text-green-500" />}
                {!results.success && results.summary.tasksCreated > 0 && (
                  <ExclamationTriangleIcon className="h-8 w-8 text-amber-500" />
                )}
                {!results.success && results.summary.tasksCreated === 0 && (
                  <XCircleIcon className="h-8 w-8 text-red-500" />
                )}
              </>
            )}
          </div>

          {/* Upload State */}
          {status === 'idle' && (
            <div className="mt-6">
              <input
                id="streamlinedTimesheetInput"
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
                disabled={disabled || loadingTenant}
              />
              <button
                onClick={triggerFileInput}
                disabled={disabled || loadingTenant}
                className="w-full flex flex-col items-center justify-center px-6 py-8 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CloudArrowUpIcon className="h-12 w-12 text-gray-400 group-hover:text-gray-500 mb-3" />
                <span className="text-sm font-medium text-gray-700 group-hover:text-gray-800">
                  {loadingTenant ? 'Verifying Xero connection...' : 'Click to upload timesheet'}
                </span>
                <span className="text-xs text-gray-500 mt-1">
                  Excel files only (.xlsx, .xls) - Processing starts immediately
                </span>
              </button>
              
              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* Processing State */}
          {status === 'processing' && (
            <div className="mt-6 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="relative w-5 h-5">
                    <div className="absolute inset-0 rounded-full border-2 border-blue-200"></div>
                    <div className="absolute inset-0 rounded-full border-2 border-blue-600 border-t-transparent animate-spin"></div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-blue-800">Processing Timesheet</h3>
                    <p className="text-xs text-blue-600">
                      {tenantInfo 
                        ? `Processing in "${tenantInfo.tenantName}"...`
                        : 'Initializing processing...'
                      }
                    </p>
                  </div>
                </div>
                
                {filePreview && (
                  <div className="mb-4 text-xs text-blue-700 bg-blue-100 bg-opacity-50 rounded p-2">
                    📄 <strong>{filePreview.fileName}</strong> ({filePreview.fileSize})
                  </div>
                )}

                {/* Step Progress */}
                {processingSteps.length > 0 && (
                  <div className="mt-4">
                    <StepProgress steps={processingSteps} currentIndex={currentStepIndex} />
                  </div>
                )}
              </div>

              {/* Overall Progress Bar */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
                  <span>Overall Progress</span>
                  <span>
                    {processingSteps.filter(s => s.status === 'completed').length} / {processingSteps.length} steps
                  </span>
                </div>
                <ProgressBar 
                  current={processingSteps.filter(s => s.status === 'completed').length}
                  total={processingSteps.length}
                  startTime={startTime || undefined}
                  message={
                    currentStepIndex >= 0 && currentStepIndex < processingSteps.length
                      ? processingSteps[currentStepIndex]?.title || 'Processing...'
                      : 'Processing...'
                  }
                />
                
                {startTime && (
                  <div className="text-xs text-gray-500 mt-2 text-center">
                    Elapsed: {((Date.now() - startTime) / 1000).toFixed(0)}s
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Complete State */}
          {status === 'complete' && results && (
            <div className="mt-6 space-y-4">
              <div className={`border rounded-lg p-4 ${
                results.success 
                  ? 'bg-green-50 border-green-200' 
                  : results.summary.tasksCreated > 0
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-red-50 border-red-200'
              }`}>
                <h3 className={`text-sm font-semibold mb-3 ${
                  results.success 
                    ? 'text-green-800' 
                    : results.summary.tasksCreated > 0
                      ? 'text-amber-800'
                      : 'text-red-800'
                }`}>
                  {results.success 
                    ? 'Processing Complete' 
                    : results.summary.tasksCreated > 0
                      ? 'Processing Completed with Errors'
                      : 'Processing Failed'
                  }
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                  <div>
                    <span className="text-gray-600">Entries Processed:</span>
                    <span className="ml-2 font-medium text-gray-900">
                      {results.summary.entriesProcessed}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Projects Matched:</span>
                    <span className="ml-2 font-medium text-gray-900">
                      {results.summary.projectsMatched}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Tasks Created:</span>
                    <span className={`ml-2 font-medium ${
                      results.summary.tasksCreated > 0 ? 'text-green-700' : 'text-gray-900'
                    }`}>
                      {results.summary.tasksCreated}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Tasks Updated:</span>
                    <span className={`ml-2 font-medium ${
                      results.summary.tasksUpdated > 0 ? 'text-blue-700' : 'text-gray-900'
                    }`}>
                      {results.summary.tasksUpdated}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Tasks Failed:</span>
                    <span className={`ml-2 font-medium ${
                      results.summary.actualTasksFailed > 0 ? 'text-red-700' : 'text-gray-900'
                    }`}>
                      {results.summary.actualTasksFailed}
                    </span>
                    {results.summary.projectsNotFound > 0 && (
                      <span className="text-xs text-gray-500 ml-1">
                        (+{results.summary.projectsNotFound} not found)
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-gray-600">Projects Not Found:</span>
                    <span className="ml-2 font-medium text-gray-600">
                      {results.summary.projectsNotFound}
                    </span>
                    {results.summary.projectsNotFound > 0 && (
                      <span className="text-xs text-gray-500 ml-1">
                        (likely closed)
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-gray-600">Processing Time:</span>
                    <span className="ml-2 font-medium text-gray-900">
                      {(results.summary.processingTimeMs / 1000).toFixed(1)}s
                    </span>
                  </div>
                </div>

                {/* Show detailed breakdown of failures */}
                {(results.summary.actualTasksFailed > 0 || results.summary.projectsNotFound > 0) && (
                  <div className="mt-3 space-y-2">
                    {/* Actual failures requiring attention */}
                    {results.summary.actualTasksFailed > 0 && (
                      <div className="p-3 bg-red-50 bg-opacity-70 rounded">
                        <p className="text-xs font-medium text-red-800 mb-2">
                          ⚠️ Actual Failures Requiring Attention ({results.summary.actualTasksFailed}):
                        </p>
                        <div className="max-h-24 overflow-y-auto">
                          {results.results
                            .filter(r => !r.success && !r.error?.includes('not found in active Xero projects'))
                            .slice(0, 3)
                            .map((result, idx) => (
                              <div key={idx} className="text-xs text-red-700 mb-1">
                                • {result.projectCode} - {result.taskName}: {result.error}
                              </div>
                            ))}
                          {results.results.filter(r => !r.success && !r.error?.includes('not found in active Xero projects')).length > 3 && (
                            <div className="text-xs text-red-600">
                              ... and {results.results.filter(r => !r.success && !r.error?.includes('not found in active Xero projects')).length - 3} more (see report)
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Projects not found (informational) */}
                    {results.summary.projectsNotFound > 0 && (
                      <div className="p-3 bg-gray-50 bg-opacity-70 rounded">
                        <p className="text-xs font-medium text-gray-700 mb-2">
                          ℹ️ Projects Not Found ({results.summary.projectsNotFound}) - Likely Moved to Closed Status:
                        </p>
                        <div className="max-h-24 overflow-y-auto">
                          {results.results
                            .filter(r => !r.success && r.error?.includes('not found in active Xero projects'))
                            .slice(0, 3)
                            .map((result, idx) => (
                              <div key={idx} className="text-xs text-gray-600 mb-1">
                                • {result.projectCode} - {result.taskName}
                              </div>
                            ))}
                          {results.results.filter(r => !r.success && r.error?.includes('not found in active Xero projects')).length > 3 && (
                            <div className="text-xs text-gray-500">
                              ... and {results.results.filter(r => !r.success && r.error?.includes('not found in active Xero projects')).length - 3} more (see report)
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          This is normal when projects are completed and moved to closed status.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={resetProcessor}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Process Another
                </button>
                <button
                  onClick={() => downloadReport(results.downloadableReport)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  <DocumentArrowDownIcon className="w-4 h-4" />
                  Download Report
                </button>
              </div>
            </div>
          )}

          {/* Error State */}
          {status === 'error' && (
            <div className="mt-6 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-red-800 mb-1">Processing Failed</h3>
                <p className="text-sm text-red-600">{error}</p>
              </div>
              
              <button
                onClick={resetProcessor}
                className="w-full px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tenant Confirmation Modal */}
      <TenantConfirmationModal
        isOpen={showTenantConfirmation}
        tenantName={tenantInfo?.tenantName || ''}
        fileName={filePreview?.fileName || ''}
        onConfirm={handleConfirmProcessing}
        onCancel={handleCancelProcessing}
      />
    </>
  );
} 