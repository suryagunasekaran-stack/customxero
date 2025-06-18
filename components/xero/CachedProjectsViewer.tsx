'use client';

import React, { useState, useEffect } from 'react';
import { 
  BuildingOfficeIcon, 
  ClockIcon, 
  FolderIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

interface CachedProjectData {
  projects: any[];
  lastUpdated: string;
  expiresAt: string;
  tenantId: string;
  tenantName: string;
  projectCount: number;
  isExpired: boolean;
}

interface CachedProjectsViewerProps {
  onRefresh?: () => Promise<void>;
  className?: string;
}

export default function CachedProjectsViewer({ onRefresh, className = '' }: CachedProjectsViewerProps) {
  const [cachedData, setCachedData] = useState<CachedProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCacheStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/xero/cache-status');
      
      if (response.ok) {
        const data = await response.json();
        console.log('[CachedProjectsViewer] Raw API response:', data);
        
        // Force set the data even if some fields are null
        const normalizedData = {
          projects: data.projects || [],
          lastUpdated: data.lastUpdated || new Date().toISOString(),
          expiresAt: data.expiresAt || new Date(Date.now() + 600000).toISOString(), // 10 min default
          tenantId: data.tenantId || '',
          tenantName: data.tenantName || 'Unknown',
          projectCount: data.projectCount || (data.projects ? data.projects.length : 0),
          isExpired: data.isExpired || false
        };
        
        console.log('[CachedProjectsViewer] Setting normalized data:', normalizedData);
        setCachedData(normalizedData);
      } else {
        const errorText = await response.text();
        console.error('[CachedProjectsViewer] API error:', response.status, errorText);
        setCachedData(null);
      }
    } catch (error) {
      console.error('[CachedProjectsViewer] Failed to fetch cache status:', error);
      setCachedData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!onRefresh) return;
    
    try {
      setRefreshing(true);
      await onRefresh();
      // Refresh cache status after update
      await fetchCacheStatus();
    } catch (error) {
      console.error('Failed to refresh cache:', error);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCacheStatus();
  }, []);



  if (loading) {
    return (
      <div className={`bg-white rounded-lg border border-gray-200 p-4 ${className}`}>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-3"></div>
          <div className="h-3 bg-gray-200 rounded w-1/2 mb-2"></div>
          <div className="h-3 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  // Always show the component, even with no data
  const hasData = cachedData && cachedData.projectCount > 0;
  
  if (!cachedData) {
    return (
      <div className={`bg-gray-50 rounded-lg border border-gray-200 p-4 ${className}`}>
        <div className="flex items-center text-gray-500">
          <ExclamationTriangleIcon className="h-5 w-5 mr-2" />
          <span className="text-sm">No cached project data available</span>
        </div>
        {onRefresh && (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="mt-3 w-full flex items-center justify-center text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-3 w-3 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Loading projects...' : 'Load projects from Xero'}
          </button>
        )}
      </div>
    );
  }

  const isExpired = cachedData.isExpired || new Date() > new Date(cachedData.expiresAt);
  const timeSinceUpdate = new Date().getTime() - new Date(cachedData.lastUpdated).getTime();
  const minutesAgo = Math.floor(timeSinceUpdate / (1000 * 60));

  return (
    <div className={`bg-white rounded-lg border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center">
            <FolderIcon className="h-4 w-4 mr-2 text-blue-600" />
            Cached Project Data
          </h3>
          <button
            onClick={handleRefresh}
            disabled={refreshing || !onRefresh}
            className="flex items-center text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-3 w-3 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Status Indicator */}
        <div className="flex items-center mb-3">
          {isExpired ? (
            <>
              <ExclamationTriangleIcon className="h-4 w-4 text-amber-500 mr-2" />
              <span className="text-sm text-amber-700 font-medium">Cache Expired</span>
            </>
          ) : (
            <>
              <CheckCircleIcon className="h-4 w-4 text-green-500 mr-2" />
              <span className="text-sm text-green-700 font-medium">Cache Valid</span>
            </>
          )}
        </div>

        {/* Cache Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="flex items-center">
            <BuildingOfficeIcon className="h-4 w-4 text-gray-400 mr-2" />
            <span className="text-gray-600">Tenant:</span>
            <span className="ml-2 font-medium text-gray-900 truncate">
              {cachedData.tenantName}
            </span>
          </div>
          
          <div className="flex items-center">
            <FolderIcon className="h-4 w-4 text-gray-400 mr-2" />
            <span className="text-gray-600">Projects:</span>
            <span className="ml-2 font-medium text-gray-900">
              {cachedData.projectCount}
            </span>
          </div>
          
          <div className="flex items-center">
            <ClockIcon className="h-4 w-4 text-gray-400 mr-2" />
            <span className="text-gray-600">Updated:</span>
            <span className="ml-2 font-medium text-gray-900">
              {minutesAgo === 0 ? 'Just now' : `${minutesAgo}m ago`}
            </span>
          </div>
          
          <div className="flex items-center">
            <ClockIcon className="h-4 w-4 text-gray-400 mr-2" />
            <span className="text-gray-600">Expires:</span>
            <span className={`ml-2 font-medium ${isExpired ? 'text-red-600' : 'text-gray-900'}`}>
              {isExpired ? 'Expired' : 'Valid'}
            </span>
          </div>
        </div>

        {/* Project Summary */}
        {cachedData.projects && cachedData.projects.length > 0 && (
          <div className="mt-4">
            <div className="text-xs text-gray-500 mb-2">Sample Projects:</div>
            <div className="bg-gray-50 rounded p-2 text-xs">
              {cachedData.projects.slice(0, 3).map((project, index) => (
                <div key={index} className="text-gray-700 truncate">
                  • {project.name || 'Unnamed Project'}
                </div>
              ))}
              {cachedData.projects.length > 3 && (
                <div className="text-gray-500">
                  ... and {cachedData.projects.length - 3} more
                </div>
              )}
            </div>
          </div>
        )}

        {/* Warning for expired cache */}
        {isExpired && (
          <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
            Cache has expired. Consider refreshing to get latest project data.
          </div>
        )}
      </div>
    </div>
  );
} 