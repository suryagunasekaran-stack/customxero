'use client';

import React from 'react';
import { ExclamationTriangleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  details?: {
    label: string;
    value: string | number;
  }[];
  confirmText?: string;
  cancelText?: string;
  type?: 'info' | 'warning' | 'danger';
}

export default function ConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  details,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'info'
}: ConfirmationDialogProps) {
  if (!isOpen) return null;

  const iconColors = {
    info: 'text-blue-600',
    warning: 'text-amber-600',
    danger: 'text-red-600'
  };

  const buttonColors = {
    info: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    warning: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
    danger: 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
  };

  const Icon = type === 'info' ? InformationCircleIcon : ExclamationTriangleIcon;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />
      
      {/* Dialog */}
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full transform transition-all">
            <div className="p-6">
              {/* Icon and Title */}
              <div className="flex items-start gap-4">
                <div className={`flex-shrink-0 ${iconColors[type]}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm text-gray-600">
                    {message}
                  </p>
                  
                  {/* Details */}
                  {details && details.length > 0 && (
                    <div className="mt-4 bg-gray-50 rounded-lg p-3 space-y-2">
                      {details.map((detail, index) => (
                        <div key={index} className="flex justify-between text-sm">
                          <span className="text-gray-600">{detail.label}:</span>
                          <span className="font-medium text-gray-900">{detail.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Actions */}
              <div className="mt-6 flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
                >
                  {cancelText}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onConfirm();
                    onClose();
                  }}
                  className={`px-4 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors ${buttonColors[type]}`}
                >
                  {confirmText}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
} 