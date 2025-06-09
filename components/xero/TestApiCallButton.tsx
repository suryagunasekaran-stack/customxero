'use client';

import React, { useState } from 'react';
import { CloudIcon } from '@heroicons/react/20/solid';
import { useLog } from '../../contexts/LogContext';
import { useXeroApiUsage } from '../../contexts/XeroApiUsageContext';

interface TestApiCallButtonProps {
  disabled?: boolean;
}

export default function TestApiCallButton({
  disabled = false,
}: TestApiCallButtonProps) {
  const { addLog } = useLog();
  const { refreshUsage } = useXeroApiUsage();
  const [isTesting, setIsTesting] = useState(false);

  const handleTestApiCall = async () => {
    if (isTesting) return;

    setIsTesting(true);
    
    const logId = addLog({ 
      message: 'Test API Call: Making a simple call to Xero Organization endpoint...', 
      source: 'TestApiCallButton' 
    });

    try {
      addLog({ 
        message: '\\nCalling Xero API to fetch organization details...', 
        source: 'TestApiCallButton',
        idToUpdate: logId,
        mode: 'append'
      });

      const response = await fetch('/api/organisation');
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(`API Error: ${response.status} - ${errorData.message || errorData.error || 'Unknown error'}`);
      }

      const data = await response.json();
      
      addLog({ 
        message: `\\n✅ Test API Call: SUCCESS\\n\\nOrganization Details Received:\\n• Name: ${data.organisations?.[0]?.name || 'N/A'}\\n• Legal Name: ${data.organisations?.[0]?.legalName || 'N/A'}\\n• Country: ${data.organisations?.[0]?.countryCode || 'N/A'}\\n• Currency: ${data.organisations?.[0]?.defaultCurrency || 'N/A'}\\n• Financial Year End: ${data.organisations?.[0]?.financialYearEndMonth || 'N/A'}/${data.organisations?.[0]?.financialYearEndDay || 'N/A'}`, 
        source: 'TestApiCallButton',
        idToUpdate: logId,
        mode: 'replace'
      });

      // Refresh the usage data to show updated progress bar
      await refreshUsage();

      addLog({ 
        message: '\\n🔄 API usage progress bar has been updated with latest data from Xero!', 
        source: 'TestApiCallButton',
        idToUpdate: logId,
        mode: 'append'
      });

    } catch (error) {
      addLog({ 
        message: `\\n❌ Test API Call: FAILED\\n\\nError Details:\\n${error instanceof Error ? error.message : 'Unknown error'}\\n\\n💡 Please check your Xero connection and try again.`, 
        source: 'TestApiCallButton',
        idToUpdate: logId,
        mode: 'replace'
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Test API Usage Tracking</h3>
          <p className="text-xs text-gray-600 mt-1">
            Make a simple call to see the progress bar update
          </p>
        </div>
      </div>
      
      <button
        type="button"
        onClick={handleTestApiCall}
        disabled={disabled || isTesting}
        className="inline-flex items-center justify-center w-full rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <CloudIcon className="h-4 w-4 mr-2" />
        {isTesting ? 'Making API Call...' : 'Test Xero API Call'}
      </button>
      
      <p className="text-xs text-gray-500 mt-2 text-center">
        This will fetch your organization details and update the usage tracker
      </p>
    </div>
  );
} 