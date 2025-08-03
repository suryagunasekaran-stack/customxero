'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Listbox,
    ListboxButton,
    ListboxOption,
    ListboxOptions,
    Transition
} from '@headlessui/react';
import { ChevronDownIcon, CheckIcon, BuildingOfficeIcon } from '@heroicons/react/20/solid';
import { useXeroApiUsage } from '@/contexts/XeroApiUsageContext';
import { useRouter } from 'next/navigation';
import { logger } from '@/lib/logger';

/**
 * Tenant data structure returned from the API
 */
interface Tenant {
    tenantId: string;
    tenantName: string;
    tenantType: string;
}

/**
 * API response structure for tenant operations
 */
interface TenantsResponse {
    availableTenants: Tenant[];
    selectedTenant: string;
    hasMultipleTenants: boolean;
    tenants: Tenant[]; // Legacy compatibility
    error?: string; // Error message if request fails
}

/**
 * Utility function to combine CSS class names
 * Filters out falsy values and joins remaining classes with spaces
 */
function classNames(...classes: string[]) {
    return classes.filter(Boolean).join(' ');
}

/**
 * TenantSelector component for switching between Xero organizations
 * Provides a dropdown interface for users to select between available tenants
 * Integrates with the Xero API usage context for real-time updates
 * 
 * Features:
 * - Fetches available tenants from /api/tenants
 * - Shows current selected tenant
 * - Allows switching via dropdown interface
 * - Handles loading and error states
 * - Refreshes context after switching
 * - Gracefully handles single-tenant scenarios
 * - Responsive design for mobile and desktop
 */
interface TenantSelectorProps {
    isMobile?: boolean;
}

export default function TenantSelector({ isMobile = false }: TenantSelectorProps) {
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [selectedTenant, setSelectedTenant] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSwitching, setIsSwitching] = useState(false);
    const [error, setError] = useState<string>('');
    const [hasMultipleTenants, setHasMultipleTenants] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    const MAX_RETRIES = 3;
    
    const { checkTenantChange } = useXeroApiUsage();
    const router = useRouter();

    /**
     * Fetches the list of available tenants and current selection
     */
    const fetchTenants = async () => {
        try {
            setIsLoading(true);
            setError('');
            
            const response = await fetch('/api/tenants');
            
            if (!response.ok) {
                throw new Error(`Failed to fetch tenants: ${response.status}`);
            }
            
            const data: TenantsResponse = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            setTenants(data.availableTenants || data.tenants || []);
            setSelectedTenant(data.selectedTenant || '');
            setHasMultipleTenants(data.hasMultipleTenants || false);
            
        } catch (error) {
            logger.error('Error fetching tenants', { error, context: 'TenantSelector' });
            setError(error instanceof Error ? error.message : 'Failed to load tenants');
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Retries fetching tenants with exponential backoff
     */
    const fetchTenantsWithRetry = useCallback(async () => {
        try {
            await fetchTenants();
            setRetryCount(0); // Reset on success
        } catch (error) {
            if (retryCount < MAX_RETRIES) {
                setTimeout(() => {
                    setRetryCount(prev => prev + 1);
                    fetchTenantsWithRetry();
                }, 1000 * Math.pow(2, retryCount)); // Exponential backoff
            }
        }
    }, [retryCount]);

    /**
     * Switches to a new tenant and updates the context
     */
    const switchTenant = useCallback(async (newTenantId: string) => {
        if (newTenantId === selectedTenant || isSwitching) {
            return;
        }
        
        try {
            setIsSwitching(true);
            setError('');
            
            const response = await fetch('/api/tenants', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ tenantId: newTenantId }),
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `Failed to switch tenant: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.message || 'Failed to switch tenant');
            }
            
            // Update local state
            setSelectedTenant(newTenantId);
            
            // Trigger context refresh to update API usage for new tenant
            await checkTenantChange();
            
            // Use Next.js router to refresh the page without full reload
            // This preserves React state while refreshing server-side data
            router.refresh();
            
        } catch (error) {
            logger.error('Error switching tenant', { error, newTenantId, context: 'TenantSelector' });
            setError(error instanceof Error ? error.message : 'Failed to switch tenant');
        } finally {
            setIsSwitching(false);
        }
    }, [selectedTenant, isSwitching, checkTenantChange, router]);

    // Load tenants on component mount
    useEffect(() => {
        fetchTenants();
    }, []);

    // Don't render if loading initially
    if (isLoading) {
        return (
            <div className={classNames(
                "flex items-center gap-2",
                isMobile ? "text-gray-600" : "text-indigo-200"
            )}>
                <div className="animate-spin h-5 w-5 rounded-full border-2 border-gray-300 border-t-blue-500" />
                <span className="text-sm">Loading tenants...</span>
            </div>
        );
    }

    // Don't render if there's an error or no tenants
    if (error || tenants.length === 0) {
        return (
            <div className="space-y-2">
                <div className={classNames(
                    "bg-red-50 border border-red-200 rounded-lg p-3",
                    isMobile ? "" : "bg-red-900/20 border-red-800/30"
                )}>
                    <div className="flex items-center">
                        <BuildingOfficeIcon className={classNames(
                            "h-5 w-5 mr-2",
                            isMobile ? "text-red-500" : "text-red-400"
                        )} />
                        <span className={classNames(
                            "text-sm",
                            isMobile ? "text-red-700" : "text-red-300"
                        )}>
                            {error || 'No tenants available'}
                        </span>
                    </div>
                </div>
                {error && retryCount < MAX_RETRIES && (
                    <button 
                        onClick={fetchTenantsWithRetry}
                        className={classNames(
                            "text-xs font-medium hover:underline transition-colors duration-200",
                            isMobile ? "text-blue-700 hover:text-blue-800" : "text-blue-300 hover:text-blue-200"
                        )}
                    >
                        Retry ({MAX_RETRIES - retryCount} attempts left)
                    </button>
                )}
            </div>
        );
    }

    // Don't render the dropdown for single tenant (just show the name)
    if (!hasMultipleTenants) {
        // Memoize computed values for performance
    const currentTenant = useMemo(() => 
        tenants.find(t => t.tenantId === selectedTenant) || tenants[0],
        [tenants, selectedTenant]
    );
        return (
            <div className={classNames(
                "flex items-center gap-2",
                isMobile ? "text-gray-900" : "text-indigo-100"
            )}>
                <BuildingOfficeIcon className="h-5 w-5" />
                <span className="text-sm font-medium">{currentTenant?.tenantName}</span>
            </div>
        );
    }

    // Memoize computed values for performance
    const currentTenant = useMemo(() => 
        tenants.find(t => t.tenantId === selectedTenant) || tenants[0],
        [tenants, selectedTenant]
    );

    return (
        <div className="relative">
            <Listbox value={selectedTenant} onChange={switchTenant} disabled={isSwitching}>
                <ListboxButton
                    className={classNames(
                        'relative w-full rounded-lg py-2 pl-3 pr-10 text-left text-sm',
                        'focus:outline-none focus:ring-2 transition-colors duration-200',
                        isMobile 
                            ? 'bg-gray-100 hover:bg-gray-200 focus:ring-indigo-500 text-gray-900'
                            : 'bg-white/10 hover:bg-white/20 focus:ring-white/25 text-white',
                        isSwitching ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                    )}
                >
                    <div className="flex items-center gap-2">
                        <BuildingOfficeIcon className={classNames(
                            "h-5 w-5",
                            isMobile ? "text-gray-500" : "text-indigo-200"
                        )} />
                        <span className={classNames(
                            "block truncate",
                            isMobile ? "text-gray-900 font-medium" : "text-white font-medium"
                        )}>
                            {isSwitching ? 'Switching...' : (currentTenant?.tenantName || 'Select tenant')}
                        </span>
                    </div>
                    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                        {isSwitching ? (
                            <div className="animate-spin h-5 w-5 rounded-full border-2 border-gray-300 border-t-blue-500" />
                        ) : (
                            <ChevronDownIcon
                                className={classNames(
                                    'h-5 w-5 transition-transform duration-200',
                                    isMobile ? 'text-gray-500' : 'text-indigo-200'
                                )}
                                aria-hidden="true"
                            />
                        )}
                    </span>
                </ListboxButton>

                <Transition
                    leave="transition ease-in duration-100"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <ListboxOptions className="absolute z-10 mt-1 max-h-60 w-full min-w-max overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-none sm:text-sm">
                        {tenants.map((tenant) => (
                            <ListboxOption
                                key={tenant.tenantId}
                                value={tenant.tenantId}
                                className="group relative cursor-default select-none py-2 pl-3 pr-9 text-gray-900 data-[focus]:bg-indigo-600 data-[focus]:text-white"
                            >
                                <div className="flex items-center gap-2">
                                    <BuildingOfficeIcon className="h-5 w-5 text-gray-400 group-data-[focus]:text-white" />
                                    <div className="flex flex-col">
                                        <span className="block truncate font-medium group-data-[selected]:font-semibold">
                                            {tenant.tenantName}
                                        </span>
                                        <span className="text-xs text-gray-500 group-data-[focus]:text-indigo-200">
                                            {tenant.tenantType}
                                        </span>
                                    </div>
                                </div>

                                <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-indigo-600 group-data-[focus]:text-white [.group:not([data-selected])_&]:hidden">
                                    <CheckIcon className="h-5 w-5" aria-hidden="true" />
                                </span>
                            </ListboxOption>
                        ))}
                    </ListboxOptions>
                </Transition>
            </Listbox>

            {/* Error display */}
            {error && (
                <div className={classNames(
                    "absolute top-full mt-1 text-xs px-2 py-1 rounded-md z-50 border",
                    isMobile 
                        ? "text-red-700 bg-red-50 border-red-200" 
                        : "text-red-300 bg-red-900/20 border-red-800/30"
                )}>
                    {error}
                </div>
            )}
        </div>
    );
}