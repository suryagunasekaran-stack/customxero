'use client';

import React from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';

interface LogDetailsProps {
  log: any;
  onClose: () => void;
}

export default function LogDetails({ log, onClose }: LogDetailsProps) {
  const formatDate = (date: string) => {
    return format(new Date(date), 'MMM dd, yyyy HH:mm:ss');
  };

  const renderJsonContent = (content: any) => {
    if (!content) return <span className="text-gray-500">None</span>;
    
    return (
      <pre className="bg-gray-50 p-3 rounded text-sm overflow-auto max-h-64">
        {JSON.stringify(content, null, 2)}
      </pre>
    );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose} />

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-start justify-between">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Audit Log Details
              </h3>
              <button
                onClick={onClose}
                className="rounded-md text-gray-400 hover:text-gray-500 focus:outline-none"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="mt-6 space-y-6">
              {/* Basic Information */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Action Type</label>
                  <p className="mt-1 text-sm text-gray-900">{log.action_type}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Action Group</label>
                  <p className="mt-1 text-sm text-gray-900">{log.action_group}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Status</label>
                  <p className="mt-1">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      log.status === 'SUCCESS' ? 'bg-green-100 text-green-800' :
                      log.status === 'FAILURE' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {log.status}
                    </span>
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Execution Time</label>
                  <p className="mt-1 text-sm text-gray-900">
                    {log.execution_time_ms ? `${log.execution_time_ms}ms` : 'N/A'}
                  </p>
                </div>
              </div>

              {/* User Information */}
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-2">User Information</h4>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div>
                    <span className="text-sm font-medium text-gray-700">User:</span>
                    <span className="ml-2 text-sm text-gray-900">{log.user_name || log.user_id}</span>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-700">Tenant:</span>
                    <span className="ml-2 text-sm text-gray-900">{log.tenant_name || log.tenant_id}</span>
                  </div>
                  {log.ip_address && (
                    <div>
                      <span className="text-sm font-medium text-gray-700">IP Address:</span>
                      <span className="ml-2 text-sm text-gray-900">{log.ip_address}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Timestamps */}
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-2">Timestamps</h4>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div>
                    <span className="text-sm font-medium text-gray-700">Created:</span>
                    <span className="ml-2 text-sm text-gray-900">{formatDate(log.created_at)}</span>
                  </div>
                  {log.completed_at && (
                    <div>
                      <span className="text-sm font-medium text-gray-700">Completed:</span>
                      <span className="ml-2 text-sm text-gray-900">{formatDate(log.completed_at)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Error Message */}
              {log.error_message && (
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Error Message</h4>
                  <div className="bg-red-50 rounded-lg p-4">
                    <p className="text-sm text-red-800">{log.error_message}</p>
                  </div>
                </div>
              )}

              {/* Details */}
              {log.details && (
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Details</h4>
                  {renderJsonContent(log.details)}
                </div>
              )}
            </div>
          </div>

          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={onClose}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 