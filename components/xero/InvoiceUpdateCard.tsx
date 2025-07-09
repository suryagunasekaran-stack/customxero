'use client';

import React, { useState } from 'react';
import { DocumentTextIcon, ArrowUpTrayIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { FunctionCardProps } from './types';

interface InvoiceUpdateCardProps extends FunctionCardProps {}

interface UpdateResult {
  invoiceNumber: string;
  status: string;
  lineItemsUpdated?: number;
  error?: string;
}

export default function InvoiceUpdateCard({ disabled = false }: InvoiceUpdateCardProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDryRun, setIsDryRun] = useState(true);
  const [updateResults, setUpdateResults] = useState<UpdateResult[]>([]);
  const [showResults, setShowResults] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/json') {
      setFile(selectedFile);
      setError(null);
      setShowResults(false);
    } else {
      setError('Please select a valid JSON file');
      setFile(null);
    }
  };

  const handleUpdateInvoices = async () => {
    if (!file) {
      setError('Please select a JSON file first');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setSuccess(null);
    setUpdateResults([]);

    try {
      // Read the file content
      const fileContent = await file.text();
      const updateData = JSON.parse(fileContent);

      // Validate the data structure
      if (!Array.isArray(updateData)) {
        throw new Error('Invalid JSON format. Expected an array of invoice updates.');
      }

      // Send to API
      const response = await fetch('/api/xero/invoices/update-draft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          updateData,
          dryRun: isDryRun
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update invoices');
      }

      const result = await response.json();
      
      if (isDryRun) {
        setSuccess(`Dry run completed: ${result.matchedInvoices} invoices ready to update`);
      } else {
        setSuccess(`Update completed: ${result.successfulUpdates} invoices updated successfully`);
      }
      
      setUpdateResults(result.results || []);
      setShowResults(true);
      
    } catch (error: any) {
      setError(error.message || 'An error occurred while updating invoices');
    } finally {
      setIsProcessing(false);
    }
  };

  const isDisabled = disabled || isProcessing || !file;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-200">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Update Draft Invoices</h2>
            <p className="text-sm text-gray-500 mt-1">
              Update draft invoice line items from JSON file
            </p>
          </div>
          <div className="p-2 bg-indigo-100 rounded-lg">
            <DocumentTextIcon className="h-6 w-6 text-indigo-600" />
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
            <div className="flex items-center">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-500 mr-2" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        )}

        {/* Description */}
        <div className="mb-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-2">What this does:</h3>
            <ul className="space-y-1 text-sm text-gray-600">
              <li>• Fetches all draft sales invoices from Xero</li>
              <li>• Matches invoices by InvoiceNumber from your JSON file</li>
              <li>• Updates line items with Description, AccountCode, TaxType</li>
              <li>• Adds tracking categories if provided</li>
              <li>• Preserves existing LineItemIDs</li>
            </ul>
          </div>
        </div>

        {/* JSON File Format */}
        <div className="mb-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-blue-900 mb-2">Expected JSON Format:</h3>
            <pre className="text-xs text-blue-700 overflow-x-auto">
{`[
  {
    "*InvoiceNumber": "BMA/INV/25/941",
    "*Description": "B&W 80ME Piston Crown",
    "*AccountCode": "203",
    "*TaxType": "Standard-Rated Supplies",
    "TrackingName1": "Trade",
    "TrackingOption1": "ENGINE RECON"
  }
]`}
            </pre>
          </div>
        </div>

        {/* File Upload */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select JSON File
          </label>
          <input
            type="file"
            accept=".json"
            onChange={handleFileChange}
            disabled={isProcessing}
            className="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-lg file:border-0
              file:text-sm file:font-semibold
              file:bg-indigo-50 file:text-indigo-700
              hover:file:bg-indigo-100
              disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {file && (
            <p className="mt-2 text-sm text-gray-600">
              Selected: {file.name}
            </p>
          )}
        </div>

        {/* Dry Run Toggle */}
        <div className="mb-6">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={isDryRun}
              onChange={(e) => setIsDryRun(e.target.checked)}
              disabled={isProcessing}
              className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
            />
            <span className="ml-2 text-sm text-gray-700">
              Dry run (preview changes without updating)
            </span>
          </label>
        </div>

        {/* Update Button */}
        <button
          onClick={handleUpdateInvoices}
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
          <ArrowUpTrayIcon className={`h-5 w-5 mr-2 ${isProcessing ? 'animate-pulse' : ''}`} />
          {isProcessing ? 'Processing...' : (isDryRun ? 'Preview Updates' : 'Update Invoices')}
        </button>

        {/* Results */}
        {showResults && updateResults.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-medium text-gray-900 mb-2">Update Results:</h3>
            <div className="max-h-48 overflow-y-auto bg-gray-50 rounded-lg p-3">
              <ul className="space-y-1">
                {updateResults.map((result, index) => (
                  <li key={index} className="text-sm">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      result.status === 'success' ? 'bg-green-100 text-green-800' :
                      result.status === 'failed' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {result.status}
                    </span>
                    <span className="ml-2 text-gray-700">
                      {result.invoiceNumber}
                      {result.lineItemsUpdated && ` (${result.lineItemsUpdated} line items)`}
                      {result.error && ` - ${result.error}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Info Note */}
        <div className="mt-4 text-xs text-gray-500 text-center">
          Updates draft invoices only • Matches by invoice number • Preserves line item IDs
        </div>
      </div>
    </div>
  );
} 