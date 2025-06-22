'use client';

import React from 'react';
import { CheckIcon, ClockIcon, XCircleIcon } from '@heroicons/react/24/outline';
import PremiumModal, { ModalAction } from '../PremiumModal';

export type ProcessingStatus = 'processing' | 'success' | 'error';

interface ProcessingStatusModalProps {
  isOpen: boolean;
  status: ProcessingStatus;
  onClose: () => void;
  tenantName?: string;
  fileName?: string;
  errorMessage?: string;
  successMessage?: string;
}

export default function ProcessingStatusModal({
  isOpen,
  status,
  onClose,
  tenantName,
  fileName,
  errorMessage,
  successMessage
}: ProcessingStatusModalProps) {
  const getModalConfig = () => {
    switch (status) {
      case 'processing':
        return {
          title: 'Processing Timesheet',
          icon: <ClockIcon className="size-6 text-blue-600" />,
          iconBgColor: 'bg-blue-100',
          actions: [] as ModalAction[], // No actions while processing
          content: (
            <div className="space-y-4">
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
              <p className="text-sm text-gray-500">
                Please wait while we process your timesheet. This may take a few moments.
              </p>
              {tenantName && fileName && (
                <div className="space-y-2 p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-600">
                    <span className="font-medium">Organisation:</span> {tenantName}
                  </p>
                  <p className="text-xs text-gray-600">
                    <span className="font-medium">File:</span> {fileName}
                  </p>
                </div>
              )}
            </div>
          )
        };

      case 'success':
        return {
          title: 'Processing Complete',
          icon: <CheckIcon className="size-6 text-green-600" />,
          iconBgColor: 'bg-green-100',
          actions: [
            {
              label: 'Close',
              onClick: onClose,
              variant: 'primary' as const,
              autoFocus: true
            }
          ],
          content: (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                {successMessage || 'Your timesheet has been successfully processed and updated in Xero.'}
              </p>
              {tenantName && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-xs text-green-800">
                    <strong>Success:</strong> All project tasks and billing rates have been updated in {tenantName}.
                  </p>
                </div>
              )}
            </div>
          )
        };

      case 'error':
        return {
          title: 'Processing Failed',
          icon: <XCircleIcon className="size-6 text-red-600" />,
          iconBgColor: 'bg-red-100',
          actions: [
            {
              label: 'Try Again',
              onClick: onClose,
              variant: 'danger' as const
            },
            {
              label: 'Cancel',
              onClick: onClose,
              variant: 'secondary' as const,
              autoFocus: true
            }
          ],
          content: (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                There was an error processing your timesheet. Please try again or contact support if the problem persists.
              </p>
              {errorMessage && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-800">
                    <strong>Error:</strong> {errorMessage}
                  </p>
                </div>
              )}
            </div>
          )
        };

      default:
        return {
          title: 'Unknown Status',
          icon: null,
          iconBgColor: 'bg-gray-100',
          actions: [],
          content: <div>Unknown processing status</div>
        };
    }
  };

  const config = getModalConfig();

  return (
    <PremiumModal
      isOpen={isOpen}
      onClose={status === 'processing' ? () => {} : onClose} // Prevent closing while processing
      title={config.title}
      icon={config.icon}
      iconBgColor={config.iconBgColor}
      actions={config.actions}
      maxWidth="md"
    >
      {config.content}
    </PremiumModal>
  );
} 