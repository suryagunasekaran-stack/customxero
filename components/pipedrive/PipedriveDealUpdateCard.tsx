'use client';

import React, { useState, useEffect } from 'react';
import { ArrowUpTrayIcon, DocumentArrowDownIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';

interface Product {
  id: number;
  name: string;
  code: string;
  description: string;
  prices: any[];
  isActive: boolean;
}

interface DealData {
  'Deal - Value': string;
  'Deal - ID': string;
  'Deal - IPC': string;
}

interface UpdateResult {
  successful: Array<{
    dealId: string;
    dealIPC: string;
    value: number;
    message: string;
  }>;
  failed: Array<{
    dealId: string;
    dealIPC: string;
    value: number | string;
    error: string;
    details: any;
  }>;
  totalProcessed: number;
  totalSuccess: number;
  totalFailed: number;
}

interface BatchInfo {
  batchSize: number;
  totalBatches: number;
  estimatedTimeSeconds: number;
  tokensUsed: number;
}

/**
 * PipedriveDealUpdateCard component
 * Allows users to select products and update deals with JSON file upload
 */
export default function PipedriveDealUpdateCard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  const [dealData, setDealData] = useState<DealData[]>([]);
  const [dealIds, setDealIds] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UpdateResult | null>(null);
  const [batchInfo, setBatchInfo] = useState<BatchInfo | null>(null);
  const [showReport, setShowReport] = useState(false);

  // Fetch products on mount
  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/pipedrive/products');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch products');
      }
      
      if (data.success && data.data) {
        setProducts(data.data.filter((p: Product) => p.isActive));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (Array.isArray(json)) {
          setDealData(json);
          setError(null);
        } else {
          throw new Error('Invalid JSON format. Expected an array.');
        }
      } catch (err) {
        setError('Failed to parse JSON file. Please check the format.');
        setDealData([]);
      }
    };
    reader.readAsText(file);
  };

  const handleUpdate = async () => {
    if (!selectedProduct || dealData.length === 0) {
      setError('Please select a product and upload deal data');
      return;
    }

    try {
      setUploading(true);
      setError(null);
      setResult(null);

      // Parse deal IDs if provided
      const dealIdArray = dealIds
        .split(',')
        .map(id => id.trim())
        .filter(id => id.length > 0);

      const response = await fetch('/api/pipedrive/deals/update-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: selectedProduct,
          deals: dealData,
          dealIds: dealIdArray.length > 0 ? dealIdArray : undefined
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to update deals');
      }

      setResult(data.results);
      setBatchInfo(data.batchInfo || null);
      setShowReport(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update deals');
    } finally {
      setUploading(false);
    }
  };

  const downloadReport = () => {
    if (!result) return;

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalProcessed: result.totalProcessed,
        totalSuccess: result.totalSuccess,
        totalFailed: result.totalFailed
      },
      rateLimiting: batchInfo ? {
        batchesProcessed: batchInfo.totalBatches,
        batchSize: batchInfo.batchSize,
        tokensConsumed: batchInfo.tokensUsed,
        processingTimeSeconds: batchInfo.estimatedTimeSeconds
      } : null,
      successful: result.successful,
      failed: result.failed
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pipedrive-update-report-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-5">
        <h3 className="text-lg font-medium text-gray-900">Update Deals with Products</h3>
        <p className="mt-1 text-sm text-gray-500">
          Select a product and upload deal data to bulk update Pipedrive deals
        </p>
        <div className="mt-3 bg-blue-50 rounded-lg p-3">
          <p className="text-xs text-blue-800">
            <strong>Rate Limit Info:</strong> Updates are processed in batches of 80 deals every 2 seconds to respect Pipedrive API limits. 
            For 519 deals, this will take approximately 13-15 seconds.
          </p>
        </div>
      </div>

      <div className="border-t border-gray-100 px-6 py-4 space-y-4">
        {/* Product Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Product
          </label>
          {loading ? (
            <div className="animate-pulse h-10 bg-gray-200 rounded"></div>
          ) : (
            <select
              value={selectedProduct || ''}
              onChange={(e) => setSelectedProduct(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={products.length === 0}
            >
              <option value="">Choose a product...</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} {product.code ? `(${product.code})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* File Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Upload Deal Data (JSON)
          </label>
          <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:border-gray-400 transition-colors">
            <div className="space-y-1 text-center">
              <ArrowUpTrayIcon className="mx-auto h-12 w-12 text-gray-400" />
              <div className="flex text-sm text-gray-600">
                <label className="relative cursor-pointer rounded-md font-medium text-indigo-600 hover:text-indigo-500">
                  <span>Upload a file</span>
                  <input
                    type="file"
                    className="sr-only"
                    accept=".json"
                    onChange={handleFileUpload}
                  />
                </label>
                <p className="pl-1">or drag and drop</p>
              </div>
              <p className="text-xs text-gray-500">JSON file with deal data</p>
            </div>
          </div>
          {dealData.length > 0 && (
            <p className="mt-2 text-sm text-green-600">
              ✓ Loaded {dealData.length} deals from file
            </p>
          )}
        </div>

        {/* Deal IDs Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Deal IDs (Optional)
          </label>
          <input
            type="text"
            value={dealIds}
            onChange={(e) => setDealIds(e.target.value)}
            placeholder="Enter deal IDs separated by commas (e.g., 593, 594, 595)"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            Leave empty to update all deals in the uploaded file
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Update Button */}
        <div className="pt-2">
          <button
            onClick={handleUpdate}
            disabled={!selectedProduct || dealData.length === 0 || uploading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {uploading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Updating Deals...
              </>
            ) : (
              'Update Deals'
            )}
          </button>
          
          {uploading && (
            <div className="mt-2 text-sm text-gray-600 text-center">
              <p>Processing in batches to respect Pipedrive rate limits...</p>
              <p className="text-xs text-gray-500 mt-1">
                Large updates are processed in batches of 80 deals with 2-second delays
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Results Report */}
      {showReport && result && (
        <div className="border-t border-gray-100 px-6 py-4">
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-900 mb-2">Update Summary</h4>
            <div className="grid grid-cols-3 gap-4 text-center mb-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-2xl font-semibold text-gray-900">{result.totalProcessed}</p>
                <p className="text-xs text-gray-500">Total Processed</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3">
                <p className="text-2xl font-semibold text-green-600">{result.totalSuccess}</p>
                <p className="text-xs text-gray-500">Successful</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3">
                <p className="text-2xl font-semibold text-red-600">{result.totalFailed}</p>
                <p className="text-xs text-gray-500">Failed</p>
              </div>
            </div>
            
            {batchInfo && (
              <div className="bg-blue-50 rounded-lg p-3 text-sm">
                <h5 className="font-medium text-blue-900 mb-1">Rate Limiting Summary</h5>
                <div className="grid grid-cols-2 gap-2 text-blue-800">
                  <div>Batches processed: {batchInfo.totalBatches}</div>
                  <div>Batch size: {batchInfo.batchSize} deals</div>
                  <div>Tokens consumed: {batchInfo.tokensUsed}</div>
                  <div>Processing time: ~{batchInfo.estimatedTimeSeconds}s</div>
                </div>
              </div>
            )}
          </div>

          {/* Detailed Results */}
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {result.successful.map((item, index) => (
              <div key={index} className="flex items-center text-sm">
                <CheckCircleIcon className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                <span>Deal {item.dealId} ({item.dealIPC}) - ${item.value}</span>
              </div>
            ))}
            {result.failed.map((item, index) => (
              <div key={index} className="flex items-start text-sm">
                <XCircleIcon className="h-4 w-4 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
                <div>
                  <span>Deal {item.dealId} ({item.dealIPC}) - {item.error}</span>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={downloadReport}
            className="mt-4 w-full flex items-center justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <DocumentArrowDownIcon className="h-4 w-4 mr-2" />
            Download Full Report
          </button>
        </div>
      )}
    </div>
  );
} 