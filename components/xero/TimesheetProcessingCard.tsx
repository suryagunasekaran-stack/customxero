'use client';

import React, { useState } from 'react';
import { CloudArrowUpIcon, DocumentArrowDownIcon, CheckCircleIcon, XCircleIcon, DocumentTextIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
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
  const [timesheetPreview, setTimesheetPreview] = useState<any>(null);
  const [processedData, setProcessedData] = useState<any>(null);
  const [cachedProjects, setCachedProjects] = useState<any[]>([]);
  const [filteredPayload, setFilteredPayload] = useState<any>(null);

  const updateStep = (index: number, status: ProcessingStep['status'], message?: string, details?: any) => {
    setProcessingSteps(prev => {
      const newSteps = [...prev];
      newSteps[index] = { ...newSteps[index], status, message, details };
      return newSteps;
    });
  };

  const fetchCachedProjects = async () => {
    try {
      const response = await fetch('/api/xero/cache-status');
      if (response.ok) {
        const data = await response.json();
        setCachedProjects(data.projects || []);
        return data.projects || [];
      }
      return [];
    } catch (error) {
      console.error('Failed to fetch cached projects:', error);
      return [];
    }
  };

  const handleRefreshCache = async () => {
    try {
      // Clear cache first
      await fetch('/api/xero/clear-cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      
      // Fetch fresh data
      await fetch('/api/xero/projects');
      
      // Update cached projects
      await fetchCachedProjects();
    } catch (error) {
      console.error('Failed to refresh cache:', error);
    }
  };

  const filterPayloadByMatches = (payload: any, cachedProjectsList: any[]) => {
    if (!payload?.consolidated_payload) return payload;
    
    console.log('[Filter] Starting payload filtering');
    console.log('[Filter] Original payload project codes:', Object.keys(payload.consolidated_payload));
    
    // Log all tasks in the original payload
    Object.entries(payload.consolidated_payload).forEach(([projectCode, tasks]: [string, any]) => {
      console.log(`[Filter] Project ${projectCode} has tasks:`, (tasks as any[]).map(t => t.name));
      const hasSupplyLabour = (tasks as any[]).some(t => t.name === 'Supply Labour');
      if (!hasSupplyLabour) {
        console.warn(`[Filter] WARNING: 'Supply Labour' missing in original payload for project ${projectCode}`);
      }
    });
    
    // Create a map of cached project codes for quick lookup
    const cachedProjectCodes = new Set(
      cachedProjectsList
        .filter(project => project.projectCode)
        .map(project => project.projectCode)
    );
    
    console.log('[Filter] Cached project codes:', Array.from(cachedProjectCodes));
    
    // Filter the consolidated payload to only include matching projects
    const filteredConsolidatedPayload: any = {};
    let matchedProjects = 0;
    let totalProjects = 0;
    
    Object.entries(payload.consolidated_payload).forEach(([projectCode, tasks]) => {
      totalProjects++;
      if (cachedProjectCodes.has(projectCode)) {
        filteredConsolidatedPayload[projectCode] = tasks;
        matchedProjects++;
        console.log(`[Filter] ✅ Including project ${projectCode} with ${(tasks as any[]).length} tasks`);
      } else {
        console.log(`[Filter] ❌ Excluding project ${projectCode} - not in cached projects`);
      }
    });
    
    // Log filtered results
    console.log('[Filter] Filtering complete');
    console.log('[Filter] Matched projects:', matchedProjects);
    console.log('[Filter] Filtered out:', totalProjects - matchedProjects);
    
    // Update metadata to reflect filtered data
    const filteredPayload = {
      ...payload,
      consolidated_payload: filteredConsolidatedPayload,
      metadata: {
        ...payload.metadata,
        projects_consolidated: matchedProjects,
        original_projects_consolidated: totalProjects,
        projects_filtered: totalProjects - matchedProjects
      }
    };
    
    return filteredPayload;
  };

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
    setTotalProgress(3); // 3 steps: process timesheet, load projects, analyze matches
    
    // Reset processing steps for initial processing
    setProcessingSteps([
      { name: 'Processing Timesheet Data', status: 'pending' },
      { name: 'Loading Project Data', status: 'pending' },
      { name: 'Analyzing Project Matches', status: 'pending' }
    ]);

    try {
      // Step 1: Process timesheet
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

      // Log the raw data from Python endpoint
      console.log('[Timesheet Processing] Raw data from Python endpoint:');
      console.log('[Timesheet Processing] Metadata:', data.metadata);
      console.log('[Timesheet Processing] Project codes:', Object.keys(data.consolidated_payload || {}));
      
      // Check for Supply Labour in each project
      if (data.consolidated_payload) {
        Object.entries(data.consolidated_payload).forEach(([projectCode, tasks]: [string, any]) => {
          const taskNames = (tasks as any[]).map(t => t.name);
          console.log(`[Timesheet Processing] Project ${projectCode} tasks:`, taskNames);
          if (!taskNames.includes('Supply Labour')) {
            console.warn(`[Timesheet Processing] WARNING: 'Supply Labour' not found in project ${projectCode}`);
          }
        });
      }

      updateStep(0, 'complete', 
        `Processed ${data.metadata.entries_processed} entries, ${data.metadata.projects_consolidated} projects`,
        data
      );
      setCurrentProgress(1);

      // Step 2: Load cached project data
      updateStep(1, 'processing', 'Loading cached project data...');
      const cachedProjectsList = await fetchCachedProjects();
      
      updateStep(1, 'complete', 
        `Loaded ${cachedProjectsList.length} cached projects`,
        { projectCount: cachedProjectsList.length }
      );
      setCurrentProgress(2);

      // Step 3: Filter payload and analyze matches
      updateStep(2, 'processing', 'Analyzing project matches...');
      const filtered = filterPayloadByMatches(data, cachedProjectsList);
      
      const matchedCount = Object.keys(filtered.consolidated_payload).length;
      const totalCount = data.metadata.projects_consolidated;
      const filteredCount = totalCount - matchedCount;
      
      updateStep(2, 'complete', 
        `Found ${matchedCount} matching projects, ${filteredCount} filtered out`,
        { matched: matchedCount, filtered: filteredCount }
      );
      setCurrentProgress(3);

      setProcessedData(data);
      setFilteredPayload(filtered);
      setCurrentStep('review');

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
    if (!filteredPayload) return;
    
    setCurrentStep('processing');
    setError(null);
    setStartTime(Date.now());
    setCurrentProgress(0);
    setTotalProgress(2); // 2 steps for Xero updates
    
    // Reset processing steps for Xero updates
    setProcessingSteps([
      { name: 'Creating/Updating Tasks', status: 'pending' },
      { name: 'Generating Report', status: 'pending' }
    ]);

    try {
      updateStep(0, 'processing', 'Creating/updating tasks in Xero...');
      setCurrentProgress(0.5);

      const response = await fetch('/api/xero/process-and-update-timesheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filteredPayload: filteredPayload
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Server responded with ${response.status}`);
      }

      const data: UnifiedProcessingResult = await response.json();

      if (!data.success) {
        // Check if it's a partial success (some tasks created, some failed)
        if (data.projectStandardization.tasksCreated > 0 && data.taskUpdates.tasksFailed > 0) {
          // Partial success - some tasks were created
          updateStep(0, 'error', 
            `Created ${data.projectStandardization.tasksCreated} tasks, but ${data.taskUpdates.tasksFailed} failed`,
            data.projectStandardization
          );
        } else if (data.taskUpdates.tasksFailed > 0) {
          // Complete failure - no tasks created
          updateStep(0, 'error', 
            `Failed to create ${data.taskUpdates.tasksFailed} tasks`,
            data.projectStandardization
          );
        } else {
          throw new Error('Processing failed');
        }
      } else {
        // Complete success
        updateStep(0, 'complete', 
          `Created/updated ${data.projectStandardization.tasksCreated} tasks`,
          data.projectStandardization
        );
      }
      setCurrentProgress(1);

      updateStep(1, 'complete', 
        'Report generated successfully',
        data.downloadableReport
      );
      setCurrentProgress(2);

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
    setFilteredPayload(null);
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
            {currentStep === 'complete' && results && (
              <>
                {results.success && <CheckCircleIcon className="h-8 w-8 text-green-500" />}
                {!results.success && results.projectStandardization.tasksCreated > 0 && (
                  <ExclamationTriangleIcon className="h-8 w-8 text-amber-500" />
                )}
                {!results.success && results.projectStandardization.tasksCreated === 0 && (
                  <XCircleIcon className="h-8 w-8 text-red-500" />
                )}
              </>
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
          {currentStep === 'review' && filteredPayload && (
            <div className="mt-6 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-800 mb-3">Timesheet Analysis Complete</h3>
                <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                  <div>
                    <span className="text-gray-600">Entries Processed:</span>
                    <span className="ml-2 font-medium text-gray-900">
                      {filteredPayload.metadata.entries_processed}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Matching Projects:</span>
                    <span className="ml-2 font-medium text-gray-900">
                      {filteredPayload.metadata.projects_consolidated}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Period:</span>
                    <span className="ml-2 font-medium text-gray-900">
                      {filteredPayload.metadata.period_range}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Filtered Out:</span>
                    <span className="ml-2 font-medium text-amber-600">
                      {filteredPayload.metadata.projects_filtered || 0} projects
                    </span>
                  </div>
                </div>
                <p className="text-xs text-blue-600">
                  Only projects matching your Xero data will be updated. Review the analysis below.
                </p>
              </div>

              {/* Project Matching Analysis */}
              <ProjectMatchingAnalyzer 
                timesheetData={filteredPayload}
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
                  onClick={handleConfirmXeroUpdate}
                  disabled={Object.keys(filteredPayload.consolidated_payload).length === 0}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {Object.keys(filteredPayload.consolidated_payload).length === 0 
                    ? 'No Matching Projects' 
                    : 'Update Xero Projects'
                  }
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
              <div className={`border rounded-lg p-4 ${
                results.success 
                  ? 'bg-green-50 border-green-200' 
                  : results.projectStandardization.tasksCreated > 0
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-red-50 border-red-200'
              }`}>
                <h3 className={`text-sm font-semibold mb-3 ${
                  results.success 
                    ? 'text-green-800' 
                    : results.projectStandardization.tasksCreated > 0
                      ? 'text-amber-800'
                      : 'text-red-800'
                }`}>
                  {results.success 
                    ? 'Processing Complete' 
                    : results.projectStandardization.tasksCreated > 0
                      ? 'Processing Completed with Errors'
                      : 'Processing Failed'
                  }
                </h3>
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
                    <span className={`ml-2 font-medium ${
                      results.projectStandardization.tasksCreated > 0 ? 'text-green-700' : 'text-gray-900'
                    }`}>
                      {results.projectStandardization.tasksCreated}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Tasks Failed:</span>
                    <span className={`ml-2 font-medium ${
                      results.taskUpdates.tasksFailed > 0 ? 'text-red-700' : 'text-gray-900'
                    }`}>
                      {results.taskUpdates.tasksFailed}
                    </span>
                  </div>
                </div>
                
                {/* Show error details if tasks failed */}
                {results.taskUpdates.tasksFailed > 0 && (results as any).errorSummary && (
                  <div className="mt-4 space-y-2">
                    <p className="text-sm font-medium text-gray-700">Error Details:</p>
                    {Object.entries((results as any).errorSummary).map(([error, tasks]: [string, any]) => (
                      <div key={error} className="text-xs bg-white bg-opacity-50 rounded p-2">
                        <p className="font-medium text-gray-700">{error}:</p>
                        <ul className="mt-1 space-y-0.5 text-gray-600">
                          {(tasks as string[]).slice(0, 3).map((task, idx) => (
                            <li key={idx}>• {task}</li>
                          ))}
                          {(tasks as string[]).length > 3 && (
                            <li className="text-gray-500">... and {(tasks as string[]).length - 3} more</li>
                          )}
                        </ul>
                      </div>
                    ))}
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
    </>
  );
} 