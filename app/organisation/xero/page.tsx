'use client';

import React from 'react';
import { TimesheetProcessingCard } from '../../../components/xero';
import { SyncButton } from '../../../components/xero/SyncButton';
import { XeroValidationSummary } from '../../../components/xero/XeroValidationSummary';

export default function XeroPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Xero Integration Dashboard</h1>
          <p className="mt-2 text-gray-600">Process timesheets and synchronize data with Xero</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Pipedrive Validation Section */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-200">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Pipedrive-Xero Validation</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Validate deal titles, cross-reference quotes and projects between Pipedrive and Xero.
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                <SyncButton />
              </div>
            </div>
          </div>

          {/* Timesheet Processing Section */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-200">
            <TimesheetProcessingCard disabled={false} />
          </div>
        </div>

        {/* Xero Quote Validation Section - Full Width */}
        <div className="mt-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-200">
            <div className="p-6">
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Xero Quote Validation</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Validate accepted quotes for proper format and tracking options.
                </p>
              </div>
              <XeroValidationSummary />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}