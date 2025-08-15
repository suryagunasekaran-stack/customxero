'use client';

import React, { useState, useEffect, useRef } from 'react';
import { CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon, DocumentIcon } from '@heroicons/react/24/outline';
import TenantConfirmationModal from './TenantConfirmationModal';
import BlobUploadCard from './BlobUploadCard';
import BlobBrowserCard from './BlobBrowserCard';
import ProcessingStepsDisplay from './timesheet/ProcessingStepsDisplay';
import ProcessingResults from './timesheet/ProcessingResults';
import ProjectsSyncStep from './timesheet/ProjectsSyncStep';
import XeroUpdatePreview from './timesheet/XeroUpdatePreview';
import XeroUpdateResults from './timesheet/XeroUpdateResults';
import { TimesheetProcessingController } from '../../lib/timesheet/TimesheetProcessingController';
import { ProcessingStatus, ProcessingStep, DirectProcessingResult, FilePreview, TenantInfo } from '../../lib/timesheet/types';
import { ReportService } from '../../lib/timesheet/services/ReportService';
import { ExcelReportService } from '../../lib/timesheet/services/ExcelReportService';

interface TimesheetProcessingCardProps {
  disabled?: boolean;
}

export default function TimesheetProcessingCardRefactored({ disabled = false }: TimesheetProcessingCardProps) {
  // State management
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [selectedBlobUrl, setSelectedBlobUrl] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [results, setResults] = useState<DirectProcessingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [showTenantConfirmation, setShowTenantConfirmation] = useState(false);
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);
  const [loadingTenant, setLoadingTenant] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [refreshBlobTrigger, setRefreshBlobTrigger] = useState(0);
  const [showFileSelection, setShowFileSelection] = useState(true);
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [syncCompleted, setSyncCompleted] = useState(false);
  const [showUpdatePreview, setShowUpdatePreview] = useState(false);
  const [isUpdatingXero, setIsUpdatingXero] = useState(false);
  const [updateResults, setUpdateResults] = useState<any | null>(null);
  const [processingResponse, setProcessingResponse] = useState<any | null>(null);

  // Controller reference
  const controllerRef = useRef<TimesheetProcessingController | null>(null);
  const reportServiceRef = useRef<ReportService>(new ReportService());

  // Initialize controller
  useEffect(() => {
    controllerRef.current = new TimesheetProcessingController({
      onStatusChange: setStatus,
      onStepUpdate: (steps) => {
        setProcessingSteps(steps);
        const currentIndex = steps.findIndex(s => s.status === 'current');
        setCurrentStepIndex(currentIndex);
      },
      onError: setError,
      onResults: setResults,
      onTenantInfo: setTenantInfo
    });

    // Fetch current tenant info on mount
    fetchCurrentTenant();

    return () => {
      controllerRef.current?.reset();
    };
  }, []);

  const fetchCurrentTenant = async () => {
    try {
      const response = await fetch('/api/test-tenant');
      const tenantData = await response.json();
      
      if (tenantData.effectiveTenantId) {
        setCurrentTenantId(tenantData.effectiveTenantId);
        setTenantInfo({
          tenantId: tenantData.effectiveTenantId,
          tenantName: tenantData.selectedTenantName || tenantData.xeroOrgName || 'Unknown Tenant'
        });
      }
    } catch (err) {
      console.error('Error fetching tenant:', err);
    }
  };

  const handleBlobFileSelect = async (blobUrl: string, fileName: string) => {
    setError(null);
    setLoadingTenant(true);

    try {
      // Fetch tenant information for the current session
      const response = await fetch('/api/test-tenant');
      const tenantData = await response.json();
      
      if (!tenantData.effectiveTenantId) {
        setError('No tenant selected');
        return;
      }

      setSelectedBlobUrl(blobUrl);
      setSelectedFileName(fileName);
      setTenantInfo({
        tenantId: tenantData.effectiveTenantId,
        tenantName: tenantData.selectedTenantName || tenantData.xeroOrgName || 'Unknown Tenant'
      });
      setFilePreview({
        fileName: fileName,
        fileSize: '0 KB', // We can update this if needed
        lastModified: new Date().toISOString()
      });
      setShowFileSelection(false);
      setShowTenantConfirmation(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingTenant(false);
    }
  };

  const handleConfirmProcessing = async () => {
    if (!selectedBlobUrl || !selectedFileName || !tenantInfo) return;

    setShowTenantConfirmation(false);
    setStartTime(Date.now());
    setStatus('processing');
    
    // Initialize processing steps - only show file processing
    const steps: ProcessingStep[] = [
      {
        id: 'upload',
        title: 'Processing Timesheet',
        description: 'Sending timesheet to backend for processing',
        status: 'pending' as const
      }
    ];
    setProcessingSteps(steps);
    setCurrentStepIndex(0);

    try {
      // Update steps as processing progresses
      const updateStep = (stepId: string, status: 'current' | 'completed' | 'error', details?: string) => {
        setProcessingSteps(prev => {
          const updated = [...prev];
          const index = updated.findIndex(s => s.id === stepId);
          if (index !== -1) {
            updated[index] = { 
              ...updated[index], 
              status,
              details,
              completedTime: status === 'completed' ? Date.now() : undefined
            };
            if (status === 'current') {
              setCurrentStepIndex(index);
            }
          }
          return updated;
        });
      };

      // Step 1: Send file to backend
      updateStep('upload', 'current', 'Sending file to backend for processing');
      
      // Call the backend API with the blob URL
      const response = await fetch('/api/xero/process-timesheet-direct', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          blobUrl: selectedBlobUrl,
          fileName: selectedFileName,
          tenantId: tenantInfo.tenantId
        })
      });

      if (!response.ok) {
        updateStep('upload', 'error', 'Failed to process timesheet');
        throw new Error('Processing failed');
      }

      const result = await response.json();
      
      updateStep('upload', 'completed', 'Timesheet processed successfully');
      
      // Process the backend response
      if (result.success) {
        // Extract data from the backend response
        // Use summary values if available (correct counts), fallback to array lengths
        const tasksToUpdate = result.summary?.tasksUpdated || result.changes?.updates?.length || 0;
        const tasksToCreate = result.summary?.tasksCreated || result.changes?.creates?.length || 0;
        const totalChanges = result.summary?.total_changes || result.metadata?.total_changes || 0;
        const closedProjectsCount = result.closed_projects_with_changes?.length || 0;
        
        // Create downloadable JSON response
        const jsonContent = JSON.stringify(result, null, 2);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        
        setResults({
          success: true,
          summary: {
            entriesProcessed: result.summary?.entriesProcessed || result.metadata?.entries_processed || 0,
            projectsAnalyzed: result.summary?.projectsAnalyzed || result.summary?.total_projects_processed || result.metadata?.projects_processed || 0,
            projectsMatched: result.summary?.projectsMatched || result.summary?.total_projects_processed || 0,
            tasksCreated: result.summary?.tasksCreated || tasksToCreate,
            tasksUpdated: result.summary?.tasksUpdated || tasksToUpdate,
            tasksFailed: 0,
            actualTasksFailed: 0,
            projectsNotFound: 0,
            processingTimeMs: 0,
            closedProjectsAffected: result.summary?.closed_projects_affected || closedProjectsCount
          },
          results: [],
          closedProjectsWithChanges: result.closed_projects_with_changes || [],
          downloadableReport: {
            filename: `timesheet-processing-response-${timestamp}.json`,
            content: jsonContent
          }
        });
        
        // Store the full response for future use
        console.log('Timesheet processing response:', result);
        setProcessingResponse(result);
      } else {
        throw new Error(result.message || 'Processing failed');
      }
      
      setStatus('complete');
    } catch (err: any) {
      setError(err.message);
      setStatus('error');
    }
  };

  const handleCancelProcessing = () => {
    setShowTenantConfirmation(false);
    resetProcessor();
  };

  const handleDownloadReport = () => {
    if (results && results.downloadableReport) {
      let blob: Blob;
      
      // Check if it's an Excel file based on content type
      if (results.downloadableReport.contentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
        // Excel file - decode from base64
        const binaryString = atob(results.downloadableReport.content);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        blob = new Blob([bytes], { type: results.downloadableReport.contentType });
      } else {
        // Default to JSON
        blob = new Blob([results.downloadableReport.content], { type: 'application/json' });
      }
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = results.downloadableReport.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handleDownloadRawResponse = () => {
    if (processingResponse && processingResponse.rawBackendResponse) {
      const blob = new Blob([processingResponse.rawBackendResponse.content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = processingResponse.rawBackendResponse.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handleShowUpdatePreview = () => {
    setShowUpdatePreview(true);
  };

  const handleCancelUpdate = () => {
    setShowUpdatePreview(false);
  };

  const handleApplyXeroUpdates = async () => {
    if (!processingResponse || !currentTenantId) return;

    setIsUpdatingXero(true);
    
    try {
      // Filter out changes for closed projects
      const closedProjectIds = new Set(
        processingResponse.closed_projects_with_changes?.map((p: any) => p.projectId) || []
      );
      
      const updates = processingResponse.changes.updates.filter(
        (update: any) => !closedProjectIds.has(update.projectId)
      );
      
      const creates = processingResponse.changes.creates.filter(
        (create: any) => !closedProjectIds.has(create.projectId)
      );

      const response = await fetch('/api/xero/apply-updates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantId: currentTenantId,
          updates,
          creates
        })
      });

      if (!response.ok) {
        throw new Error('Failed to apply updates to Xero');
      }

      const result = await response.json();
      setUpdateResults(result);
      setShowUpdatePreview(false);
      
    } catch (err: any) {
      setError(err.message);
      setShowUpdatePreview(false);
    } finally {
      setIsUpdatingXero(false);
    }
  };

  const handleCloseUpdateResults = () => {
    setUpdateResults(null);
    resetProcessor();
  };

  const handleDownloadUpdateReport = () => {
    if (!updateResults || !processingResponse) return;
    
    // Create Excel report
    const excelReportService = new ExcelReportService();
    const excelBuffer = excelReportService.generateXeroUpdateReport({
      updateSummary: updateResults,
      originalChanges: {
        updates: processingResponse.changes.updates,
        creates: processingResponse.changes.creates
      },
      closedProjectsSkipped: processingResponse.closed_projects_with_changes
    });
    
    // Convert buffer to base64
    const base64 = Buffer.from(excelBuffer).toString('base64');
    
    // Download Excel file
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = excelReportService.generateReportFilename('xero-update-report');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const resetProcessor = () => {
    setStatus('idle');
    setSelectedBlobUrl(null);
    setSelectedFileName(null);
    setResults(null);
    setError(null);
    setStartTime(null);
    setFilePreview(null);
    setTenantInfo(null);
    setProcessingSteps([]);
    setCurrentStepIndex(-1);
    setShowFileSelection(true);
    setShowUpdatePreview(false);
    setUpdateResults(null);
    setProcessingResponse(null);
    controllerRef.current?.reset();
  };

  const getStatusIcon = () => {
    if (status !== 'complete' || !results) return null;

    if (results.success) {
      return <CheckCircleIcon className="h-8 w-8 text-green-500" />;
    }
    if (results.summary.tasksCreated > 0) {
      return <ExclamationTriangleIcon className="h-8 w-8 text-amber-500" />;
    }
    return <XCircleIcon className="h-8 w-8 text-red-500" />;
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
                Sync projects, upload timesheet, and update project costs in Xero
              </p>
            </div>
            {getStatusIcon()}
          </div>

          {/* Content based on status */}
          {status === 'idle' && showFileSelection && (
            <div className="space-y-6">
              {/* Step 1: Sync Projects */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Step 1: Sync Xero Projects</h3>
                {currentTenantId && tenantInfo ? (
                  <ProjectsSyncStep
                    tenantId={currentTenantId}
                    tenantName={tenantInfo.tenantName}
                    disabled={disabled}
                    onSyncComplete={(success, projectCount) => {
                      setSyncCompleted(true);
                      if (!success) {
                        setError('Project sync failed, but you can still proceed');
                      }
                    }}
                  />
                ) : (
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <p className="text-sm text-gray-500">Loading tenant information...</p>
                  </div>
                )}
              </div>

              {/* Step 2: File Upload */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Step 2: Upload Timesheet</h3>
                <BlobUploadCard
                  disabled={disabled || loadingTenant}
                  onUploadSuccess={() => setRefreshBlobTrigger(prev => prev + 1)}
                />
              </div>

              {/* Step 3: File Browser */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Step 3: Select Timesheet to Process</h3>
                <BlobBrowserCard
                  disabled={disabled || loadingTenant}
                  refreshTrigger={refreshBlobTrigger}
                  onFileSelect={handleBlobFileSelect}
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}
            </div>
          )}

          {status === 'processing' && (
            <ProcessingStepsDisplay
              steps={processingSteps}
              currentStepIndex={currentStepIndex}
              startTime={startTime}
              filePreview={filePreview ? {
                fileName: filePreview.fileName,
                fileSize: filePreview.fileSize
              } : null}
              tenantName={tenantInfo?.tenantName}
            />
          )}

          {status === 'complete' && results && !showUpdatePreview && !updateResults && (
            <ProcessingResults
              results={results}
              onReset={resetProcessor}
              onDownloadReport={handleDownloadReport}
              onDownloadRawResponse={handleDownloadRawResponse}
              onProceedToUpdate={handleShowUpdatePreview}
              showUpdateButton={true}
              hasRawResponse={!!processingResponse?.rawBackendResponse}
            />
          )}

          {showUpdatePreview && processingResponse && (
            <XeroUpdatePreview
              updates={processingResponse.changes.updates || []}
              creates={processingResponse.changes.creates || []}
              closedProjectsCount={processingResponse.closed_projects_with_changes?.length || 0}
              onConfirm={handleApplyXeroUpdates}
              onCancel={handleCancelUpdate}
              isUpdating={isUpdatingXero}
            />
          )}

          {updateResults && (
            <XeroUpdateResults
              results={updateResults}
              onClose={handleCloseUpdateResults}
              onDownloadReport={handleDownloadUpdateReport}
            />
          )}

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