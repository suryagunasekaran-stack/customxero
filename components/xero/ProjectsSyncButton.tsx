'use client';

import React, { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';

interface SyncResult {
  success: boolean;
  projectsSynced: number;
  projectsFailed: number;
  tasksSynced: number;
  errors: Array<{
    projectId: string;
    projectName: string;
    error: string;
  }>;
  syncDuration: number;
  tenantId: string;
}

interface SyncInfo {
  tenantId: string;
  lastSyncedAt: string | null;
  projectCount: number;
  projects: Array<{
    projectId: string;
    name: string;
    projectCode: string;
    status: string;
    totalTasks: number;
    totalProjectValue: number;
    lastSyncedAt: string;
  }>;
}

export default function ProjectsSyncButton() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncInfo, setSyncInfo] = useState<SyncInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const tenantId = '6dd39ea4-e6a6-4993-a37a-21482ccf8d22';

  useEffect(() => {
    fetchSyncInfo();
  }, []);

  const fetchSyncInfo = async () => {
    try {
      const response = await fetch(`/api/xero/projects/sync?tenantId=${tenantId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch sync info');
      }
      const data = await response.json();
      setSyncInfo(data);
    } catch (err) {
      console.error('Error fetching sync info:', err);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setError(null);
    setSyncResult(null);

    try {
      const response = await fetch(`/api/xero/projects/sync?tenantId=${tenantId}`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to sync projects');
      }

      setSyncResult(data);
      await fetchSyncInfo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSyncing(false);
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${seconds}s`;
  };

  const formatCurrency = (value: number, currency: string = 'SGD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(value);
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-black">Xero Projects Sync</h2>
          <p className="text-sm text-black">Tenant ID: {tenantId}</p>
        </div>
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className={`px-4 py-2 rounded-md text-white font-medium ${
            isSyncing
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {isSyncing ? 'Syncing...' : 'Sync Projects'}
        </button>
      </div>

      {syncInfo && syncInfo.lastSyncedAt && (
        <div className="mb-4 text-sm text-black">
          <p>Last synced: {formatDistanceToNow(new Date(syncInfo.lastSyncedAt), { addSuffix: true })}</p>
          <p>Total projects in database: {syncInfo.projectCount}</p>
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {syncResult && (
        <div className={`mb-4 p-4 rounded-md ${
          syncResult.success 
            ? 'bg-green-50 border border-green-200' 
            : 'bg-yellow-50 border border-yellow-200'
        }`}>
          <h3 className="font-medium mb-2 text-black">Sync Result</h3>
          <div className="space-y-1 text-sm text-black">
            <p>Projects synced: {syncResult.projectsSynced}</p>
            <p>Tasks synced: {syncResult.tasksSynced}</p>
            {syncResult.projectsFailed > 0 && (
              <p className="text-red-600">Projects failed: {syncResult.projectsFailed}</p>
            )}
            <p>Duration: {formatDuration(syncResult.syncDuration)}</p>
          </div>

          {syncResult.errors.length > 0 && (
            <div className="mt-3">
              <h4 className="text-sm font-medium text-red-800 mb-1">Errors:</h4>
              <ul className="text-sm text-red-700 space-y-1">
                {syncResult.errors.map((err, idx) => (
                  <li key={idx}>
                    {err.projectName}: {err.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {syncInfo && syncInfo.projects.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-sm text-blue-600 hover:text-blue-800 mb-3"
          >
            {showDetails ? 'Hide' : 'Show'} project details ({syncInfo.projects.length} projects)
          </button>

          {showDetails && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-black">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 text-black">Project Code</th>
                    <th className="text-left py-2 px-3 text-black">Name</th>
                    <th className="text-left py-2 px-3 text-black">Status</th>
                    <th className="text-center py-2 px-3 text-black">Tasks</th>
                    <th className="text-right py-2 px-3 text-black">Total Value</th>
                  </tr>
                </thead>
                <tbody>
                  {syncInfo.projects.map((project) => (
                    <tr key={project.projectId} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-3 font-mono text-black">{project.projectCode || '-'}</td>
                      <td className="py-2 px-3 text-black">{project.name}</td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          project.status === 'INPROGRESS' 
                            ? 'bg-blue-100 text-black' 
                            : 'bg-gray-100 text-black'
                        }`}>
                          {project.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center text-black">{project.totalTasks}</td>
                      <td className="py-2 px-3 text-right text-black">
                        {formatCurrency(project.totalProjectValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}