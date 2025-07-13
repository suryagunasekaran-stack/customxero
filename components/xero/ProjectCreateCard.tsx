'use client';

import React, { useState, useRef } from 'react';
import { PlusCircleIcon, CloudArrowUpIcon, DocumentArrowDownIcon } from '@heroicons/react/24/outline';
import ConfirmationDialog from '../ConfirmationDialog';
import { FunctionCardProps } from './types';
import { downloadJSON, downloadText } from '@/utils/download';
import { SuccessAlert, ErrorAlert } from '@/components/common/Alert';
import { FileUploadButton } from '@/components/common/FileUpload';

interface ProjectCreateCardProps extends FunctionCardProps {}

interface XeroProject {
  contactId: string;
  name: string;
  deadlineUtc?: string;
  estimateAmount?: number;
}

interface CreateProjectsRequest {
  projects: XeroProject[];
}

interface TaskCreationResult {
  taskName: string;
  success: boolean;
  error?: string;
  idempotencyKey?: string;
}

interface CreateResult {
  project: string;
  projectId: string;
  idempotencyKey?: string;
  success: boolean;
  tasksCreated?: TaskCreationResult[];
}

interface CreateError {
  project: string;
  error: string;
}

interface CreateProjectsResponse {
  success: boolean;
  message: string;
  results?: CreateResult[];
  errors?: CreateError[];
  summary?: {
    total: number;
    successful: number;
    failed: number;
  };
  downloadableReport?: {
    filename: string;
    content: string;
  };
  error?: string;
}

export default function ProjectCreateCard({ disabled = false }: ProjectCreateCardProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedProjects, setParsedProjects] = useState<XeroProject[]>([]);
  const [results, setResults] = useState<{ successful: CreateResult[]; failed: CreateError[] } | null>(null);
  const [filePreview, setFilePreview] = useState<string>('');
  const [downloadableReport, setDownloadableReport] = useState<{ filename: string; content: string } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Example JSON structure - supports both array and wrapped formats
  const exampleJson = `[
  {
    "contactId": "01234567-89ab-cdef-0123-456789abcdef",
    "name": "Kitchen Renovation Project",
    "estimateAmount": 15000.00
  },
  {
    "contactId": "01234567-89ab-cdef-0123-456789abcdef",
    "name": "Office Refurbishment",
    "estimateAmount": 8500.50,
    "deadlineUtc": "2025-12-31T23:59:59.000Z"
  },
  {
    "contactId": "98765432-10fe-dcba-9876-543210fedcba",
    "name": "Bathroom Upgrade",
    "estimateAmount": 3200.00
  }
]`;

  const validateAndParseJson = (jsonString: string): XeroProject[] | null => {
    try {
      const parsed = JSON.parse(jsonString);
      
      let projects: any[];
      
      // Handle both formats: direct array or wrapped in "projects" object
      if (Array.isArray(parsed)) {
        projects = parsed;
      } else if (parsed.projects && Array.isArray(parsed.projects)) {
        projects = parsed.projects;
      } else {
        throw new Error('JSON must be either an array of projects or contain a "projects" array');
      }

      if (projects.length === 0) {
        throw new Error('At least one project is required');
      }

      // Validate each project
      for (let i = 0; i < projects.length; i++) {
        const project = projects[i];
        if (!project.contactId || typeof project.contactId !== 'string') {
          throw new Error(`Project ${i + 1}: contactId is required and must be a string`);
        }
        if (!project.name || typeof project.name !== 'string') {
          throw new Error(`Project ${i + 1}: name is required and must be a string`);
        }
        if (project.deadlineUtc && typeof project.deadlineUtc !== 'string') {
          throw new Error(`Project ${i + 1}: deadlineUtc must be a valid ISO date string`);
        }
        if (project.estimateAmount && typeof project.estimateAmount !== 'number') {
          throw new Error(`Project ${i + 1}: estimateAmount must be a number`);
        }
      }

      return projects;
    } catch (err: any) {
      throw new Error(`Invalid JSON: ${err.message}`);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setError(null);
    setParsedProjects([]);
    setFilePreview('');
    
    // Read file content
    try {
      const content = await readFileContent(file);
      setFilePreview(content.substring(0, 500) + (content.length > 500 ? '...' : ''));
      
      const projects = validateAndParseJson(content);
      if (projects) {
        setParsedProjects(projects);
      }
    } catch (err: any) {
      setError(`Error reading file: ${err.message}`);
    }
  };

  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

  // Download report function
  const downloadReport = (report: { filename: string; content: string }) => {
    try {
      downloadText(report.content, report.filename);
      
      console.log(`[Project Creation] Downloaded report: ${report.filename}`);
    } catch (error) {
      console.error('[Project Creation] Failed to download report:', error);
      setError('Failed to download report. Please try again.');
    }
  };

  const handleCreateProjects = async () => {
    if (!selectedFile) {
      setError('Please select a JSON file');
      return;
    }

    try {
      const content = await readFileContent(selectedFile);
      const projects = validateAndParseJson(content);
      if (!projects) return;

      setIsProcessing(true);
      setError(null);
      setSuccess(null);
      setResults(null);
      setDownloadableReport(null);

      const response = await fetch('/api/xero/projects/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projects }),
      });

      const data: CreateProjectsResponse = await response.json();

      if (data.success) {
        const successMsg = data.message || `Successfully created ${data.summary?.successful || 0} project(s)`;
        setSuccess(successMsg);
        
        // Set results for detailed display
        if (data.results || data.errors) {
          setResults({
            successful: data.results || [],
            failed: data.errors || []
          });
        }
        
        // Store and auto-download report
        if (data.downloadableReport) {
          setDownloadableReport(data.downloadableReport);
          downloadReport(data.downloadableReport);
        }
        
        // Clear form on complete success
        if (data.summary?.failed === 0) {
          setSelectedFile(null);
          setParsedProjects([]);
          setFilePreview('');
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }
      } else {
        setError(data.error || data.message || 'Failed to create projects');
        if (data.errors) {
          setResults({
            successful: data.results || [],
            failed: data.errors
          });
        }
        
        // Store and auto-download report even for failures
        if (data.downloadableReport) {
          setDownloadableReport(data.downloadableReport);
          downloadReport(data.downloadableReport);
        }
      }
    } catch (err: any) {
      console.error('Error creating projects:', err);
      setError('Network error occurred while creating projects');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirm = () => {
    setShowConfirmation(false);
    handleCreateProjects();
  };

  const handleSubmit = () => {
    if (!selectedFile) {
      setError('Please select a JSON file');
      return;
    }

    if (parsedProjects.length > 0) {
      setShowConfirmation(true);
    } else {
      setError('No valid projects found in the file');
    }
  };

  const downloadExample = () => {
    downloadJSON(JSON.parse(exampleJson), 'example-projects.json');
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-200">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Create Projects</h2>
              <p className="text-sm text-gray-500 mt-1">
                Create new projects in Xero using JSON data
              </p>
            </div>
            <div className="p-2 bg-blue-100 rounded-lg">
              <PlusCircleIcon className="h-6 w-6 text-blue-600" />
            </div>
          </div>

          {/* Success Message */}
          {success && <SuccessAlert message={success} onClose={() => setSuccess(null)} />}

          {/* Error Message */}
          {error && <ErrorAlert message={error} onClose={() => setError(null)} />}

          {/* Results Display */}
          {results && (results.successful.length > 0 || results.failed.length > 0) && (
            <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-900">Creation Results</h3>
                {downloadableReport && (
                  <button
                    onClick={() => downloadReport(downloadableReport)}
                    className="inline-flex items-center px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
                  >
                    <DocumentArrowDownIcon className="w-3 h-3 mr-1" />
                    Download Report
                  </button>
                )}
              </div>
              
              {results.successful.length > 0 && (
                <div className="mb-3">
                  <h4 className="text-xs font-medium text-green-700 mb-1">Successfully Created:</h4>
                                     <ul className="space-y-2">
                     {results.successful.map((result, index) => (
                       <li key={index} className="text-xs">
                         <div className="text-green-600">
                           ✓ {result.project} (ID: {result.projectId})
                         </div>
                         {result.idempotencyKey && (
                           <div className="text-gray-500 ml-2 font-mono text-xs">
                             Key: {result.idempotencyKey.substring(0, 8)}...
                           </div>
                         )}
                         {result.tasksCreated && result.tasksCreated.length > 0 && (
                           <div className="ml-4 mt-1 space-y-1">
                             <div className="text-gray-700 font-medium">Tasks:</div>
                             {result.tasksCreated.map((task, taskIndex) => (
                               <div key={taskIndex} className={`ml-2 ${task.success ? 'text-green-600' : 'text-red-600'}`}>
                                 {task.success ? '✓' : '✗'} {task.taskName}
                                 {!task.success && task.error && (
                                   <div className="text-red-500 text-xs ml-2">{task.error}</div>
                                 )}
                               </div>
                             ))}
                           </div>
                         )}
                       </li>
                     ))}
                   </ul>
                </div>
              )}
              
              {results.failed.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-red-700 mb-1">Failed:</h4>
                  <ul className="space-y-1">
                    {results.failed.map((error, index) => (
                      <li key={index} className="text-xs text-red-600">
                        ✗ {error.project}: {error.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Description */}
          <div className="mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-2">What this does:</h3>
              <ul className="space-y-1 text-sm text-gray-600">
                                 <li className="flex items-start">
                   <span className="text-gray-400 mr-2">•</span>
                   <span>Creates multiple projects in Xero from JSON data</span>
                 </li>
                 <li className="flex items-start">
                   <span className="text-gray-400 mr-2">•</span>
                   <span>Auto-creates 5 standard tasks per project</span>
                 </li>
                 <li className="flex items-start">
                   <span className="text-gray-400 mr-2">•</span>
                   <span>Uses idempotency keys to prevent duplicates</span>
                 </li>
                 <li className="flex items-start">
                   <span className="text-gray-400 mr-2">•</span>
                   <span>Provides detailed success and error reporting</span>
                 </li>
                 <li className="flex items-start">
                   <span className="text-gray-400 mr-2">•</span>
                   <span>Generates downloadable CSV report with full details</span>
                 </li>
              </ul>
            </div>
          </div>

          {/* File Upload Section */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">
                Project JSON File
              </label>
              <button
                type="button"
                onClick={downloadExample}
                className="text-xs text-blue-600 hover:text-blue-700 focus:outline-none"
              >
                Download Example
              </button>
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
              disabled={isProcessing}
            />
            
            <div 
              onClick={triggerFileInput}
              className="w-full flex flex-col items-center justify-center px-6 py-8 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-all duration-200 group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CloudArrowUpIcon className="h-12 w-12 text-gray-400 group-hover:text-gray-500 mb-3" />
              <span className="text-sm font-medium text-gray-700 group-hover:text-gray-800">
                {selectedFile ? selectedFile.name : 'Click to upload JSON file'}
              </span>
              <span className="text-xs text-gray-500 mt-1">
                JSON files only (.json) - Supports arrays and wrapped formats
              </span>
            </div>

            {/* File Preview */}
            {filePreview && (
              <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <h4 className="text-xs font-medium text-gray-700 mb-2">File Preview:</h4>
                <pre className="text-xs text-gray-600 font-mono overflow-x-auto">{filePreview}</pre>
              </div>
            )}

            {parsedProjects.length > 0 && (
              <p className="mt-2 text-xs text-green-600">
                ✓ Valid JSON with {parsedProjects.length} project{parsedProjects.length === 1 ? '' : 's'}
              </p>
            )}
          </div>

          {/* Action Button */}
          <button
            onClick={handleSubmit}
            disabled={disabled || isProcessing || !selectedFile}
            className="w-full inline-flex items-center justify-center px-4 py-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
          >
            {isProcessing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                Creating Projects...
              </>
            ) : (
              <>
                <PlusCircleIcon className="h-4 w-4 mr-2" />
                Create Projects
              </>
            )}
          </button>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showConfirmation}
        onClose={() => setShowConfirmation(false)}
        onConfirm={handleConfirm}
        title="Create Xero Projects"
        message="This will create the specified projects in your Xero organisation. Please review the details before proceeding."
        details={[
          { label: 'File', value: selectedFile?.name || 'No file selected' },
          { label: 'Projects to create', value: `${parsedProjects.length} project${parsedProjects.length === 1 ? '' : 's'}` },
          { label: 'Project names', value: parsedProjects.map(p => p.name).join(', ') },
          { label: 'Target', value: 'Xero Projects API' }
        ]}
        confirmText="Create Projects"
        type="info"
      />
    </>
  );
} 