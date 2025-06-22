'use client';

import React, { useState } from 'react';
import TenantConfirmationModal from './TenantConfirmationModal';
import ProcessingStatusModal, { ProcessingStatus } from './ProcessingStatusModal';

/**
 * Example component showing how to use the new modal system
 * This is for demonstration purposes and can be removed if not needed
 */
export default function ModalExamples() {
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<ProcessingStatus>('processing');

  const handleProcessing = () => {
    setConfirmationOpen(false);
    setCurrentStatus('processing');
    setStatusOpen(true);

    // Simulate processing
    setTimeout(() => {
      setCurrentStatus('success');
    }, 3000);
  };

  const handleError = () => {
    setCurrentStatus('error');
    setStatusOpen(true);
  };

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Modal Examples</h2>
      
      <div className="space-x-4">
        <button
          onClick={() => setConfirmationOpen(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          Show Confirmation Modal
        </button>
        
        <button
          onClick={() => { setCurrentStatus('processing'); setStatusOpen(true); }}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Show Processing Modal
        </button>
        
        <button
          onClick={() => { setCurrentStatus('success'); setStatusOpen(true); }}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
        >
          Show Success Modal
        </button>
        
        <button
          onClick={handleError}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
        >
          Show Error Modal
        </button>
      </div>

      {/* Confirmation Modal */}
      <TenantConfirmationModal
        isOpen={confirmationOpen}
        tenantName="Demo Organisation Ltd"
        fileName="timesheet-2024-01.xlsx"
        onConfirm={handleProcessing}
        onCancel={() => setConfirmationOpen(false)}
      />

      {/* Status Modal */}
      <ProcessingStatusModal
        isOpen={statusOpen}
        status={currentStatus}
        tenantName="Demo Organisation Ltd"
        fileName="timesheet-2024-01.xlsx"
        onClose={() => setStatusOpen(false)}
        errorMessage="Failed to connect to Xero API. Please check your connection and try again."
        successMessage="Successfully processed 45 time entries and updated 12 project tasks."
      />
    </div>
  );
} 