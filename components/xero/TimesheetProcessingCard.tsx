'use client';

import React, { useState } from 'react';
import { CloudArrowUpIcon, DocumentArrowDownIcon, CheckCircleIcon, XCircleIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import ProgressBar from '../ProgressBar';
import ConfirmationDialog from '../ConfirmationDialog';
import CachedProjectsViewer from './CachedProjectsViewer';
import ProjectMatchingAnalyzer from './ProjectMatchingAnalyzer';

interface ProcessingStep {
  name: string;
  status: 'pending' | 'processing' | 'complete' | 'error';
  message?: string;
  details?: any;
}

interface UnifiedProcessingResult {
  success: boolean;
  timesheetProcessing: any;
  projectStandardization: {
    projectsAnalyzed: number;
    projectsNeedingTasks: number;
    tasksCreated: number;
    taskCreationResults: any[];
  };
  taskUpdates: {
    projectsProcessed: number;
    tasksUpdated: number;
    tasksFailed: number;
    updateResults: any[];
  };
  downloadableReport: {
    filename: string;
    content: string;
  };
  statistics: {
    totalApiCalls: number;
    processingTimeMs: number;
    cacheHits: number;
  };
}

export default function TimesheetProcessingCard({ disabled = false }: { disabled?: boolean }) {
  const [currentStep, setCurrentStep] = useState<'upload' | 'confirm' | 'review' | 'processing' | 'complete' | 'error'>('upload');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([
    { name: 'Processing Timesheet', status: 'pending' },
    { name: 'Loading Project Data', status: 'pending' },
    { name: 'Creating Missing Tasks', status: 'pending' },
    { name: 'Updating Project Costs', status: 'pending' },
    { name: 'Generating Report', status: 'pending' }
  ]);
  const [results, setResults] = useState<UnifiedProcessingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [totalProgress, setTotalProgress] = useState(0);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showReviewConfirmation, setShowReviewConfirmation] = useState(false);
  const [timesheetPreview, setTimesheetPreview] = useState<any>(null);
  const [processedData, setProcessedData] = useState<any>(null);
  const [cachedProjects, setCachedProjects] = useState<any[]>([]);

  const updateStep = (index: number, status: ProcessingStep['status'], message?: string, details?: any) => {
    setProcessingSteps(prev => {
      const newSteps = [...prev];
      newSteps[index] = { ...newSteps[index], status, message, details };
      return newSteps;
    });
  };

  const fetchCachedProjects = async () => {
    try {
      console.log('[TimesheetProcessingCard] Fetching cached projects...');
      const response = await fetch('/api/xero/cache-status');
      console.log('[TimesheetProcessingCard] Cache status response:', response.status);
      
      if (response.ok) {
        const cacheData = await response.json();
        console.log('[TimesheetProcessingCard] Cache data received:', {
          projectCount: cacheData.projects?.length || 0,
          tenantName: cacheData.tenantName
        });
        setCachedProjects(cacheData.projects || []);
      } else {
        const errorText = await response.text();
        console.error('[TimesheetProcessingCard] Cache status error:', response.status, errorText);
      }
    } catch (error) {
      console.error('[TimesheetProcessingCard] Failed to fetch cached projects:', error);
    }
  };

  const handleRefreshCache = async () => {
    try {
      console.log('[TimesheetProcessingCard] Refreshing cache...');
      const response = await fetch('/api/xero/projects', {
        method: 'GET',
        headers: { 'X-Force-Refresh': 'true' }
      });
      console.log('[TimesheetProcessingCard] Refresh response:', response.status);
      
      if (response.ok) {
        // Small delay to ensure cache is updated
        await new Promise(resolve => setTimeout(resolve, 100));
        await fetchCachedProjects();
      } else {
        const errorText = await response.text();
        console.error('[TimesheetProcessingCard] Refresh error:', response.status, errorText);
      }
    } catch (error) {
      console.error('[TimesheetProcessingCard] Failed to refresh cache:', error);
    }
  };

  // Load cached projects on component mount
  React.useEffect(() => {
    fetchCachedProjects();
  }, []);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    
    if (!file) return;

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.xlsx') && !file.name.toLowerCase().endsWith('.xls')) {
      setError('Invalid file format. Please upload an Excel file (.xlsx or .xls).');
      return;
    }

    setUploadedFile(file);
    setError(null);
    
    // Preview data (in real app, you might parse a bit of the file)
    setTimesheetPreview({
      fileName: file.name,
      fileSize: (file.size / 1024 / 1024).toFixed(2) + ' MB',
      lastModified: new Date(file.lastModified).toLocaleString()
    });
    
    setShowConfirmation(true);
  };

  const handleProcessFile = async () => {
    if (!uploadedFile) return;
    
    setCurrentStep('processing');
    setError(null);
    setStartTime(Date.now());
    setCurrentProgress(0);
    setTotalProgress(1); // Only 1 step for initial processing
    
    // Reset processing steps for initial processing
    setProcessingSteps([
      { name: 'Processing Timesheet Data', status: 'pending' }
    ]);

    try {
      updateStep(0, 'processing', 'Analyzing timesheet data...');
      setCurrentProgress(0.5);
      
      const formData = new FormData();
      formData.append('file', uploadedFile);

      // Call the processing endpoint to get consolidated data
      const response = await fetch('http://127.0.0.1:5001/api/process-timesheet', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(errorData.error || `Server responded with ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Processing failed');
      }

      updateStep(0, 'complete', 
        `Processed ${data.metadata.entries_processed} entries, ${data.metadata.projects_consolidated} projects`,
        data
      );
      setCurrentProgress(1);

      setProcessedData(data);
      setCurrentStep('review');
      setShowReviewConfirmation(true);

    } catch (error: any) {
      setCurrentStep('error');
      setError(error.message);
      
      // Update failed step
      const failedStepIndex = processingSteps.findIndex(step => step.status === 'processing');
      if (failedStepIndex >= 0) {
        updateStep(failedStepIndex, 'error', error.message);
      }
    }
  };

  const handleConfirmXeroUpdate = async () => {
    if (!uploadedFile || !processedData) return;
    
    setCurrentStep('processing');
    setError(null);
    setStartTime(Date.now());
    setCurrentProgress(0);
    setTotalProgress(5); // 5 steps for Xero updates
    
    // Reset processing steps for Xero updates
    setProcessingSteps([
      { name: 'Processing Timesheet', status: 'complete', message: `Processed ${processedData.metadata.entries_processed} entries` },
      { name: 'Loading Project Data', status: 'pending' },
      { name: 'Creating Missing Tasks', status: 'pending' },
      { name: 'Updating Project Costs', status: 'pending' },
      { name: 'Generating Report', status: 'pending' }
    ]);

    try {
      setCurrentProgress(1);
      
      const formData = new FormData();
      formData.append('file', uploadedFile);

      const response = await fetch('/api/xero/process-and-update-timesheet', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Server responded with ${response.status}`);
      }

      const data: UnifiedProcessingResult = await response.json();

      if (!data.success) {
        throw new Error('Processing failed');
      }

      // Update step statuses based on results
      updateStep(1, 'complete', 
        `Loaded data for ${data.timesheetProcessing.metadata.projects_consolidated} projects`,
        { cacheHits: data.statistics.cacheHits }
      );
      setCurrentProgress(2);

      updateStep(2, 'complete', 
        `Created ${data.projectStandardization.tasksCreated} missing tasks`,
        data.projectStandardization
      );
      setCurrentProgress(3);

      updateStep(3, 'complete', 
        `Updated ${data.taskUpdates.tasksUpdated} tasks`,
        data.taskUpdates
      );
      setCurrentProgress(4);

      updateStep(4, 'complete', 
        'Report generated successfully',
        data.downloadableReport
      );
      setCurrentProgress(5);

      setResults(data);
      setCurrentStep('complete');

      // Auto-download report
      if (data.downloadableReport) {
        const blob = new Blob([data.downloadableReport.content], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = data.downloadableReport.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }

    } catch (error: any) {
      setCurrentStep('error');
      setError(error.message);
      
      // Update failed step
      const failedStepIndex = processingSteps.findIndex(step => step.status === 'processing');
      if (failedStepIndex >= 0) {
        updateStep(failedStepIndex, 'error', error.message);
      }
    }
  };

  const triggerFileInput = () => {
    document.getElementById('unifiedTimesheetInput')?.click();
  };

  const resetProcessor = () => {
    setCurrentStep('upload');
    setUploadedFile(null);
    setResults(null);
    setError(null);
    setStartTime(null);
    setCurrentProgress(0);
    setTotalProgress(0);
    setTimesheetPreview(null);
    setProcessedData(null);
    setShowReviewConfirmation(false);
    setProcessingSteps([
      { name: 'Processing Timesheet', status: 'pending' },
      { name: 'Loading Project Data', status: 'pending' },
      { name: 'Creating Missing Tasks', status: 'pending' },
      { name: 'Updating Project Costs', status: 'pending' },
      { name: 'Generating Report', status: 'pending' }
    ]);
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
                Upload timesheet to update project costs and generate reports
              </p>
            </div>
            {currentStep === 'complete' && (
              <CheckCircleIcon className="h-8 w-8 text-green-500" />
            )}
          </div>



          {/* Upload State */}
          {currentStep === 'upload' && (
            <div className="mt-6">
              <input
                id="unifiedTimesheetInput"
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
                disabled={disabled}
              />
              <button
                onClick={triggerFileInput}
                disabled={disabled}
                className="w-full flex flex-col items-center justify-center px-6 py-8 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-all duration-200 group"
              >
                <CloudArrowUpIcon className="h-12 w-12 text-gray-400 group-hover:text-gray-500 mb-3" />
                <span className="text-sm font-medium text-gray-700 group-hover:text-gray-800">
                  Click to upload timesheet
                </span>
                <span className="text-xs text-gray-500 mt-1">
                  Excel files only (.xlsx, .xls)
                </span>
              </button>
              
              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* Review State */}
          {currentStep === 'review' && processedData && (
            <div className="mt-6 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-800 mb-3">Timesheet Analysis Complete</h3>
                <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                  <div>
                    <span className="text-gray-600">Entries Processed:</span>
                    <span className="ml-2 font-medium text-gray-900">
                      {processedData.metadata.entries_processed}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Projects Found:</span>
                    <span className="ml-2 font-medium text-gray-900">
                      {processedData.metadata.projects_consolidated}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Period:</span>
                    <span className="ml-2 font-medium text-gray-900">
                      {processedData.metadata.period_range}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Cost Verification:</span>
                    <span className={`ml-2 font-medium ${processedData.cost_verification?.calculations_match ? 'text-green-600' : 'text-red-600'}`}>
                      {processedData.cost_verification?.calculations_match ? 'Verified ✓' : 'Failed ✗'}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-blue-600">
                  Review the project updates below, then proceed to update Xero.
                </p>
              </div>

              {/* Project Matching Analysis */}
              <ProjectMatchingAnalyzer 
                timesheetData={processedData}
                cachedProjects={cachedProjects}
              />
              
              <div className="flex gap-3">
                <button
                  onClick={resetProcessor}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setShowReviewConfirmation(true)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Update Xero Projects
                </button>
              </div>
            </div>
          )}

          {/* Processing State */}
          {currentStep === 'processing' && (
            <div className="mt-6 space-y-6">
              <ProgressBar 
                current={currentProgress}
                total={totalProgress}
                startTime={startTime || undefined}
                message="Processing timesheet data"
              />
              
              <div className="space-y-3">
                {processingSteps.map((step, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {step.status === 'pending' && (
                        <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                      )}
                      {step.status === 'processing' && (
                        <div className="relative w-5 h-5">
                          <div className="absolute inset-0 rounded-full border-2 border-blue-200"></div>
                          <div className="absolute inset-0 rounded-full border-2 border-blue-600 border-t-transparent animate-spin"></div>
                        </div>
                      )}
                      {step.status === 'complete' && (
                        <CheckCircleIcon className="w-5 h-5 text-green-500" />
                      )}
                      {step.status === 'error' && (
                        <XCircleIcon className="w-5 h-5 text-red-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${
                        step.status === 'complete' ? 'text-green-700' : 
                        step.status === 'error' ? 'text-red-700' : 
                        step.status === 'processing' ? 'text-blue-700' : 
                        'text-gray-500'
                      }`}>
                        {step.name}
                      </p>
                      {step.message && (
                        <p className="text-xs text-gray-500 mt-0.5">{step.message}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Complete State */}
          {currentStep === 'complete' && results && (
            <div className="mt-6 space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-green-800 mb-3">Processing Complete</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-600">Entries Processed:</span>
                    <span className="ml-2 font-medium text-gray-900">
                      {results.timesheetProcessing.metadata.entries_processed}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Projects Updated:</span>
                    <span className="ml-2 font-medium text-gray-900">
                      {results.taskUpdates.projectsProcessed}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Tasks Created:</span>
                    <span className="ml-2 font-medium text-gray-900">
                      {results.projectStandardization.tasksCreated}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Processing Time:</span>
                    <span className="ml-2 font-medium text-gray-900">
                      {(results.statistics.processingTimeMs / 1000).toFixed(1)}s
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={resetProcessor}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Process Another
                </button>
                <button
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  <DocumentArrowDownIcon className="w-4 h-4" />
                  View Report
                </button>
              </div>
            </div>
          )}

          {/* Error State */}
          {currentStep === 'error' && (
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

      {/* First Confirmation Dialog - File Upload */}
      <ConfirmationDialog
        isOpen={showConfirmation}
        onClose={() => setShowConfirmation(false)}
        onConfirm={() => {
          setShowConfirmation(false);
          handleProcessFile();
        }}
        title="Process Timesheet"
        message="This will analyze the timesheet data and prepare it for Xero updates. You'll be able to review the changes before they're applied."
        details={timesheetPreview ? [
          { label: 'File', value: timesheetPreview.fileName },
          { label: 'Size', value: timesheetPreview.fileSize },
          { label: 'Modified', value: timesheetPreview.lastModified }
        ] : undefined}
        confirmText="Analyze Timesheet"
        type="info"
      />

      {/* Second Confirmation Dialog - Xero Update Review */}
      <ConfirmationDialog
        isOpen={showReviewConfirmation}
        onClose={() => setShowReviewConfirmation(false)}
        onConfirm={() => {
          setShowReviewConfirmation(false);
          handleConfirmXeroUpdate();
        }}
        title="Update Xero Projects"
        message="This will update Xero with the processed timesheet data. Missing tasks will be created and project costs will be updated based on the breakdown you reviewed."
        details={processedData ? [
          { label: 'Entries to Process', value: processedData.metadata.entries_processed },
          { label: 'Projects to Update', value: processedData.metadata.projects_consolidated },
          { label: 'Period', value: processedData.metadata.period_range },
          { label: 'Cost Verification', value: processedData.cost_verification?.calculations_match ? 'Verified ✓' : 'Failed ✗' },
          { 
            label: 'Total Value', 
            value: `$${(Object.values(processedData.consolidated_payload || {}).flat().reduce((sum: number, task: any) => sum + (task.rate?.value || 0), 0) / 100).toFixed(2)} ${(Object.values(processedData.consolidated_payload || {}) as any[])[0]?.[0]?.rate?.currency || 'SGD'}`
          }
        ] : undefined}
        confirmText="Update Xero"
        type="warning"
      />
    </>
  );
} 