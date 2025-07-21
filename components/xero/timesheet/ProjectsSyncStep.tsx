'use client';

import React, { useState, useEffect } from 'react';
import { ArrowPathIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { formatDistanceToNow } from 'date-fns';

interface ProjectsSyncStepProps {
  tenantId: string;
  tenantName: string;
  onSyncComplete?: (success: boolean, projectCount: number) => void;
  disabled?: boolean;
}

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
}

export default function ProjectsSyncStep({ 
  tenantId, 
  tenantName, 
  onSyncComplete,
  disabled = false 
}: ProjectsSyncStepProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncInfo, setSyncInfo] = useState<SyncInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSynced, setHasSynced] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    if (tenantId) {
      fetchSyncInfo();
    }
  }, [tenantId]);

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
      const response = await fetch('/api/xero/projects/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tenantId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to sync projects');
      }

      setSyncResult(data);
      setHasSynced(true);
      await fetchSyncInfo();
      
      onSyncComplete?.(data.success, data.projectsSynced);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setHasSynced(true);
      onSyncComplete?.(false, 0);
    } finally {
      setIsSyncing(false);
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    return `${seconds}s`;
  };

  const handleVerifySync = async () => {
    setIsVerifying(true);
    setVerificationResult(null);
    
    try {
      const response = await fetch('/api/xero/verify-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          tenantId,
          checkAll: true,
          limit: 5
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to verify sync');
      }

      setVerificationResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  const getStatusIcon = () => {
    if (isSyncing) {
      return <ArrowPathIcon className="h-5 w-5 text-blue-500 animate-spin" />;
    }
    if (error) {
      return <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />;
    }
    if (syncResult) {
      return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
    }
    return null;
  };

  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          {getStatusIcon()}
          <div>
            <h4 className="text-sm font-medium text-gray-900">Sync Xero Projects</h4>
            <p className="text-xs text-gray-500">
              {syncInfo && syncInfo.lastSyncedAt ? (
                <>Last synced {formatDistanceToNow(new Date(syncInfo.lastSyncedAt), { addSuffix: true })}</>
              ) : (
                'Never synced'
              )}
            </p>
          </div>
        </div>
        
        <button
          onClick={handleSync}
          disabled={disabled || isSyncing}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            disabled || isSyncing
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {isSyncing ? 'Syncing...' : hasSynced ? 'Sync Again' : 'Sync Projects'}
        </button>
      </div>

      {/* Sync Status */}
      {(syncResult || error) && (
        <div className={`mt-3 p-3 rounded-md text-sm ${
          error 
            ? 'bg-red-50 border border-red-200' 
            : 'bg-green-50 border border-green-200'
        }`}>
          {error ? (
            <p className="text-red-700">{error}</p>
          ) : syncResult && (
            <div className="space-y-1">
              <p className="text-green-700">
                Successfully synced {syncResult.projectsSynced} projects with {syncResult.tasksSynced} tasks
              </p>
              {syncResult.projectsFailed > 0 && (
                <p className="text-amber-600">
                  {syncResult.projectsFailed} projects failed to sync
                </p>
              )}
              <p className="text-gray-600 text-xs">
                Completed in {formatDuration(syncResult.syncDuration)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Current Project Count */}
      {syncInfo && syncInfo.projectCount > 0 && !isSyncing && (
        <div className="mt-2 text-xs text-gray-500">
          {syncInfo.projectCount} projects in database
          {hasSynced && (
            <button
              onClick={handleVerifySync}
              disabled={isVerifying}
              className="ml-2 text-blue-600 hover:text-blue-800 underline"
            >
              {isVerifying ? 'Verifying...' : 'Verify Sync'}
            </button>
          )}
        </div>
      )}

      {/* Verification Results */}
      {verificationResult && verificationResult.verification && (
        <div className={`mt-3 p-3 rounded-md text-xs ${
          verificationResult.verification.totalMismatches > 0 
            ? 'bg-amber-50 border border-amber-200' 
            : 'bg-green-50 border border-green-200'
        }`}>
          <p className={`font-medium mb-1 ${
            verificationResult.verification.totalMismatches > 0 
              ? 'text-amber-800' 
              : 'text-green-800'
          }`}>
            Sync Verification Results:
          </p>
          <div className="space-y-1">
            <p>Checked {verificationResult.verification.projectsChecked} projects</p>
            {verificationResult.verification.totalMismatches > 0 ? (
              <>
                <p className="text-amber-700">
                  Found {verificationResult.verification.totalMismatches} data mismatches in {verificationResult.verification.projectsWithMismatches} projects
                </p>
                {verificationResult.verification.summary && (
                  <div className="mt-2 pl-2 border-l-2 border-amber-300">
                    {verificationResult.verification.summary.rateValueMismatches > 0 && (
                      <p>• Rate value mismatches: {verificationResult.verification.summary.rateValueMismatches}</p>
                    )}
                    {verificationResult.verification.summary.estimateMinutesMismatches > 0 && (
                      <p>• Estimate minutes mismatches: {verificationResult.verification.summary.estimateMinutesMismatches}</p>
                    )}
                    {verificationResult.verification.summary.statusMismatches > 0 && (
                      <p>• Status mismatches: {verificationResult.verification.summary.statusMismatches}</p>
                    )}
                  </div>
                )}
                <p className="text-amber-600 mt-2">
                  <strong>Action Required:</strong> Run sync again to update data
                </p>
              </>
            ) : (
              <p className="text-green-700">All data is in sync with Xero ✓</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}