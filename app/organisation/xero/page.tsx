'use client';

import React from 'react';
import { useSyncProject } from '../../../hooks/useSyncProject';
import {
  SyncProjectCard,
  ManhourBillingCard,
  TimesheetProcessingCard
} from '../../../components/xero';
import MonthlySnapshotCard from '../../../components/xero/MonthlySnapshotCard';

/**
 * Main Xero integration page component
 * Displays comprehensive Xero integration dashboard with project management tools
 * Includes project synchronization, timesheet processing, billing, and reporting features
 * @returns {JSX.Element} The complete Xero integration dashboard
 */
export default function XeroPage() {
  // Get syncing state to pass to components that need to be disabled during sync
  const { isSyncing } = useSyncProject();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Xero Integration</h1>
          <p className="mt-2 text-lg text-gray-600">
            Streamline your project management and financial workflows
          </p>
        </div>

        {/* Main Actions */}
        <div className="mb-12">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Primary Actions</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <SyncProjectCard disabled={false} />
            <TimesheetProcessingCard disabled={isSyncing} />
          </div>
        </div>

        {/* Secondary Actions */}
        <div>
          <h2 className="text-lg font-medium text-gray-900 mb-4">Additional Tools</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <ManhourBillingCard disabled={isSyncing} />
            <MonthlySnapshotCard disabled={isSyncing} />
          </div>
        </div>

        {/* Help Section */}
        <div className="mt-12 bg-blue-50 rounded-xl p-6 border border-blue-100">
          <h3 className="text-sm font-medium text-blue-900 mb-2">Need Help?</h3>
          <p className="text-sm text-blue-700">
            For detailed documentation and support, contact your system administrator or refer to the user guide.
          </p>
        </div>
      </div>
    </div>
  );
}
