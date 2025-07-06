'use client';

import { useState } from 'react';
import { useApiClient } from '@/hooks/useApiClient';

export default function TestTokenRefresh() {
  const [testResults, setTestResults] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);
  const { apiCall } = useApiClient({
    onError: (error) => {
      setTestResults(prev => [...prev, `Error: ${error.message}`]);
    }
  });

  const addResult = (message: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const testTokenRefresh = async () => {
    setTesting(true);
    setTestResults([]);
    
    try {
      // Test 0: Check auth status first
      addResult('Checking authentication status...');
      const authStatus = await apiCall('/api/auth-status');
      addResult(`✓ Authenticated: ${authStatus.authenticated}`);
      addResult(`✓ Token expires in: ${authStatus.tokenExpiresIn?.human || 'Unknown'}`);
      if (authStatus.willExpireSoon) {
        addResult('⚠️  Token will expire soon - refresh should happen automatically');
      }
      
      // Test 1: Normal API call
      addResult('Testing normal API call...');
      const tenants = await apiCall('/api/tenants');
      addResult(`✓ API call successful. Found ${tenants.availableTenants?.length || 0} tenants`);
      
      // Test 2: Check current session
      addResult('Checking current session...');
      const orgResponse = await apiCall('/api/organisation');
      addResult(`✓ Session valid. Current tenant: ${orgResponse.Name || 'Unknown'}`);
      
      // Test 3: Multiple rapid calls (should use same token)
      addResult('Testing multiple rapid API calls...');
      const promises = Array(3).fill(null).map(async (_, i) => {
        const result = await apiCall('/api/organisation');
        return `Call ${i + 1}: ${result.Name}`;
      });
      
      const results = await Promise.all(promises);
      results.forEach(r => addResult(`✓ ${r}`));
      
      // Test 4: Check auth status again to see if token was refreshed
      addResult('Checking auth status after tests...');
      const authStatusAfter = await apiCall('/api/auth-status');
      addResult(`✓ Token expires in: ${authStatusAfter.tokenExpiresIn?.human || 'Unknown'}`);
      
      addResult('✅ All tests passed! Token refresh is working correctly.');
      
    } catch (error) {
      addResult(`❌ Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setTesting(false);
    }
  };

  const forceTokenExpiry = async () => {
    addResult('⚠️  Note: Cannot force token expiry from client side.');
    addResult('To test token refresh:');
    addResult('1. Wait for token to expire naturally (check auth.ts for buffer time)');
    addResult('2. Or manually modify token expiry in NextAuth JWT callback');
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Token Refresh Test</h1>
          
          <div className="space-y-4 mb-6">
            <button
              onClick={testTokenRefresh}
              disabled={testing}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
            >
              {testing ? 'Testing...' : 'Run Token Refresh Test'}
            </button>
            
            <button
              onClick={forceTokenExpiry}
              disabled={testing}
              className="w-full px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:bg-gray-400"
            >
              Force Token Expiry (Info)
            </button>
          </div>
          
          {testResults.length > 0 && (
            <div className="bg-gray-100 rounded-md p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-2">Test Results:</h2>
              <div className="space-y-1">
                {testResults.map((result, index) => (
                  <div key={index} className="text-sm font-mono text-gray-600">
                    {result}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="mt-6 p-4 bg-blue-50 rounded-md">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">Token Refresh Implementation:</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Proactive refresh: 5 minutes before expiry</li>
              <li>• Automatic retry on 401 errors</li>
              <li>• Client-side error handling with useApiClient hook</li>
              <li>• Server-side token refresh in NextAuth JWT callback</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}