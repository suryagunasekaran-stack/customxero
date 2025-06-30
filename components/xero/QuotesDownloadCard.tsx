'use client';

import React, { useState } from 'react';
import { DocumentTextIcon, ArrowDownTrayIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import ConfirmationDialog from '../ConfirmationDialog';
import { FunctionCardProps } from './types';

interface QuotesDownloadCardProps extends FunctionCardProps {}

export default function QuotesDownloadCard({ disabled = false }: QuotesDownloadCardProps) {
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleDownloadQuotes = async () => {
    setIsDownloading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/xero/quotes/download', {
        method: 'GET',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to download quotes');
      }

      // Get the filename from the response headers
      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition?.match(/filename="(.+)"/)?.[1] || 'xero-accepted-quotes-export.xlsx';

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

      setSuccess(`Accepted quotes downloaded successfully as ${filename}`);
      
    } catch (error: any) {
      setError(error.message || 'An error occurred while downloading quotes');
    } finally {
      setIsDownloading(false);
    }
  };

  const isDisabled = disabled || isDownloading;

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-200">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Accepted Quotes</h2>
              <p className="text-sm text-gray-500 mt-1">
                Download accepted Xero quotes as Excel file
              </p>
            </div>
            <div className="p-2 bg-purple-100 rounded-lg">
              <DocumentTextIcon className="h-6 w-6 text-purple-600" />
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
                <li className="flex items-start">
                  <span className="text-gray-400 mr-2">•</span>
                  <span>Fetches all accepted quotes from your Xero organisation</span>
                </li>
                <li className="flex items-start">
                  <span className="text-gray-400 mr-2">•</span>
                  <span>Extracts Quote ID, Quote Number, and Reference</span>
                </li>
                <li className="flex items-start">
                  <span className="text-gray-400 mr-2">•</span>
                  <span>Creates professional Excel file with summary information</span>
                </li>
                <li className="flex items-start">
                  <span className="text-gray-400 mr-2">•</span>
                  <span>Filters only quotes with "ACCEPTED" status</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Export Format Info */}
          <div className="mb-6">
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <h3 className="text-sm font-medium text-blue-900 mb-2">Export Details:</h3>
              <div className="grid grid-cols-2 gap-2 text-sm text-blue-800">
                <div>
                  <span className="font-medium">Format:</span> Excel (.xlsx)
                </div>
                <div>
                  <span className="font-medium">Sheets:</span> Summary + Data
                </div>
                <div>
                  <span className="font-medium">Status Filter:</span> ACCEPTED only
                </div>
                <div>
                  <span className="font-medium">Data:</span> ID, Number, Reference
                </div>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={() => setShowConfirmation(true)}
            disabled={isDisabled}
            className="w-full inline-flex items-center justify-center px-4 py-3 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
          >
            {isDownloading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                Downloading Quotes...
              </>
            ) : (
              <>
                <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
                Download Accepted Quotes
              </>
            )}
          </button>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showConfirmation}
        onClose={() => setShowConfirmation(false)}
        onConfirm={() => {
          setShowConfirmation(false);
          handleDownloadQuotes();
        }}
        title="Download Accepted Quotes"
        message="This will fetch all accepted quotes from your Xero organisation and download them as an Excel file. The export may take a moment depending on the number of quotes."
        details={[
          { label: 'Format', value: 'Microsoft Excel (.xlsx)' },
          { label: 'Content', value: 'Quote ID, Number, Reference' },
          { label: 'Filter', value: 'ACCEPTED status only' },
          { label: 'Source', value: 'Xero Quotes API' }
        ]}
        confirmText="Download Quotes"
        type="info"
      />
    </>
  );
} 