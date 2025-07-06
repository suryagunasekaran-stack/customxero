'use client';

import React, { useState } from 'react';
import { BriefcaseIcon, ArrowDownTrayIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { FunctionCardProps } from './types';
import { useApiClient } from '@/hooks/useApiClient';

interface ProjectsInProgressCardProps extends FunctionCardProps {}

export default function ProjectsInProgressCard({ disabled = false }: ProjectsInProgressCardProps) {
  const { apiCall } = useApiClient({
    onError: (error) => setError(error.message)
  });
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleDownloadProjects = async () => {
    setIsDownloading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/xero/projects/inprogress/download', {
        method: 'GET',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to download projects');
      }

      // Get the filename from the response headers
      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition?.match(/filename="(.+)"/)?.[1] || 'xero-projects-inprogress.xlsx';

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setSuccess(`Projects downloaded successfully as ${filename}`);
      
    } catch (error: any) {
      setError(error.message || 'An error occurred while downloading projects');
    } finally {
      setIsDownloading(false);
    }
  };

  const isDisabled = disabled || isDownloading;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-200">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Projects In Progress Download</h2>
            <p className="text-sm text-gray-500 mt-1">
              Download all active projects as Excel file
            </p>
          </div>
          <div className="p-2 bg-blue-100 rounded-lg">
            <BriefcaseIcon className="h-6 w-6 text-blue-600" />
          </div>
        </div>

        {/* Success Message */}
        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center">
              <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2" />
              <p className="text-sm text-green-800">{success}</p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Description */}
        <div className="mb-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-2">What this does:</h3>
            <ul className="space-y-1 text-sm text-gray-600">
              <li>• Fetches all projects with status "INPROGRESS" from Xero</li>
              <li>• Handles pagination to retrieve all projects</li>
              <li>• Creates an Excel file with project details</li>
              <li>• Includes summary sheet with totals and statistics</li>
            </ul>
          </div>
        </div>

        {/* Excel Content Preview */}
        <div className="mb-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-blue-900 mb-2">Excel File Contents:</h3>
            <ul className="space-y-1 text-sm text-blue-700">
              <li><strong>Projects Sheet:</strong> All project details including:</li>
              <li className="ml-4">- Project name, ID, and status</li>
              <li className="ml-4">- Financial data (estimates, invoiced, to be invoiced)</li>
              <li className="ml-4">- Time tracking (hours logged and to be invoiced)</li>
              <li className="ml-4">- Deposits and credit notes</li>
              <li className="ml-4">- Deadlines and contact information</li>
              <li className="mt-2"><strong>Summary Sheet:</strong> Overview statistics including:</li>
              <li className="ml-4">- Total number of projects</li>
              <li className="ml-4">- Sum of all estimates, invoiced, and pending amounts</li>
              <li className="ml-4">- Total hours logged across all projects</li>
              <li className="ml-4">- Export metadata</li>
            </ul>
          </div>
        </div>

        {/* Download Button */}
        <button
          onClick={handleDownloadProjects}
          disabled={isDisabled}
          className="w-full inline-flex items-center justify-center px-6 py-3 text-base font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          <ArrowDownTrayIcon className={`h-5 w-5 mr-2 ${isDownloading ? 'animate-bounce' : ''}`} />
          {isDownloading ? 'Downloading...' : 'Download Projects In Progress'}
        </button>

        {/* Info Note */}
        <div className="mt-4 text-xs text-gray-500 text-center">
          The download includes all paginated results from Xero
        </div>
      </div>
    </div>
  );
}