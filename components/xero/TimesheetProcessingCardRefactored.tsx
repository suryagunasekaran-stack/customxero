'use client';

import React, { useState, useEffect, useRef } from 'react';
import { CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import TenantConfirmationModal from './TenantConfirmationModal';
import FileUploadSection from './timesheet/FileUploadSection';
import ProcessingStepsDisplay from './timesheet/ProcessingStepsDisplay';
import ProcessingResults from './timesheet/ProcessingResults';
import { TimesheetProcessingController } from '../../lib/timesheet/TimesheetProcessingController';
import { ProcessingStatus, ProcessingStep, DirectProcessingResult, FilePreview, TenantInfo } from '../../lib/timesheet/types';
import { ReportService } from '../../lib/timesheet/services/ReportService';

interface TimesheetProcessingCardProps {
  disabled?: boolean;
}

export default function TimesheetProcessingCardRefactored({ disabled = false }: TimesheetProcessingCardProps) {
  // State management
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [results, setResults] = useState<DirectProcessingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [showTenantConfirmation, setShowTenantConfirmation] = useState(false);
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);
  const [loadingTenant, setLoadingTenant] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);

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

  const handleFileSelect = async (selectedFile: File) => {
    if (!controllerRef.current) return;

    setError(null);
    setLoadingTenant(true);

    try {
      const validation = await controllerRef.current.validateAndPrepareFile(selectedFile);
      
      if (!validation.isValid) {
        setError(validation.error || 'Invalid file');
        return;
      }

      setFile(selectedFile);
      setFilePreview(validation.preview);
      setShowTenantConfirmation(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingTenant(false);
    }
  };

  const handleConfirmProcessing = async () => {
    if (!controllerRef.current || !file || !tenantInfo) return;

    setShowTenantConfirmation(false);
    setStartTime(Date.now());

    try {
      await controllerRef.current.processTimesheet(file, tenantInfo);
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
    setFile(null);
    setResults(null);
    setError(null);
    setStartTime(null);
    setFilePreview(null);
    setTenantInfo(null);
    setProcessingSteps([]);
    setCurrentStepIndex(-1);
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
          {status === 'idle' && (
            <FileUploadSection
              onFileSelect={handleFileSelect}
              disabled={disabled}
              loading={loadingTenant}
              error={error}
            />
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