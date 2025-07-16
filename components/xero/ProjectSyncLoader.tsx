'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';
import { FunctionCardProps } from './types';

// Lazy load tenant-specific components
const tenantComponents = {
  // BSENI tenant - current implementation
  '6dd39ea4-e6a6-4993-a37a-21482ccf8d22': dynamic(() => import('./ProjectSyncCard'), {
    loading: () => <div className="animate-pulse bg-gray-200 h-64 rounded-lg" />
  }),
  
  // New tenant - different implementation
  'new-tenant-id': dynamic(() => import('./sync-variants/NewTenantProjectSync'), {
    loading: () => <div className="animate-pulse bg-gray-200 h-64 rounded-lg" />
  }),
  
  // Another tenant with different sync logic
  'another-tenant-id': dynamic(() => import('./sync-variants/AnotherTenantProjectSync'), {
    loading: () => <div className="animate-pulse bg-gray-200 h-64 rounded-lg" />
  })
};

// Default component for unknown tenants
const DefaultProjectSync = () => (
  <div className="bg-gray-50 p-6 rounded-lg">
    <p className="text-gray-600">Project sync is not available for your organization.</p>
  </div>
);

export default function ProjectSyncLoader(props: FunctionCardProps) {
  const [currentTenantId, setCurrentTenantId] = React.useState<string>('');
  
  React.useEffect(() => {
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
  
  // Get the appropriate component for the current tenant
  const TenantComponent = tenantComponents[currentTenantId] || DefaultProjectSync;
  
  return <TenantComponent {...props} />;
}