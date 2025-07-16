'use client';

import React from 'react';
import { useSyncProjectV2 } from '../../../hooks/useSyncProjectV2';
import ProjectSyncLoader from '../../../components/xero/ProjectSyncLoader';
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
 * Example using the tenant-aware loader
 * The ProjectSyncLoader will automatically load the correct component
 * based on the current tenant ID
 */
export default function XeroPageWithLoader() {
  const { isAnalyzing, isRunning } = useSyncProjectV2();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Xero Integration Dashboard</h1>
          <p className="mt-2 text-gray-600">Manage your projects and synchronization between Pipedrive and Xero</p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* This will load the appropriate sync component based on tenant */}
          <ProjectSyncLoader />
          
          <ManhourBillingCard />
          <TimesheetProcessingCard />
          <ContactUpdateCard />
          <InvoicesDownloadCard />
          <InvoiceUpdateCard />
          <InvoiceUpdateDirectCard />
          <QuotesDownloadCard />
          <MonthlySnapshotCard />
        </div>
      </div>
    </div>
  );
}