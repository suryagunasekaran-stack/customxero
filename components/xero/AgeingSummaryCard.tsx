'use client';

import React, { useState } from 'react';
import { ChartBarIcon, DocumentTextIcon, ArrowDownTrayIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import BlobBrowserCard from './BlobBrowserCard';

interface AgeingSummaryCardProps {
  disabled?: boolean;
}

interface XeroProject {
  projectId: string;
  name: string;
  status: string;
  contactId: string;
  currencyCode: string;
  totalInvoiced: number;
  totalToBeInvoiced: number;
  projectAmountInvoiced: number;
  deadlineUtc?: string;
  estimate: number;
}

interface ProjectAnalysisResult {
  project_id: string;
  project_name: string;
  job_code: string;
  found_in_excel: boolean;
  rows_found: number;
  latest_date: string | null;
  date_column: string | null;
  days_since: number | null;
}

interface ProcessingResult {
  success: boolean;
  message?: string;
  file_name?: string;
  tenant_info?: {
    tenant_id: string;
    tenant_name: string;
  };
  excel_data?: {
    columns: string[];
    row_count: number;
    sample_data: any[];
  };
  project_analysis?: {
    total_projects: number;
    projects_found_in_excel: number;
    projects_not_found: number;
    results: ProjectAnalysisResult[];
  };
  error?: string;
  timestamp?: string;
}

export default function AgeingSummaryCard({ disabled = false }: AgeingSummaryCardProps) {
  const [step, setStep] = useState<'fetch-projects' | 'select-file' | 'processing' | 'complete'>('fetch-projects');
  const [projects, setProjects] = useState<XeroProject[]>([]);
  const [selectedBlobUrl, setSelectedBlobUrl] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [processingResult, setProcessingResult] = useState<ProcessingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Step 1: Fetch projects from Xero API
  const fetchProjects = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/xero/projects?states=INPROGRESS');
      
      if (!response.ok) {
        const errorData = await response.text();
        console.error('Error response:', errorData);
        throw new Error('Failed to fetch projects from Xero');
      }
      
      const data = await response.json();
      setProjects(data.projects || []);
      setStep('select-file');
      
      console.log('Fetched projects:', data);
      return data.projects || [];
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch projects');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // Handle blob file selection
  const handleBlobFileSelect = (blobUrl: string, fileName: string) => {
    setSelectedBlobUrl(blobUrl);
    setSelectedFileName(fileName);
  };

  // Step 2: Process projects with selected file
  const processProjects = async () => {
    if (!selectedBlobUrl || projects.length === 0) {
      setError('Please select a file and ensure projects are fetched');
      return;
    }

    setIsLoading(true);
    setError(null);
    setStep('processing');

    try {
      const payload = {
        blobUrl: selectedBlobUrl,
        fileName: selectedFileName,
        projects: projects,
        projectCount: projects.length,
        timestamp: new Date().toISOString()
      };

      const response = await fetch('/api/process-projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(errorData || 'Failed to process projects');
      }

      const result = await response.json();
      setProcessingResult(result);
      setStep('complete');
      
      console.log('Processing result:', result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process projects');
      setStep('select-file');
    } finally {
      setIsLoading(false);
    }
  };

  // Reset component
  const handleReset = () => {
    setStep('fetch-projects');
    setProjects([]);
    setSelectedBlobUrl(null);
    setSelectedFileName(null);
    setProcessingResult(null);
    setError(null);
  };

  // Export to Excel
  const exportToExcel = async () => {
    if (!processingResult || !processingResult.project_analysis) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/export/ageing-analysis-excel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          analysis: processingResult.project_analysis,
          fileName: processingResult.file_name,
          tenant: processingResult.tenant_info,
          timestamp: processingResult.timestamp,
        }),
      });

      if (!response.ok) throw new Error('Failed to generate Excel');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `project-ageing-analysis-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to export to Excel');
    } finally {
      setIsLoading(false);
    }
  };

  // Export to PDF
  const exportToPDF = async () => {
    if (!processingResult || !processingResult.project_analysis) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/export/ageing-analysis-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          analysis: processingResult.project_analysis,
          fileName: processingResult.file_name,
          tenant: processingResult.tenant_info,
          timestamp: processingResult.timestamp,
        }),
      });

      if (!response.ok) throw new Error('Failed to generate PDF');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `project-ageing-analysis-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to export to PDF');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-200">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Ageing Summary Report</h2>
            <p className="text-sm text-gray-500 mt-1">
              Analyze project activity and generate ageing reports
            </p>
          </div>
          <div className="p-2 bg-gray-100 rounded-lg">
            <ChartBarIcon className="h-6 w-6 text-gray-600" />
          </div>
        </div>

        {/* Step Indicator */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs">
            <span className={`px-2 py-1 rounded-full ${step === 'fetch-projects' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
              1. Fetch Projects
            </span>
            <span className="text-gray-400">→</span>
            <span className={`px-2 py-1 rounded-full ${step === 'select-file' ? 'bg-blue-100 text-blue-800' : step === 'fetch-projects' ? 'bg-gray-200 text-gray-600' : 'bg-green-100 text-green-800'}`}>
              2. Select File
            </span>
            <span className="text-gray-400">→</span>
            <span className={`px-2 py-1 rounded-full ${step === 'processing' ? 'bg-blue-100 text-blue-800' : step === 'complete' ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'}`}>
              3. Process
            </span>
            <span className="text-gray-400">→</span>
            <span className={`px-2 py-1 rounded-full ${step === 'complete' ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'}`}>
              4. Complete
            </span>
          </div>
          {(step === 'complete' || step === 'select-file') && (
            <button
              onClick={handleReset}
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Start Over
            </button>
          )}
        </div>
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Step 1: Fetch Projects */}
        {step === 'fetch-projects' && (
          <div>
            <div className="mb-6 bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-2">What this does:</h3>
              <ul className="space-y-1 text-sm text-gray-600">
                <li className="flex items-start">
                  <span className="text-gray-400 mr-2">•</span>
                  <span>Fetches all in-progress projects from Xero</span>
                </li>
                <li className="flex items-start">
                  <span className="text-gray-400 mr-2">•</span>
                  <span>Analyzes project activity from timesheet data</span>
                </li>
                <li className="flex items-start">
                  <span className="text-gray-400 mr-2">•</span>
                  <span>Generates ageing report showing days since last activity</span>
                </li>
                <li className="flex items-start">
                  <span className="text-gray-400 mr-2">•</span>
                  <span>Exports reports in Excel and PDF formats</span>
                </li>
              </ul>
            </div>
            <button
              onClick={fetchProjects}
              disabled={disabled || isLoading}
              className="w-full inline-flex items-center justify-center px-4 py-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Fetching Projects...
                </>
              ) : (
                'Fetch Projects from Xero'
              )}
            </button>
          </div>
        )}

        {/* Step 2: Select File */}
        {step === 'select-file' && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <DocumentTextIcon className="h-5 w-5 text-blue-600" />
                </div>
                <div className="ml-3 flex-1">
                  <p className="text-sm text-blue-800">
                    <strong>Projects fetched:</strong> {projects.length} in-progress projects
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    Now select a timesheet file to analyze project activity
                  </p>
                </div>
              </div>
            </div>
            
            {/* Show selected file */}
            {selectedBlobUrl && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-start">
                  <DocumentTextIcon className="h-5 w-5 text-green-600 flex-shrink-0" />
                  <div className="ml-3">
                    <p className="text-sm font-medium text-green-800">File Selected</p>
                    <p className="text-xs text-green-600">{selectedFileName}</p>
                  </div>
                </div>
              </div>
            )}
            
            {/* File Browser */}
            <BlobBrowserCard
              disabled={disabled || isLoading}
              onFileSelect={handleBlobFileSelect}
            />
            
            {/* Process Button */}
            {selectedBlobUrl && (
              <button
                onClick={processProjects}
                disabled={disabled || isLoading}
                className="w-full inline-flex items-center justify-center px-4 py-3 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Processing...
                  </>
                ) : (
                  'Process Projects with Selected File'
                )}
              </button>
            )}
          </div>
        )}

        {/* Step 3: Processing */}
        {step === 'processing' && (
          <div className="bg-gray-50 rounded-lg p-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-sm font-medium text-gray-900">Processing projects...</p>
              <p className="text-xs text-gray-500 mt-2">Analyzing project activity from timesheet data</p>
            </div>
          </div>
        )}

        {/* Step 4: Complete */}
        {step === 'complete' && processingResult && (
          <div className="space-y-4">
            {/* Success Message */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start">
                <CheckCircleIcon className="h-5 w-5 text-green-600 flex-shrink-0" />
                <div className="ml-3">
                  <h3 className="text-sm font-semibold text-green-800">Analysis Complete</h3>
                  <p className="text-sm text-green-600 mt-1">
                    Successfully analyzed {processingResult.project_analysis?.total_projects || 0} projects
                  </p>
                </div>
              </div>
            </div>
            
            {/* Analysis Summary */}
            {processingResult.project_analysis && (
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-gray-900">
                    {processingResult.project_analysis.total_projects}
                  </p>
                  <p className="text-xs text-gray-500">Total Projects</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-green-600">
                    {processingResult.project_analysis.projects_found_in_excel}
                  </p>
                  <p className="text-xs text-gray-500">With Activity</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-gray-400">
                    {processingResult.project_analysis.projects_not_found}
                  </p>
                  <p className="text-xs text-gray-500">No Activity</p>
                </div>
              </div>
            )}
            
            {/* Ageing Categories */}
            {processingResult.project_analysis?.results && (
              <div className="space-y-4">
                <div>
                  <h5 className="text-sm font-medium text-gray-700 mb-3">Project Ageing Distribution</h5>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-gray-50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-green-600">
                        {processingResult.project_analysis.results.filter(p => p.found_in_excel && p.days_since !== null && p.days_since <= 30).length}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Active (≤30 days)</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-yellow-600">
                        {processingResult.project_analysis.results.filter(p => p.found_in_excel && p.days_since !== null && p.days_since > 30 && p.days_since <= 60).length}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">31-60 days</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-orange-600">
                        {processingResult.project_analysis.results.filter(p => p.found_in_excel && p.days_since !== null && p.days_since > 60 && p.days_since <= 90).length}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">61-90 days</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-red-600">
                        {processingResult.project_analysis.results.filter(p => p.found_in_excel && p.days_since !== null && p.days_since > 90).length}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Over 90 days</p>
                    </div>
                  </div>
                </div>
                
                {/* Projects Table */}
                <div>
                  <h5 className="text-sm font-medium text-gray-700 mb-3">Project Details</h5>
                  <div className="bg-gray-50 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                              Project
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                              Job Code
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">
                              Status
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">
                              Last Activity
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">
                              Days Since
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                      {processingResult.project_analysis.results
                        .slice(0, 20)
                        .sort((a, b) => {
                          // Sort by days_since descending (oldest first)
                          if (a.days_since === null) return 1;
                          if (b.days_since === null) return -1;
                          return b.days_since - a.days_since;
                        })
                        .map((project) => (
                            <tr key={project.project_id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                {project.project_name}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                                {project.job_code}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-center">
                                {project.found_in_excel ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    Active
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600">
                                    No Activity
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-500">
                                {project.latest_date || '-'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                                {project.days_since !== null ? (
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                    project.days_since <= 30 ? 'bg-green-100 text-green-800' :
                                    project.days_since <= 60 ? 'bg-yellow-100 text-yellow-800' :
                                    project.days_since <= 90 ? 'bg-orange-100 text-orange-800' :
                                    'bg-red-100 text-red-800'
                                  }`}>
                                    {project.days_since} days
                                  </span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {processingResult.project_analysis.results.length > 20 && (
                      <div className="bg-gray-100 px-4 py-3 text-center text-sm text-gray-500">
                        Showing 20 of {processingResult.project_analysis.results.length} projects
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {/* Action Buttons */}
            <div className="flex justify-center space-x-4">
              <button
                onClick={handleReset}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
              >
                Process Another File
              </button>
              <button
                onClick={exportToExcel}
                disabled={isLoading}
                className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
                Export to Excel
              </button>
              <button
                onClick={exportToPDF}
                disabled={isLoading}
                className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
                Export to PDF
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}