'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BuildingOfficeIcon } from '@heroicons/react/24/outline';

interface XeroTenant {
  tenantId: string;
  tenantName: string;
  tenantType: string;
  createdDateUtc: string;
  updatedDateUtc: string;
}

interface TenantsResponse {
  availableTenants: XeroTenant[];
  selectedTenant: string | null;
  hasMultipleTenants: boolean;
}

export default function TenantSelectionPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<XeroTenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTenants();
  }, []);

  const fetchTenants = async () => {
    try {
      const response = await fetch('/api/tenants');
      if (!response.ok) {
        throw new Error('Failed to fetch tenants');
      }
      
      const data: TenantsResponse = await response.json();
      setTenants(data.availableTenants);
      setSelectedTenant(data.selectedTenant);
      
      // If only one tenant, select it automatically
      if (!data.hasMultipleTenants && data.availableTenants.length > 0) {
        await handleTenantSelection(data.availableTenants[0].tenantId);
        return;
      }
      
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tenants');
      setLoading(false);
    }
  };

  const handleTenantSelection = async (tenantId: string) => {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/tenants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tenantId }),
      });

      if (!response.ok) {
        throw new Error('Failed to set selected tenant');
      }

      // Update local state
      setSelectedTenant(tenantId);
      
      // Force NextAuth to refresh the session
      router.refresh();
      
      // Small delay to ensure session is updated
      setTimeout(() => {
        router.push('/organisation');
      }, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select tenant');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your organisations...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md mx-auto text-center">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            <h3 className="font-medium">Error</h3>
            <p>{error}</p>
          </div>
          <button
            onClick={() => router.push('/api/connect')}
            className="mt-4 bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded"
          >
            Re-authenticate
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <BuildingOfficeIcon className="mx-auto h-12 w-12 text-blue-600" />
          <h1 className="mt-2 text-3xl font-extrabold text-gray-900">
            Select Organisation
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Choose which Xero organisation you'd like to work with
          </p>
        </div>

        <div className="space-y-4">
          {tenants.map((tenant) => (
            <div
              key={tenant.tenantId}
              className={`relative rounded-lg border bg-white px-6 py-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer ${
                selectedTenant === tenant.tenantId 
                  ? 'border-blue-500 ring-2 ring-blue-200' 
                  : 'border-gray-300'
              }`}
              onClick={() => !submitting && handleTenantSelection(tenant.tenantId)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <BuildingOfficeIcon className="h-6 w-6 text-gray-400 mr-3" />
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">
                      {tenant.tenantName}
                    </h3>
                    <p className="text-sm text-gray-500">
                      Type: {tenant.tenantType}
                    </p>
                    {tenant.updatedDateUtc && (
                      <p className="text-xs text-gray-400">
                        Last updated: {new Date(tenant.updatedDateUtc).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
                
                {submitting && selectedTenant === tenant.tenantId ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                ) : (
                  <div className={`h-4 w-4 rounded-full border-2 ${
                    selectedTenant === tenant.tenantId 
                      ? 'bg-blue-500 border-blue-500' 
                      : 'border-gray-300'
                  }`}>
                    {selectedTenant === tenant.tenantId && (
                      <div className="h-full w-full rounded-full bg-white scale-50"></div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            Don't see the organisation you're looking for?{' '}
            <button
              onClick={() => router.push('/api/connect')}
              className="font-medium text-blue-600 hover:text-blue-500"
            >
              Re-authenticate with Xero
            </button>
          </p>
        </div>
      </div>
    </div>
  );
} 