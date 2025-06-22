'use client';

import React from 'react';
import { ExclamationTriangleIcon, BuildingOfficeIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import PremiumModal, { ModalAction } from '../PremiumModal';

interface TenantConfirmationModalProps {
  isOpen: boolean;
  tenantName: string;
  fileName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function TenantConfirmationModal({
  isOpen,
  tenantName,
  fileName,
  onConfirm,
  onCancel
}: TenantConfirmationModalProps) {
  const actions: ModalAction[] = [
    {
      label: 'Proceed with Processing',
      onClick: onConfirm,
      variant: 'primary'
    },
    {
      label: 'Cancel',
      onClick: onCancel,
      variant: 'secondary',
      autoFocus: true
    }
  ];

  return (
    <PremiumModal
      isOpen={isOpen}
      onClose={onCancel}
      title="Confirm Timesheet Processing"
      icon={<ExclamationTriangleIcon className="size-6 text-orange-600" />}
      iconBgColor="bg-orange-100"
      actions={actions}
      maxWidth="md"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          You are about to process a timesheet that will update project tasks and costs in Xero.
        </p>
        
        <div className="space-y-3">
          <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg text-left">
            <BuildingOfficeIcon className="w-5 h-5 text-gray-500 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Organisation</p>
              <p className="text-sm font-semibold text-gray-900 truncate">{tenantName}</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg text-left">
            <DocumentTextIcon className="w-5 h-5 text-gray-500 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">File</p>
              <p className="text-sm text-gray-900 truncate" title={fileName}>{fileName}</p>
            </div>
          </div>
        </div>
        
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-left">
          <p className="text-xs text-amber-800">
            <strong>Warning:</strong> This will create or update project tasks with new time estimates and billing rates.
          </p>
        </div>
      </div>
    </PremiumModal>
  );
} 