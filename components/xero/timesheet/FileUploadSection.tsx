'use client';

import React from 'react';
import { CloudArrowUpIcon } from '@heroicons/react/24/outline';

interface FileUploadSectionProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
  loading?: boolean;
  error?: string | null;
}

export default function FileUploadSection({ 
  onFileSelect, 
  disabled = false, 
  loading = false,
  error = null 
}: FileUploadSectionProps) {
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  const triggerFileInput = () => {
    document.getElementById('timesheetFileInput')?.click();
  };

  return (
    <div className="mt-6">
      <input
        id="timesheetFileInput"
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled || loading}
      />
      
      <button
        onClick={triggerFileInput}
        disabled={disabled || loading}
        className="w-full flex flex-col items-center justify-center px-6 py-8 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <CloudArrowUpIcon className="h-12 w-12 text-gray-400 group-hover:text-gray-500 mb-3" />
        <span className="text-sm font-medium text-gray-700 group-hover:text-gray-800">
          {loading ? 'Verifying Xero connection...' : 'Click to upload timesheet'}
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
  );
} 