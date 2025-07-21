'use client';

import React, { useState } from 'react';
import { ArrowUpCircleIcon, PlusCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface UpdatePayload {
  projectId: string;
  taskId?: string;
  payload: {
    name: string;
    rate: {
      currency: string;
      value: number | string;
    };
    chargeType: string;
    estimateMinutes: number;
  };
}

interface XeroUpdatePreviewProps {
  updates: UpdatePayload[];
  creates: UpdatePayload[];
  closedProjectsCount: number;
  onConfirm: () => void;
  onCancel: () => void;
  isUpdating?: boolean;
}

export default function XeroUpdatePreview({
  updates,
  creates,
  closedProjectsCount,
  onConfirm,
  onCancel,
  isUpdating = false
}: XeroUpdatePreviewProps) {
  const [showDetails, setShowDetails] = useState(true);
  
  const totalChanges = updates.length + creates.length;
  
  const formatCurrency = (value: number | string, currency: string = 'SGD') => {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(numValue);
  };

  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Review Changes Before Updating Xero
        </h3>
        
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center">
            <div className="flex items-center justify-center mb-1">
              <ArrowUpCircleIcon className="h-8 w-8 text-blue-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{updates.length}</p>
            <p className="text-sm text-gray-600">Tasks to Update</p>
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center mb-1">
              <PlusCircleIcon className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{creates.length}</p>
            <p className="text-sm text-gray-600">Tasks to Create</p>
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center mb-1">
              <ExclamationTriangleIcon className="h-8 w-8 text-amber-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{closedProjectsCount}</p>
            <p className="text-sm text-gray-600">Closed Projects Skipped</p>
          </div>
        </div>

        {closedProjectsCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded p-3 mb-4">
            <p className="text-sm text-amber-800">
              <strong>Note:</strong> {closedProjectsCount} closed projects with requested changes will be skipped.
              Only active projects will be updated.
            </p>
          </div>
        )}

        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-sm text-blue-600 hover:text-blue-800 mb-3"
        >
          {showDetails ? 'Hide' : 'Show'} detailed changes
        </button>

        {showDetails && (
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {/* Updates Section */}
            {updates.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
                  <ArrowUpCircleIcon className="h-4 w-4 mr-1 text-blue-600" />
                  Task Updates ({updates.length})
                </h4>
                <div className="space-y-2">
                  {updates.map((update, idx) => (
                    <div key={idx} className="bg-white rounded p-3 border border-gray-200">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{update.payload.name}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            Project: {update.projectId.slice(0, 8)}... | Task: {update.taskId?.slice(0, 8)}...
                          </p>
                        </div>
                        <div className="text-right text-sm">
                          <p className="text-gray-700">
                            {formatCurrency(update.payload.rate.value, update.payload.rate.currency)}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatMinutes(update.payload.estimateMinutes)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Creates Section */}
            {creates.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
                  <PlusCircleIcon className="h-4 w-4 mr-1 text-green-600" />
                  New Tasks ({creates.length})
                </h4>
                <div className="space-y-2">
                  {creates.map((create, idx) => (
                    <div key={idx} className="bg-white rounded p-3 border border-gray-200">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{create.payload.name}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            Project: {create.projectId.slice(0, 8)}...
                          </p>
                        </div>
                        <div className="text-right text-sm">
                          <p className="text-gray-700">
                            {formatCurrency(create.payload.rate.value, create.payload.rate.currency)}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatMinutes(create.payload.estimateMinutes)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onCancel}
          disabled={isUpdating}
          className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={isUpdating || totalChanges === 0}
          className={`flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
            isUpdating || totalChanges === 0
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {isUpdating ? 'Updating Xero...' : `Apply ${totalChanges} Changes to Xero`}
        </button>
      </div>
    </div>
  );
}