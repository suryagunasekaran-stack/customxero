'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Menu, 
  MenuButton, 
  MenuItem, 
  MenuItems
} from '@headlessui/react';
import { ChevronDownIcon, BuildingOfficeIcon, CheckIcon } from '@heroicons/react/24/outline';
import { useApiClient } from '@/hooks/useApiClient';

interface XeroTenant {
  tenantId: string;
  tenantName: string;
  tenantType: string;
  createdDateUtc: string;
  updatedDateUtc: string;
}

interface TenantsData {
  availableTenants: XeroTenant[];
  selectedTenant: string | null;
  hasMultipleTenants: boolean;
}

export default function TenantSwitcher() {
  const router = useRouter();
  
  // Memoize the error handler to prevent recreating apiCall
  const handleError = useCallback((error: Error) => {
    console.error('Failed to fetch tenants:', error);
  }, []);
  
  const { apiCall } = useApiClient({
    onError: handleError
  });
  const [tenantsData, setTenantsData] = useState<TenantsData | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchTenants = async () => {
      try {
        const data = await apiCall<TenantsData>('/api/tenants');
        if (!cancelled) {
          setTenantsData(data);
        }
      } catch (error) {
        // Error already logged by onError callback
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchTenants();

    return () => {
      cancelled = true;
    };
  }, [apiCall]);

  const handleTenantSwitch = async (tenantId: string) => {
    if (tenantId === tenantsData?.selectedTenant) return;
    
    setSwitching(tenantId);
    
    try {
      await apiCall('/api/tenants', {
        method: 'POST',
        body: JSON.stringify({ tenantId }),
      });
      
      // Update local state immediately
      setTenantsData(prev => prev ? {
        ...prev,
        selectedTenant: tenantId
      } : null);
      
      // Dispatch tenant change event for cache refresh
      const tenantChangeEvent = new CustomEvent('tenantChanged', {
        detail: { tenantId, tenantName: tenantsData?.availableTenants.find(t => t.tenantId === tenantId)?.tenantName }
      });
      window.dispatchEvent(tenantChangeEvent);
      
      // Use router.refresh() to force NextAuth to recalculate session
      router.refresh();
      
      // Force a hard refresh of the page to ensure all caches are cleared
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error) {
      console.error('Failed to switch tenant:', error);
      // Revert local state on error
      fetchTenants();
    } finally {
      setSwitching(null);
    }
  };

  if (loading || !tenantsData || !tenantsData.hasMultipleTenants) {
    return null; // Don't show if only one tenant or loading
  }

  const currentTenant = tenantsData.availableTenants.find(
    t => t.tenantId === tenantsData.selectedTenant
  );

  return (
    <Menu as="div" className="relative inline-block text-left">
      <div>
        <MenuButton className="inline-flex w-full justify-center items-center gap-x-1.5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs ring-1 ring-gray-300 ring-inset hover:bg-gray-50">
          <BuildingOfficeIcon className="h-4 w-4 text-gray-400" />
          <span className="max-w-48 truncate">
            {currentTenant?.tenantName || 'Select Organisation'}
          </span>
          <ChevronDownIcon className="h-4 w-4 text-gray-400" />
        </MenuButton>
      </div>

      <MenuItems
        transition
        className="absolute right-0 z-10 mt-2 w-80 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black/5 transition focus:outline-hidden data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
      >
        <div className="py-1">
          <div className="px-4 py-2 text-xs font-medium text-gray-500 border-b border-gray-200">
            Switch Organisation
          </div>
          {tenantsData.availableTenants.map((tenant) => (
            <MenuItem key={tenant.tenantId}>
              <button
                onClick={() => handleTenantSwitch(tenant.tenantId)}
                disabled={switching === tenant.tenantId}
                className="flex w-full items-center px-4 py-2 text-sm text-gray-700 data-focus:bg-gray-100 data-focus:text-gray-900 data-focus:outline-hidden disabled:opacity-50"
              >
                <div className="flex items-center flex-1 min-w-0">
                  <BuildingOfficeIcon className="h-4 w-4 text-gray-400 mr-3 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">
                      {tenant.tenantName}
                    </div>
                    <div className="text-xs text-gray-500">
                      {tenant.tenantType}
                    </div>
                  </div>
                  {switching === tenant.tenantId ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 ml-2"></div>
                  ) : tenantsData.selectedTenant === tenant.tenantId ? (
                    <CheckIcon className="h-4 w-4 text-blue-500 ml-2 flex-shrink-0" />
                  ) : null}
                </div>
              </button>
            </MenuItem>
          ))}
          <div className="border-t border-gray-200">
            <MenuItem>
              <button
                onClick={() => router.push('/tenant-selection')}
                className="flex w-full items-center px-4 py-2 text-sm text-gray-700 data-focus:bg-gray-100 data-focus:text-gray-900 data-focus:outline-hidden"
              >
                <BuildingOfficeIcon className="h-4 w-4 text-gray-400 mr-3" />
                Manage Organisations
              </button>
            </MenuItem>
          </div>
        </div>
      </MenuItems>
    </Menu>
  );
} 