'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Menu, 
  MenuButton, 
  MenuItem, 
  MenuItems
} from '@headlessui/react';
import { ChevronDownIcon, BuildingOfficeIcon, CheckIcon } from '@heroicons/react/24/outline';

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
  const [tenantsData, setTenantsData] = useState<TenantsData | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTenants();
  }, []);

  const fetchTenants = async () => {
    try {
      const response = await fetch('/api/tenants');
      if (response.ok) {
        const data = await response.json();
        setTenantsData(data);
      }
    } catch (error) {
      console.error('Failed to fetch tenants:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTenantSwitch = async (tenantId: string) => {
    if (tenantId === tenantsData?.selectedTenant) return;
    
    setSwitching(tenantId);
    
    try {
      const response = await fetch('/api/tenants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tenantId }),
      });

      if (response.ok) {
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
        
        // Also refetch tenants to ensure we have latest data
        setTimeout(() => {
          fetchTenants();
        }, 100);
      } else {
        console.error('Failed to switch tenant - response not ok');
        // Revert local state on error
        fetchTenants();
      }
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
        <MenuButton className="inline-flex w-full justify-center items-center gap-x-1.5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50">
          <BuildingOfficeIcon className="h-4 w-4 text-gray-400" />
          <span className="max-w-32 truncate">
            {currentTenant?.tenantName || 'Select Organisation'}
          </span>
          <ChevronDownIcon className="h-4 w-4 text-gray-400" />
        </MenuButton>
      </div>

      <MenuItems
        transition
        className="absolute right-0 z-10 mt-2 w-64 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 transition focus:outline-none data-[closed]:scale-95 data-[closed]:transform data-[closed]:opacity-0 data-[enter]:duration-100 data-[leave]:duration-75 data-[enter]:ease-out data-[leave]:ease-in"
      >
        <div className="py-1">
          <div className="px-4 py-2 text-xs font-medium text-gray-500 border-b border-gray-200">
            Switch Organisation
          </div>
          {tenantsData.availableTenants.map((tenant) => (
            <MenuItem key={tenant.tenantId}>
              {({ focus }) => (
                <button
                  onClick={() => handleTenantSwitch(tenant.tenantId)}
                  disabled={switching === tenant.tenantId}
                  className={`${
                    focus ? 'bg-gray-100 text-gray-900' : 'text-gray-700'
                  } flex w-full items-center px-4 py-2 text-sm disabled:opacity-50`}
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
              )}
            </MenuItem>
          ))}
          <div className="border-t border-gray-200">
            <MenuItem>
              {({ focus }) => (
                <button
                  onClick={() => router.push('/tenant-selection')}
                  className={`${
                    focus ? 'bg-gray-100 text-gray-900' : 'text-gray-700'
                  } flex w-full items-center px-4 py-2 text-sm`}
                >
                  <BuildingOfficeIcon className="h-4 w-4 text-gray-400 mr-3" />
                  Manage Organisations
                </button>
              )}
            </MenuItem>
          </div>
        </div>
      </MenuItems>
    </Menu>
  );
} 