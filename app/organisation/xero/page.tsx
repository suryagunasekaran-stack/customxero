'use client';

import React, { useState, useEffect } from 'react';
import { useSyncProjectV2 } from '../../../hooks/useSyncProjectV2';
import ProjectSyncCardWithFixesV2 from '../../../components/xero/ProjectSyncCardWithFixesV2';
import ProjectSyncValidationTenantEA67107E from '../../../components/xero/ProjectSyncValidationTenantEA67107E';
import {
  ManhourBillingCard,
  TimesheetProcessingCard,
  ContactUpdateCard,
  InvoicesDownloadCard,
  InvoiceUpdateCard,
  InvoiceUpdateDirectCard,
  QuotesDownloadCard
} from '../../../components/xero';
import AgeingSummaryCard from '../../../components/xero/AgeingSummaryCard';
import MonthlySnapshotCard from '../../../components/xero/MonthlySnapshotCard';

/**
 * Example of how to use the new SyncProjectCardV2 component
 * This demonstrates the enhanced UI with real-time progress tracking
 */
export default function XeroPageV2Example() {
  // Use the new hook for better integration
  const { isAnalyzing, isRunning } = useSyncProjectV2();
  const [currentTenantId, setCurrentTenantId] = useState<string>('');

  useEffect(() => {
    // Fetch current tenant info
    const fetchTenantInfo = async () => {
      try {
        const response = await fetch('/api/tenants');
        if (response.ok) {
          const tenantData = await response.json();
          setCurrentTenantId(tenantData.selectedTenant || '');
        }
      } catch (error) {
        console.error('Failed to fetch tenant info:', error);
      }
    };
    
    fetchTenantInfo();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Xero Integration Dashboard</h1>
          <p className="mt-2 text-gray-600">Manage your projects and synchronization between Pipedrive and Xero</p>
        </div>

        <div className="space-y-8">
          {/* Project Sync Card - Show different component based on tenant */}
          {currentTenantId === '6dd39ea4-e6a6-4993-a37a-21482ccf8d22' && (
            <ProjectSyncCardWithFixesV2 disabled={false} />
          )}
          {currentTenantId === 'ea67107e-c352-40a9-a8b8-24d81ae3fc85' && (
            <ProjectSyncValidationTenantEA67107E disabled={false} />
          )}

          {/* Other Tools Grid */}
          <div>
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Additional Tools</h2>
            <div className="grid gap-6 md:grid-cols-2">
              <ManhourBillingCard disabled={isRunning} />
              <TimesheetProcessingCard disabled={isRunning} />
              <AgeingSummaryCard disabled={isRunning} />
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