'use client';

import React, { useState } from 'react';
import { CalculatorIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import ConfirmationDialog from '../ConfirmationDialog';
import { FunctionCardProps } from './types';

interface ManhourBillingCardProps extends FunctionCardProps {}

export default function ManhourBillingCard({ disabled = false }: ManhourBillingCardProps) {
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleManhourBilling = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      // Simulate processing - in real implementation, this would call an API
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // For now, show a message that this feature is coming soon
      setError('This feature is currently under development and will be available soon.');
    } catch (error: any) {
      setError(error.message || 'An error occurred');
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
              <h2 className="text-xl font-semibold text-gray-900">Manhour Billing</h2>
              <p className="text-sm text-gray-500 mt-1">
                Generate client invoices from billable hours
              </p>
            </div>
            <div className="p-2 bg-gray-100 rounded-lg">
              <CalculatorIcon className="h-6 w-6 text-gray-600" />
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800">{error}</p>
            </div>
          )}

          {/* Description */}
          <div className="mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-2">What this does:</h3>
              <ul className="space-y-1 text-sm text-gray-600">
                <li className="flex items-start">
                  <span className="text-gray-400 mr-2">•</span>
                  <span>Calculates billable hours from project time entries</span>
                </li>
                <li className="flex items-start">
                  <span className="text-gray-400 mr-2">•</span>
                  <span>Applies client-specific billing rates</span>
                </li>
                <li className="flex items-start">
                  <span className="text-gray-400 mr-2">•</span>
                  <span>Generates draft invoices in Xero</span>
                </li>
                <li className="flex items-start">
                  <span className="text-gray-400 mr-2">•</span>
                  <span>Includes detailed time entry breakdown</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Coming Soon Badge */}
          <div className="mb-4 flex items-center justify-center">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
              Coming Soon
            </span>
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
                Processing...
              </>
            ) : (
              <>
                <DocumentTextIcon className="h-4 w-4 mr-2" />
                Generate Invoices
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
          handleManhourBilling();
        }}
        title="Generate Manhour Invoices"
        message="This will calculate billable hours from all active projects and create draft invoices in Xero. The invoices will need to be reviewed before sending to clients."
        details={[
          { label: 'Type', value: 'Draft Invoices' },
          { label: 'Source', value: 'Project Time Entries' },
          { label: 'Status', value: 'Feature Under Development' }
        ]}
        confirmText="Continue"
        type="warning"
      />
    </>
  );
} 