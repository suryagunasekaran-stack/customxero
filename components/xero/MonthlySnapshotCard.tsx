'use client';

import React, { useState } from 'react';
import { CameraIcon, CalendarDaysIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import ConfirmationDialog from '../ConfirmationDialog';

interface MonthlySnapshotCardProps {
  disabled?: boolean;
}

export default function MonthlySnapshotCard({ disabled = false }: MonthlySnapshotCardProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [lastSnapshot, setLastSnapshot] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const currentMonth = new Date().toLocaleString('default', { month: 'long' });
  const currentYear = new Date().getFullYear();

  const handleCreateSnapshot = async () => {
    setIsProcessing(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch('/api/xero/create-monthly-snapshot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Server responded with ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error('Failed to create snapshot');
      }

      setLastSnapshot(data.snapshot);
      setSuccess(true);

      // Auto-download report
      if (data.downloadableReport) {
        const blob = new Blob([data.downloadableReport.content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = data.downloadableReport.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }

      // Reset success state after 5 seconds
      setTimeout(() => setSuccess(false), 5000);

    } catch (error: any) {
      setError(error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-200">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Monthly Snapshot</h2>
              <p className="text-sm text-gray-500 mt-1">
                Capture Work In Progress values for month-end reporting
              </p>
            </div>
            <div className="flex items-center text-sm text-gray-500">
              <CalendarDaysIcon className="h-4 w-4 mr-1" />
              {currentMonth} {currentYear}
            </div>
          </div>

          {/* Status Messages */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {success && lastSnapshot && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-start gap-3">
                <CheckCircleIcon className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-800">Snapshot created successfully!</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-green-700">
                    <div>Projects: {lastSnapshot.summary.totalProjects}</div>
                    <div>WIP Value: ${(lastSnapshot.summary.totalWipValue / 100).toFixed(2)}</div>
                    <div>Estimated: ${(lastSnapshot.summary.totalEstimatedCost / 100).toFixed(2)}</div>
                    <div>Actual: ${(lastSnapshot.summary.totalActualCost / 100).toFixed(2)}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Description */}
          <div className="mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-2">What this does:</h3>
              <ul className="space-y-1 text-sm text-gray-600">
                <li className="flex items-start">
                  <span className="text-gray-400 mr-2">•</span>
                  <span>Captures current project costs and time entries</span>
                </li>
                <li className="flex items-start">
                  <span className="text-gray-400 mr-2">•</span>
                  <span>Calculates Work In Progress values</span>
                </li>
                <li className="flex items-start">
                  <span className="text-gray-400 mr-2">•</span>
                  <span>Generates downloadable CSV report</span>
                </li>
                <li className="flex items-start">
                  <span className="text-gray-400 mr-2">•</span>
                  <span>Preserves historical data for tracking</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={() => setShowConfirmation(true)}
            disabled={disabled || isProcessing}
            className="w-full inline-flex items-center justify-center px-4 py-3 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
            style={{
              backgroundColor: (disabled || isProcessing) 
                ? 'oklch(21.6% 0.006 56.043)' 
                : 'oklch(27.4% 0.006 286.033)'
            }}
            onMouseEnter={(e) => {
              if (!disabled && !isProcessing) {
                e.currentTarget.style.backgroundColor = 'oklch(21.6% 0.006 56.043)';
              }
            }}
            onMouseLeave={(e) => {
              if (!disabled && !isProcessing) {
                e.currentTarget.style.backgroundColor = 'oklch(27.4% 0.006 286.033)';
              }
            }}
          >
            {isProcessing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                Creating Snapshot...
              </>
            ) : (
              <>
                <CameraIcon className="h-4 w-4 mr-2" />
                Create {currentMonth} Snapshot
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
          handleCreateSnapshot();
        }}
        title="Create Monthly Snapshot"
        message={`This will create a WIP snapshot for ${currentMonth} ${currentYear}. The snapshot captures the current state of all projects including costs, time entries, and calculated WIP values.`}
        details={[
          { label: 'Period', value: `${currentMonth} ${currentYear}` },
          { label: 'Type', value: 'Work In Progress (WIP)' },
          { label: 'Output', value: 'CSV Report' }
        ]}
        confirmText="Create Snapshot"
        type="info"
      />
    </>
  );
} 