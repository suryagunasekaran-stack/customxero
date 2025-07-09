'use client';

import React, { useState } from 'react';
import { DocumentTextIcon, ArrowUpTrayIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { FunctionCardProps } from './types';

interface InvoiceUpdateDirectCardProps extends FunctionCardProps {}

interface UpdateResult {
  invoiceNumber: string;
  invoiceId: string;
  status: string;
  errors: any[];
  hasValidationErrors: boolean;
}

export default function InvoiceUpdateDirectCard({ disabled = false }: InvoiceUpdateDirectCardProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [updateResults, setUpdateResults] = useState<UpdateResult[]>([]);
  const [summary, setSummary] = useState<any>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
      setSuccess(null);
      setUpdateResults([]);
      setSummary(null);
    }
  };

  const handleUpdate = async () => {
    if (!file) {
      setError('Please select a file');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setSuccess(null);
    setUpdateResults([]);
    setSummary(null);

    try {
      // Read the file
      const fileContent = await file.text();
      let xeroPayload;
      
      try {
        xeroPayload = JSON.parse(fileContent);
      } catch (e) {
        throw new Error('Invalid JSON format in file');
      }

      // Validate it has the expected structure
      if (!xeroPayload.Invoices || !Array.isArray(xeroPayload.Invoices)) {
        throw new Error('Invalid payload format. Expected { Invoices: [...] }');
      }

      // Send to API
      const response = await fetch('/api/xero/invoices/update-direct', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(xeroPayload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Update failed');
      }

      // Set results
      setUpdateResults(data.results || []);
      setSummary(data.summary);
      
      if (data.summary?.failed > 0) {
        setError(`Update completed with ${data.summary.failed} failures out of ${data.summary.total} invoices`);
      } else {
        setSuccess(`Successfully updated ${data.summary?.successful || 0} invoices`);
      }

    } catch (err) {
      console.error('Update error:', err);
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center mb-4">
        <DocumentTextIcon className="h-6 w-6 text-blue-600 mr-2" />
        <h3 className="text-lg font-semibold">Update Invoices (Direct)</h3>
      </div>
      
      <div className="space-y-4">
        <div>
          <p className="text-sm text-gray-600 mb-4">
            Upload a JSON file with Xero API formatted invoice updates. This directly sends the payload to Xero.
          </p>
          
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
            <p className="text-xs text-blue-800 font-medium mb-2">Expected JSON Format:</p>
            <pre className="text-xs text-blue-700 overflow-x-auto">
{`{
  "Invoices": [
    {
      "InvoiceID": "...",
      "Type": "ACCREC",
      "Contact": { "ContactID": "..." },
      "InvoiceNumber": "...",
      "LineItems": [...]
    }
  ]
}`}
            </pre>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Xero Payload JSON File
          </label>
          <input
            type="file"
            accept=".json"
            onChange={handleFileChange}
            disabled={disabled || isProcessing}
            className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none"
          />
          {file && (
            <p className="mt-1 text-sm text-gray-600">
              Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)
            </p>
          )}
        </div>

        <button
          onClick={handleUpdate}
          disabled={disabled || isProcessing || !file}
          className="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {isProcessing ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing...
            </>
          ) : (
            <>
              <ArrowUpTrayIcon className="h-5 w-5 mr-2" />
              Update Invoices
            </>
          )}
        </button>

        {/* Summary */}
        {summary && (
          <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
            <h4 className="text-sm font-semibold mb-2">Update Summary</h4>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <span className="text-gray-600">Total:</span>
                <span className="ml-1 font-medium">{summary.total}</span>
              </div>
              <div>
                <span className="text-gray-600">Success:</span>
                <span className="ml-1 font-medium text-green-600">{summary.successful}</span>
              </div>
              <div>
                <span className="text-gray-600">Failed:</span>
                <span className="ml-1 font-medium text-red-600">{summary.failed}</span>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {updateResults.length > 0 && (
          <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-md">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Errors</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {updateResults.map((result, index) => (
                  <tr key={index}>
                    <td className="px-4 py-2 text-sm text-gray-900">{result.invoiceNumber}</td>
                    <td className="px-4 py-2 text-sm">
                      {result.status === 'success' ? (
                        <span className="flex items-center text-green-600">
                          <CheckCircleIcon className="h-4 w-4 mr-1" />
                          Success
                        </span>
                      ) : (
                        <span className="flex items-center text-red-600">
                          <ExclamationTriangleIcon className="h-4 w-4 mr-1" />
                          Failed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm text-red-600">
                      {result.errors.length > 0 && (
                        <ul className="text-xs">
                          {result.errors.map((err: any, i: number) => (
                            <li key={i}>{err.Message || err}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-md p-3">
            <p className="text-sm text-green-800">{success}</p>
          </div>
        )}
      </div>
    </div>
  );
} 