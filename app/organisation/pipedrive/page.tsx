'use client';

import React from 'react';
import { PipedriveConnectionCard, PipedriveDealUpdateCard } from '@/components/pipedrive';

/**
 * Pipedrive integration page component
 * Displays Pipedrive-specific features and functionality
 * Includes connection status and deal management tools
 * @returns {JSX.Element} The Pipedrive integration page
 */
export default function PipedrivePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Pipedrive Integration</h1>
          <p className="mt-2 text-lg text-gray-600">
            Manage your Pipedrive deals and products seamlessly
          </p>
        </div>

        {/* Connection Status */}
        <div className="mb-12">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Connection Status</h2>
          <div className="grid gap-6 md:grid-cols-1">
            <PipedriveConnectionCard />
          </div>
        </div>

        {/* Deal Management Tools */}
        <div className="mb-12">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Deal Management</h2>
          <div className="grid gap-6 md:grid-cols-1">
            <PipedriveDealUpdateCard />
          </div>
        </div>

        {/* Help Section */}
        <div className="mt-12 bg-blue-50 rounded-xl p-6 border border-blue-100">
          <h3 className="text-sm font-medium text-blue-900 mb-2">Need Help?</h3>
          <p className="text-sm text-blue-700">
            For detailed documentation on using the Pipedrive integration, including bulk deal updates 
            and product management, contact your system administrator or refer to the user guide.
          </p>
        </div>
      </div>
    </div>
  );
}

