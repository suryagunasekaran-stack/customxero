'use client';

import React, { useState } from 'react';
import { CloudArrowUpIcon, DocumentArrowDownIcon, CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import ProgressBar from '../ProgressBar';
import ConfirmationDialog from '../ConfirmationDialog';

interface DirectProcessingResult {
  success: boolean;
  summary: {
    entriesProcessed: number;
    projectsAnalyzed: number;
    projectsMatched: number;
    tasksCreated: number;
    tasksUpdated: number;
    tasksFailed: number;
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

export default function TimesheetProcessingCard({ disabled = false }: { disabled?: boolean }) {
  const [status, setStatus] = useState<'idle' | 'processing' | 'complete' | 'error'>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [results, setResults] = useState<DirectProcessingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
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
      setShowConfirmation(true);
    }
  };

  const handleProcessFile = async () => {
    if (!file) return;
    
    setStatus('processing');
    setError(null);
    setStartTime(Date.now());

    try {
      console.log('[Streamlined Processing] Starting direct processing for:', file.name);
      
      const formData = new FormData();
      formData.append('file', file);

      // Call the new streamlined endpoint
      const response = await fetch('/api/xero/process-timesheet-direct', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(errorData.error || `Server responded with ${response.status}`);
      }

      const data: DirectProcessingResult = await response.json();

      if (data.success) {
        setResults(data);
        setStatus('complete');
        
        // Auto-download report
        downloadReport(data.downloadableReport);
        
        console.log('[Streamlined Processing] Success:', data.summary);
      } else {
        throw new Error(data.error || 'Processing failed');
      }

    } catch (error: any) {
      setStatus('error');
      setError(error.message);
      console.error('[Streamlined Processing] Error:', error);
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
                <div className="flex items-center gap-3">
                  <div className="relative w-5 h-5">
                    <div className="absolute inset-0 rounded-full border-2 border-blue-200"></div>
                    <div className="absolute inset-0 rounded-full border-2 border-blue-600 border-t-transparent animate-spin"></div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-blue-800">Processing Timesheet</h3>
                    <p className="text-xs text-blue-600">
                      {tenantInfo 
                        ? `Updating projects in "${tenantInfo.tenantName}"...`
                        : 'Analyzing data, matching projects, and updating Xero tasks...'
                      }
                    </p>
                  </div>
                </div>
                
                {filePreview && (
                  <div className="mt-3 text-xs text-blue-700">
                    Processing: <strong>{filePreview.fileName}</strong> ({filePreview.fileSize})
                  </div>
                )}
              </div>

              <ProgressBar 
                current={1}
                total={1}
                startTime={startTime || undefined}
                message="Direct processing in progress..."
              />
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
                      results.summary.tasksFailed > 0 ? 'text-red-700' : 'text-gray-900'
                    }`}>
                      {results.summary.tasksFailed}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Processing Time:</span>
                    <span className="ml-2 font-medium text-gray-900">
                      {(results.summary.processingTimeMs / 1000).toFixed(1)}s
                    </span>
                  </div>
                </div>

                {/* Show failed tasks if any */}
                {results.summary.tasksFailed > 0 && (
                  <div className="mt-3 p-3 bg-white bg-opacity-50 rounded">
                    <p className="text-xs font-medium text-gray-700 mb-2">Failed Tasks:</p>
                    <div className="max-h-32 overflow-y-auto">
                      {results.results
                        .filter(r => !r.success)
                        .slice(0, 5)
                        .map((result, idx) => (
                          <div key={idx} className="text-xs text-gray-600 mb-1">
                            • {result.projectCode} - {result.taskName}: {result.error}
                          </div>
                        ))}
                      {results.results.filter(r => !r.success).length > 5 && (
                        <div className="text-xs text-gray-500">
                          ... and {results.results.filter(r => !r.success).length - 5} more (see report)
                        </div>
                      )}
                    </div>
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

      {/* Confirmation Dialog - File Upload */}
      <ConfirmationDialog
        isOpen={showConfirmation}
        onClose={() => setShowConfirmation(false)}
        onConfirm={() => {
          setShowConfirmation(false);
          handleProcessFile();
        }}
        title="Confirm Timesheet Processing"
        message={
          tenantInfo 
            ? `This will process the timesheet and update projects in "${tenantInfo.tenantName}". The process typically takes 30-60 seconds and you'll get a detailed report when complete.`
            : "This will immediately process the timesheet and update your Xero projects. The process typically takes 30-60 seconds and you'll get a detailed report when complete."
        }
        details={[
          ...(filePreview ? [
            { label: 'File', value: filePreview.fileName },
            { label: 'Size', value: filePreview.fileSize },
            { label: 'Modified', value: filePreview.lastModified }
          ] : []),
          ...(tenantInfo ? [
            { label: 'Xero Company', value: tenantInfo.tenantName },
            { label: 'Tenant ID', value: tenantInfo.tenantId.substring(0, 8) + '...' }
          ] : [])
        ]}
        confirmText="Start Processing"
        type="warning"
      />
    </>
  );
} 