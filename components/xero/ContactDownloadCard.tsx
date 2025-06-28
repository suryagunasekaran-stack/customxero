'use client';

import React, { useState } from 'react';
import { UserGroupIcon, ArrowDownTrayIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import ConfirmationDialog from '../ConfirmationDialog';
import { FunctionCardProps } from './types';

interface ContactDownloadCardProps extends FunctionCardProps {}

export default function ContactDownloadCard({ disabled = false }: ContactDownloadCardProps) {
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [contactCount, setContactCount] = useState<number | null>(null);

  const handleDownloadContacts = async () => {
    setIsDownloading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/xero/contacts/download', {
        method: 'GET',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to download contacts');
      }

      // Get the filename from the response headers
      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition?.match(/filename="(.+)"/)?.[1] || 'xero-contacts-export.xlsx';

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

      // Try to get contact count from response (if available)
      // This is a rough estimate since we can't easily get it from the Excel file
      setSuccess(`Contacts downloaded successfully as ${filename}`);
      
    } catch (error: any) {
      setError(error.message || 'An error occurred while downloading contacts');
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
              <h2 className="text-xl font-semibold text-gray-900">Contact Download</h2>
              <p className="text-sm text-gray-500 mt-1">
                Download all Xero contacts as Excel file
              </p>
            </div>
            <div className="p-2 bg-green-100 rounded-lg">
              <UserGroupIcon className="h-6 w-6 text-green-600" />
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
                  <span>Fetches all contacts from your Xero organisation</span>
                </li>
                <li className="flex items-start">
                  <span className="text-gray-400 mr-2">•</span>
                  <span>Exports comprehensive contact details to Excel</span>
                </li>
                <li className="flex items-start">
                  <span className="text-gray-400 mr-2">•</span>
                  <span>Includes names, emails, addresses, and contact info</span>
                </li>
                <li className="flex items-start">
                  <span className="text-gray-400 mr-2">•</span>
                  <span>Professional formatted Excel file with summary sheet</span>
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
                  <span className="font-medium">Includes:</span> All contact fields
                </div>
                <div>
                  <span className="font-medium">Size:</span> Varies by contact count
                </div>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={() => setShowConfirmation(true)}
            disabled={isDisabled}
            className="w-full inline-flex items-center justify-center px-4 py-3 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
          >
            {isDownloading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                Downloading Contacts...
              </>
            ) : (
              <>
                <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
                Download Contacts
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
          handleDownloadContacts();
        }}
        title="Download Xero Contacts"
        message="This will fetch all contacts from your Xero organisation and download them as an Excel file. The export may take a moment depending on the number of contacts."
        details={[
          { label: 'Format', value: 'Microsoft Excel (.xlsx)' },
          { label: 'Content', value: 'All contact information' },
          { label: 'Source', value: 'Xero Contacts API' }
        ]}
        confirmText="Download Contacts"
        type="info"
      />
    </>
  );
} 