'use client';

import React, { useEffect, useState } from 'react';
import { BuildingOfficeIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

interface PipedriveUser {
  companyName: string;
  companyId: number;
  userName: string;
  email: string;
  tenantId: string;
  tenantDescription: string;
}

/**
 * PipedriveConnectionCard component
 * Displays the connected Pipedrive company information
 * Automatically updates when the Xero tenant is changed
 */
export default function PipedriveConnectionCard() {
  const [user, setUser] = useState<PipedriveUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUserInfo = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/pipedrive/user');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch Pipedrive user information');
      }
      
      if (data.success && data.data) {
        setUser(data.data);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserInfo();
    
    // Listen for tenant changes
    const handleTenantChange = () => {
      fetchUserInfo();
    };
    
    window.addEventListener('tenantChanged', handleTenantChange);
    
    return () => {
      window.removeEventListener('tenantChanged', handleTenantChange);
    };
  }, []);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <BuildingOfficeIcon className="h-6 w-6 text-gray-400" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900">Pipedrive Connection</h3>
              <p className="text-sm text-gray-500">Connected organization details</p>
            </div>
          </div>
          <div className="flex items-center">
            {loading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></div>
            ) : error ? (
              <ExclamationCircleIcon className="h-5 w-5 text-red-500" />
            ) : (
              <CheckCircleIcon className="h-5 w-5 text-green-500" />
            )}
          </div>
        </div>
      </div>
      
      <div className="border-t border-gray-100 px-6 py-4">
        {loading ? (
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
          </div>
        ) : error ? (
          <div className="text-sm text-red-600">
            <p className="font-medium">Connection Error</p>
            <p className="text-xs mt-1">{error}</p>
          </div>
        ) : user ? (
          <div>
            <p className="text-lg font-semibold text-gray-900">{user.companyName}</p>
            <p className="text-sm text-gray-500 mt-1">
              Connected as: {user.userName} ({user.email})
            </p>
            <p className="text-xs text-gray-400 mt-2">
              Tenant: {user.tenantDescription}
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No connection information available</p>
        )}
      </div>
      
      {!loading && !error && (
        <div className="bg-gray-50 px-6 py-3">
          <button
            onClick={fetchUserInfo}
            className="text-sm text-indigo-600 hover:text-indigo-900 font-medium"
          >
            Refresh Connection
          </button>
        </div>
      )}
    </div>
  );
} 