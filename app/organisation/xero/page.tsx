'use client';

import React from 'react';
import { useSyncProjectV2 } from '../../../hooks/useSyncProjectV2';
import SyncProjectCardV2 from '../../../components/xero/SyncProjectCardV2';
import {
  ManhourBillingCard,
  TimesheetProcessingCard,
  ContactUpdateCard,
  InvoicesDownloadCard,
  InvoiceUpdateCard,
  InvoiceUpdateDirectCard,
  QuotesDownloadCard
} from '../../../components/xero';
import MonthlySnapshotCard from '../../../components/xero/MonthlySnapshotCard';

/**
 * Example of how to use the new SyncProjectCardV2 component
 * This demonstrates the enhanced UI with real-time progress tracking
 */
export default function XeroPageV2Example() {
  // Use the new hook for better integration
  const { isAnalyzing, isRunning } = useSyncProjectV2();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Xero Integration Dashboard</h1>
          <p className="mt-2 text-gray-600">Manage your projects and synchronization between Pipedrive and Xero</p>
        </div>

        <div className="space-y-8">
          {/* Featured Section - New Sync Card */}
          <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Project Synchronization</h2>
            <SyncProjectCardV2 disabled={false} />
          </div>

          {/* Other Tools Grid */}
          <div>
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Additional Tools</h2>
            <div className="grid gap-6 md:grid-cols-2">
              <ManhourBillingCard disabled={isRunning} />
              <TimesheetProcessingCard disabled={isRunning} />
              {/* Uncomment to enable additional features */}
              {/* <InvoicesDownloadCard disabled={isRunning} />
              <InvoiceUpdateCard disabled={isRunning} />
              <InvoiceUpdateDirectCard disabled={isRunning} />
              <MonthlySnapshotCard disabled={isRunning} /> */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}