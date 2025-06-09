'use client';

import React from 'react';
import { ArrowUpTrayIcon } from '@heroicons/react/20/solid';
import { useLog } from '../../../contexts/LogContext';

interface UploadFileButtonProps {
  disabled?: boolean;
  isUploading: boolean;
  onUploadStart: () => void;
  onUploadSuccess: () => void;
  onUploadError: () => void;
}

export default function UploadFileButton({
  disabled = false,
  isUploading,
  onUploadStart,
  onUploadSuccess,
  onUploadError,
}: UploadFileButtonProps) {
  const { addLog } = useLog();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    
    let currentUploadLogId: string | undefined = undefined;

    if (!file) {
      addLog({ message: 'No file selected for project cost update.', source: 'UploadFileButton' });
      return;
    }

    // Create the initial log entry and get its ID
    const initialMessage = `Selected file: ${file.name} (${file.type}). Preparing to upload...`;
    currentUploadLogId = addLog({ message: initialMessage, source: 'UploadFileButton' });

    onUploadStart();

    const formData = new FormData();
    formData.append('file', file);

    const processExcelUrl = process.env.NEXT_PUBLIC_PROCESS_EXCEL_URL;
    if (!processExcelUrl) {
      addLog({ 
        message: 'Error: NEXT_PUBLIC_PROCESS_EXCEL_URL is not defined. Cannot upload file.', 
        source: 'UploadFileButton', 
        idToUpdate: currentUploadLogId,
        mode: 'replace' 
      });
      onUploadError();
      return;
    }

    try {
      addLog({ 
        message: `Uploading ${file.name} and sending to backend...`, 
        source: 'UploadFileButton', 
        idToUpdate: currentUploadLogId,
        mode: 'append' 
      });
      
      const response = await fetch(processExcelUrl, {
        method: 'POST',
        body: formData,
      });

      addLog({ 
        message: `Backend received ${file.name}. Processing file...`, 
        source: 'UploadFileButton', 
        idToUpdate: currentUploadLogId,
        mode: 'append' 
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server responded with ${response.status}: ${errorText}`);
      }

      await response.json();

      addLog({ 
        message: `File ${file.name} processed successfully. Data received from backend.`, 
        source: 'UploadFileButton', 
        idToUpdate: currentUploadLogId,
        mode: 'replace' 
      });
      
      onUploadSuccess();
    } catch (error: any) {
      addLog({ 
        message: `Error processing ${file.name}: ${error.message}`, 
        source: 'UploadFileButton', 
        idToUpdate: currentUploadLogId,
        mode: 'replace' 
      });
      console.error("File upload error:", error);
      onUploadError();
    } finally {
      // Reset file input to allow re-uploading the same file
      event.target.value = '';
    }
  };

  const triggerFileInput = () => {
    document.getElementById('projectCostFileInput')?.click();
  };

  return (
    <>
      {/* Hidden file input */}
      <input
        type="file"
        id="projectCostFileInput"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
        accept=".xlsx, .xls"
      />
      
      <button
        type="button"
        onClick={triggerFileInput}
        disabled={disabled || isUploading}
        className="inline-flex items-center justify-center rounded-md border border-transparent bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ArrowUpTrayIcon className="size-5 mr-2" />
        {isUploading ? 'Uploading...' : 'Upload File'}
      </button>
    </>
  );
} 