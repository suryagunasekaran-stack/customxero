'use client';

import React from 'react';
import { useSyncProject } from '../../../hooks/useSyncProject';
import {
  SyncProjectCard,
  ManhourBillingCard,
  TimesheetProcessingCard,
  ContactUpdateCard,
  ContactDownloadCard,
  ProjectCreateCard,
  ProjectsInProgressCard,
  InvoicesDownloadCard,
  QuotesDownloadCard
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
        <div>
          <div className="grid gap-6 md:grid-cols-2">
          <SyncProjectCard disabled={false} />
            <ManhourBillingCard disabled={isSyncing} />
            <InvoicesDownloadCard disabled={isSyncing} />
            <TimesheetProcessingCard disabled={isSyncing} />
            <MonthlySnapshotCard disabled={isSyncing} />
            <ProjectsInProgressCard disabled={isSyncing} />
            <ContactDownloadCard disabled={isSyncing} />
            <ProjectCreateCard disabled={isSyncing} />
          </div>
        </div>
      </div>
    </div>
  );
}