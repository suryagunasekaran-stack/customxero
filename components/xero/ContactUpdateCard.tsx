'use client';

import React, { useState, useRef } from 'react';
import { UserGroupIcon, CloudArrowUpIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import ConfirmationDialog from '../ConfirmationDialog';
import { FunctionCardProps } from './types';

interface ContactUpdateCardProps extends FunctionCardProps {}

export default function ContactUpdateCard({ disabled = false }: ContactUpdateCardProps) {
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
      setSuccess(null);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const validateJsonPayload = (jsonString: string) => {
    try {
      const data = JSON.parse(jsonString);
      
      if (!data.Contacts || !Array.isArray(data.Contacts)) {
        throw new Error('Invalid format. Expected { "Contacts": [...] }');
      }

      if (data.Contacts.length === 0) {
        throw new Error('Contacts array cannot be empty');
      }

      // Basic validation of contact structure
      for (const contact of data.Contacts) {
        if (!contact.Name || typeof contact.Name !== 'string') {
          throw new Error('Each contact must have a valid "Name" field');
        }
      }

      return data;
    } catch (error) {
      throw error;
    }
  };

  const handleUpdateContacts = async () => {
    if (!selectedFile) {
      setError('Please select a JSON file first');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setSuccess(null);

    try {
      // Read and validate the JSON file
      const fileContent = await selectedFile.text();
      const contactsPayload = validateJsonPayload(fileContent);

      // Send to API
      const response = await fetch('/api/xero/contacts', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(contactsPayload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update contacts');
      }

      setSuccess(result.message || 'Contacts updated successfully');
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error: any) {
      setError(error.message || 'An error occurred while updating contacts');
    } finally {
      setIsProcessing(false);
    }
  };

  const isDisabled = disabled || isProcessing || !selectedFile;

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-200">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Contact Update</h2>
              <p className="text-sm text-gray-500 mt-1">
                Upload JSON file to update Xero contacts
              </p>
            </div>
            <div className="p-2 bg-purple-100 rounded-lg">
              <UserGroupIcon className="h-6 w-6 text-purple-600" />
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

          {/* File Upload Section */}
          <div className="mb-6">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-purple-400 transition-colors duration-200">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="hidden"
              />
              <CloudArrowUpIcon className="h-8 w-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-600 mb-2">
                {selectedFile ? selectedFile.name : 'Select JSON file'}
              </p>
              <button
                onClick={handleUploadClick}
                disabled={isProcessing}
                className="text-sm text-purple-600 hover:text-purple-700 font-medium disabled:opacity-50"
              >
                Browse Files
              </button>
            </div>
          </div>

          {/* Description */}
          <div className="mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-2">Expected format:</h3>
              <pre className="text-xs text-gray-600 bg-white rounded p-2 overflow-x-auto">
{`{
  "Contacts": [
    {
      "Name": "TEST1"
    },
    {
      "Name": "TEST2"  
    }
  ]
}`}
              </pre>
              <ul className="space-y-1 text-sm text-gray-600 mt-3">
                <li className="flex items-start">
                  <span className="text-gray-400 mr-2">•</span>
                  <span>Upload JSON file with contacts array</span>
                </li>
                <li className="flex items-start">
                  <span className="text-gray-400 mr-2">•</span>
                  <span>Updates existing contacts or creates new ones</span>
                </li>
                <li className="flex items-start">
                  <span className="text-gray-400 mr-2">•</span>
                  <span>Sends data directly to Xero API</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={() => setShowConfirmation(true)}
            disabled={isDisabled}
            className="w-full inline-flex items-center justify-center px-4 py-3 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
          >
            {isProcessing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                Updating Contacts...
              </>
            ) : (
              <>
                <CloudArrowUpIcon className="h-4 w-4 mr-2" />
                Update Contacts
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
          handleUpdateContacts();
        }}
        title="Update Xero Contacts"
        message="This will upload the JSON data and update your Xero contacts. Please make sure the format is correct before proceeding."
        details={[
          { label: 'File', value: selectedFile?.name || 'No file selected' },
          { label: 'Size', value: selectedFile ? `${Math.round(selectedFile.size / 1024)} KB` : 'N/A' },
          { label: 'Target', value: 'Xero Contacts API' }
        ]}
        confirmText="Update Contacts"
        type="warning"
      />
    </>
  );
} 