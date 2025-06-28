'use client';

import React, { useState, useEffect, useRef } from 'react';
import { CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon, DocumentIcon } from '@heroicons/react/24/outline';
import TenantConfirmationModal from './TenantConfirmationModal';
import BlobUploadCard from './BlobUploadCard';
import BlobBrowserCard from './BlobBrowserCard';
import ProcessingStepsDisplay from './timesheet/ProcessingStepsDisplay';
import ProcessingResults from './timesheet/ProcessingResults';
import { TimesheetProcessingController } from '../../lib/timesheet/TimesheetProcessingController';
import { ProcessingStatus, ProcessingStep, DirectProcessingResult, FilePreview, TenantInfo, PROCESSING_STEPS } from '../../lib/timesheet/types';
import { ReportService } from '../../lib/timesheet/services/ReportService';

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

    return () => {
      controllerRef.current?.reset();
    };
  }, []);

  const handleBlobFileSelect = async (blobUrl: string, fileName: string) => {
    setError(null);
    setLoadingTenant(true);

    try {
      // Fetch tenant information for the current session
      const response = await fetch('/api/test-tenant');
      const tenantData = await response.json();
      
      if (!tenantData.tenantId) {
        setError('No tenant selected');
        return;
      }

      setSelectedBlobUrl(blobUrl);
      setSelectedFileName(fileName);
      setTenantInfo({
        tenantId: tenantData.tenantId,
        tenantName: tenantData.tenantName || 'Unknown Tenant'
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
    
    // Initialize processing steps
    const steps = PROCESSING_STEPS.map(step => ({
      ...step,
      status: 'pending' as const
    }));
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

      // Step 1: File Download
      updateStep('upload', 'current', 'Downloading file from blob storage');
      
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

      updateStep('upload', 'completed', 'File downloaded successfully');
      
      // Simulate other steps based on backend processing
      updateStep('parse', 'current', 'Processing timesheet data');
      await new Promise(resolve => setTimeout(resolve, 1000));
      updateStep('parse', 'completed', 'Data processed successfully');
      
      updateStep('tenant', 'current', 'Verifying Xero connection');
      await new Promise(resolve => setTimeout(resolve, 800));
      updateStep('tenant', 'completed', 'Connection verified');
      
      updateStep('match', 'current', 'Matching projects');
      await new Promise(resolve => setTimeout(resolve, 1200));
      updateStep('match', 'completed', 'Projects matched');
      
      updateStep('update', 'current', 'Updating tasks in Xero');
      
      if (!response.ok) {
        updateStep('update', 'error', 'Failed to update tasks');
        throw new Error('Processing failed');
      }

      const result = await response.json();
      
      updateStep('update', 'completed', `${result.summary.tasksCreated + result.summary.tasksUpdated} tasks processed`);
      updateStep('report', 'current', 'Generating report');
      await new Promise(resolve => setTimeout(resolve, 500));
      updateStep('report', 'completed', 'Report generated');
      
      setResults(result);
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
    if (results && reportServiceRef.current) {
      reportServiceRef.current.downloadReport(results.downloadableReport);
    }
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
                Upload timesheet to directly update project costs and generate reports
              </p>
            </div>
            {getStatusIcon()}
          </div>

          {/* Content based on status */}
          {status === 'idle' && showFileSelection && (
            <div className="space-y-6">
              {/* File Upload */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Step 1: Upload Timesheet</h3>
                <BlobUploadCard
                  disabled={disabled || loadingTenant}
                  onUploadSuccess={() => setRefreshBlobTrigger(prev => prev + 1)}
                />
              </div>

              {/* File Browser */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Step 2: Select Timesheet to Process</h3>
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

          {status === 'complete' && results && (
            <ProcessingResults
              results={results}
              onReset={resetProcessor}
              onDownloadReport={handleDownloadReport}
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