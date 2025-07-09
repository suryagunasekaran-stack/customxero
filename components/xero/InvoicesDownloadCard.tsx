'use client';

import React, { useState } from 'react';
import { DocumentTextIcon, ArrowDownTrayIcon, CheckCircleIcon, DocumentIcon, TableCellsIcon } from '@heroicons/react/24/outline';
import { FunctionCardProps } from './types';

interface InvoicesDownloadCardProps extends FunctionCardProps {}

type ExportFormat = 'excel' | 'json';

export default function InvoicesDownloadCard({ disabled = false }: InvoicesDownloadCardProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('excel');

  const handleDownloadInvoices = async () => {
    setIsDownloading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/xero/invoices/download?format=${selectedFormat}`, {
        method: 'GET',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to download invoices');
      }

      // Get the filename from the response headers
      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition?.match(/filename="(.+)"/)?.[1] || 
        `xero-invoices.${selectedFormat === 'excel' ? 'xlsx' : 'json'}`;

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

      setSuccess(`Invoices downloaded successfully as ${filename}`);
      
    } catch (error: any) {
      setError(error.message || 'An error occurred while downloading invoices');
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
            <h2 className="text-xl font-semibold text-gray-900">Invoices Download</h2>
            <p className="text-sm text-gray-500 mt-1">
              Download all invoices from Xero
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
              <li>• Fetches sales invoices only (ACCREC type) - excludes bills</li>
              <li>• Handles Xero's 100k invoice limit safely</li>
              <li>• Supports both Excel and JSON export formats</li>
              <li>• Orders invoices by last updated date (newest first)</li>
            </ul>
          </div>
        </div>

        {/* Format Selection */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Select Export Format:</h3>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setSelectedFormat('excel')}
              className="flex items-center justify-center p-3 rounded-lg border-2 transition-all text-white font-medium"
              style={{
                backgroundColor: selectedFormat === 'excel' 
                  ? 'oklch(21.6% 0.006 56.043)' 
                  : 'oklch(27.4% 0.006 286.033)',
                borderColor: selectedFormat === 'excel' 
                  ? 'oklch(21.6% 0.006 56.043)' 
                  : 'oklch(27.4% 0.006 286.033)'
              }}
              onMouseEnter={(e) => {
                if (selectedFormat !== 'excel') {
                  e.currentTarget.style.backgroundColor = 'oklch(21.6% 0.006 56.043)';
                  e.currentTarget.style.borderColor = 'oklch(21.6% 0.006 56.043)';
                }
              }}
              onMouseLeave={(e) => {
                if (selectedFormat !== 'excel') {
                  e.currentTarget.style.backgroundColor = 'oklch(27.4% 0.006 286.033)';
                  e.currentTarget.style.borderColor = 'oklch(27.4% 0.006 286.033)';
                }
              }}
              disabled={isDownloading}
            >
              <TableCellsIcon className="h-5 w-5 mr-2" />
              <span>Excel</span>
            </button>
            <button
              onClick={() => setSelectedFormat('json')}
              className="flex items-center justify-center p-3 rounded-lg border-2 transition-all text-white font-medium"
              style={{
                backgroundColor: selectedFormat === 'json' 
                  ? 'oklch(21.6% 0.006 56.043)' 
                  : 'oklch(27.4% 0.006 286.033)',
                borderColor: selectedFormat === 'json' 
                  ? 'oklch(21.6% 0.006 56.043)' 
                  : 'oklch(27.4% 0.006 286.033)'
              }}
              onMouseEnter={(e) => {
                if (selectedFormat !== 'json') {
                  e.currentTarget.style.backgroundColor = 'oklch(21.6% 0.006 56.043)';
                  e.currentTarget.style.borderColor = 'oklch(21.6% 0.006 56.043)';
                }
              }}
              onMouseLeave={(e) => {
                if (selectedFormat !== 'json') {
                  e.currentTarget.style.backgroundColor = 'oklch(27.4% 0.006 286.033)';
                  e.currentTarget.style.borderColor = 'oklch(27.4% 0.006 286.033)';
                }
              }}
              disabled={isDownloading}
            >
              <DocumentIcon className="h-5 w-5 mr-2" />
              <span>JSON</span>
            </button>
          </div>
        </div>

        {/* File Content Preview */}
        <div className="mb-6">
          <div className={`${selectedFormat === 'excel' ? 'bg-blue-50' : 'bg-purple-50'} rounded-lg p-4`}>
            <h3 className={`text-sm font-medium ${selectedFormat === 'excel' ? 'text-blue-900' : 'text-purple-900'} mb-2`}>
              {selectedFormat === 'excel' ? 'Excel File Contents:' : 'JSON File Structure:'}
            </h3>
            {selectedFormat === 'excel' ? (
              <ul className="space-y-1 text-sm text-blue-700">
                <li><strong>Invoices Sheet:</strong> All invoice details including:</li>
                <li className="ml-4">- Invoice number, type, status, and dates</li>
                <li className="ml-4">- Contact information</li>
                <li className="ml-4">- Financial details (subtotal, tax, total, amounts)</li>
                <li className="ml-4">- Reference numbers and attachment status</li>
                <li className="mt-2"><strong>Summary by Status:</strong> Invoice counts and totals grouped by status</li>
                <li className="mt-2"><strong>Summary by Type:</strong> Invoice counts and totals grouped by type</li>
                <li className="mt-2"><strong>Export Info:</strong> Metadata including export date and statistics</li>
              </ul>
            ) : (
              <ul className="space-y-1 text-sm text-purple-700">
                <li><strong>metadata:</strong> Export information including:</li>
                <li className="ml-4">- Export date and tenant ID</li>
                <li className="ml-4">- Total invoice count and values</li>
                <li className="ml-4">- Currency information</li>
                <li className="mt-2"><strong>invoices:</strong> Array of all invoice objects with:</li>
                <li className="ml-4">- Complete invoice details</li>
                <li className="ml-4">- Contact information</li>
                <li className="ml-4">- Line items (if available)</li>
                <li className="ml-4">- All financial data</li>
              </ul>
            )}
          </div>
        </div>

        {/* Download Button */}
        <button
          onClick={handleDownloadInvoices}
          disabled={isDisabled}
          className="w-full inline-flex items-center justify-center px-6 py-3 text-base font-medium text-white rounded-lg disabled:cursor-not-allowed transition-colors"
          style={{
            backgroundColor: isDisabled 
              ? 'oklch(21.6% 0.006 56.043)' 
              : 'oklch(27.4% 0.006 286.033)'
          }}
          onMouseEnter={(e) => {
            if (!isDisabled) {
              e.currentTarget.style.backgroundColor = 'oklch(21.6% 0.006 56.043)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isDisabled) {
              e.currentTarget.style.backgroundColor = 'oklch(27.4% 0.006 286.033)';
            }
          }}
        >
          <ArrowDownTrayIcon className={`h-5 w-5 mr-2 ${isDownloading ? 'animate-bounce' : ''}`} />
          {isDownloading ? 'Downloading...' : `Download Invoices as ${selectedFormat.toUpperCase()}`}
        </button>

        {/* Info Note */}
        <div className="mt-4 text-xs text-gray-500 text-center">
          Downloads all invoices with automatic pagination • Respects Xero's 100k limit
        </div>
      </div>
    </div>
  );
}