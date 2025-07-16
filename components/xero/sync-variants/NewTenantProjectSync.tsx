'use client';

import React, { useState, useCallback } from 'react';
import { 
  ArrowPathIcon, 
  DocumentMagnifyingGlassIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline';
import { FunctionCardProps } from '../types';
import { useSession } from 'next-auth/react';

interface NewTenantProjectSyncProps extends FunctionCardProps {}

/**
 * This is a custom project sync implementation for a different tenant
 * with completely different validation rules and UI
 */
export default function NewTenantProjectSync({ disabled = false }: NewTenantProjectSyncProps) {
  const { data: sessionData } = useSession();
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationResults, setValidationResults] = useState<any>(null);

  const runValidation = useCallback(async () => {
    if (!sessionData?.user?.accessToken) {
      setError('No valid session. Please re-authenticate.');
      return;
    }

    setIsRunning(true);
    setError(null);

    try {
      // This tenant might use a different API endpoint or validation logic
      const response = await fetch('/api/sync/new-tenant-validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData.user.accessToken}`,
        },
        body: JSON.stringify({
          tenantId: 'new-tenant-id',
          // Different parameters for this tenant
          validateInvoices: true,
          checkDuplicates: true,
          customRules: {
            // This tenant has different business rules
            titleFormat: 'CustomerName | ProjectID | Year',
            requiredFields: ['customer', 'projectId', 'year'],
          }
        }),
      });

      if (!response.ok) {
        throw new Error(`Validation failed: ${response.statusText}`);
      }

      const data = await response.json();
      setValidationResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsRunning(false);
    }
  }, [sessionData]);

  return (
    <div className="bg-white overflow-hidden shadow rounded-lg">
      <div className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <DocumentMagnifyingGlassIcon className="h-6 w-6 text-blue-600" aria-hidden="true" />
          </div>
          <div className="ml-5 w-0 flex-1">
            <h3 className="text-lg font-medium text-gray-900">
              Custom Project Validation
            </h3>
            <p className="text-sm text-gray-500">
              Validate projects with custom rules for your organization
            </p>
          </div>
        </div>
      </div>
      
      <div className="bg-gray-50 px-5 py-3">
        <div className="text-sm">
          <button
            onClick={runValidation}
            disabled={disabled || isRunning}
            className="font-medium text-indigo-600 hover:text-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center"
          >
            <ArrowPathIcon className={`h-4 w-4 mr-1 ${isRunning ? 'animate-spin' : ''}`} />
            {isRunning ? 'Validating...' : 'Run Custom Validation'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 px-5 py-3 border-t border-gray-200">
          <div className="flex">
            <ExclamationCircleIcon className="h-5 w-5 text-red-400" />
            <p className="ml-2 text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}

      {validationResults && (
        <div className="bg-green-50 px-5 py-3 border-t border-gray-200">
          <p className="text-sm text-green-800">
            Validation complete! Found {validationResults.issueCount || 0} issues.
          </p>
        </div>
      )}
    </div>
  );
}