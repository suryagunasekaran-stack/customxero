'use client';

import React from 'react';
import { useSyncProject } from '../../../hooks/useSyncProject';
import {
  SyncProjectCard,
  UpdateProjectCostCard,
  ManhourBillingCard,
  CheckProjectTasksCard
} from '../../../components/xero';

export default function XeroPage() {
  // Get syncing state to pass to components that need to be disabled during sync
  const { isSyncing } = useSyncProject();

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Xero Functions</h1>
      <p className="mt-2 text-sm text-gray-700 mb-8">
        This page provides custom functions to interact with Xero data and streamline your project management workflows.
      </p>

      <div className="flex flex-col gap-6">
        <SyncProjectCard disabled={false} />
        <UpdateProjectCostCard disabled={isSyncing} />
        <CheckProjectTasksCard disabled={isSyncing} />
        <ManhourBillingCard disabled={isSyncing} />
      </div>
    </div>
  );
}
