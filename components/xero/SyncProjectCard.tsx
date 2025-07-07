'use client';

import React from 'react';
import { ArrowsRightLeftIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { useSyncProject } from '../../hooks/useSyncProject';
import { FunctionCardProps } from './types';
import ReportDownloadOptions from './ReportDownloadOptions';

interface SyncProjectCardProps extends FunctionCardProps {}

export default function SyncProjectCard({ disabled = false }: SyncProjectCardProps) {
  const {
    isSyncing,
    isAnalyzing,
    showDownloadOptions,
    comparisonData,
    reportMetadata,
    handleAnalyzeProjects,
    handleSyncProject,
    handleDownloadReport,
  } = useSyncProject();

  const isDisabled = disabled || isSyncing || isAnalyzing;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-200 flex flex-col">
      <div className="p-4 flex-1">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Project Synchronization</h2>
            <p className="text-xs text-gray-500 mt-1">Cross-platform data harmonization and reconciliation engine</p>
          </div>
          {showDownloadOptions && !isAnalyzing && !isSyncing && (
            <CheckCircleIcon className="h-6 w-6 text-green-500" />
          )}
        </div>

        {/* Analysis Results Summary */}
        {comparisonData && showDownloadOptions && (
          <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="text-xs font-semibold text-blue-800 mb-2">
              {comparisonData.pipedriveDisabled ? 'Xero Analysis Complete!' : 'Analysis Complete!'}
            </h3>
            
            {comparisonData.pipedriveDisabled && (
              <div className="mb-2 p-1 bg-orange-100 border border-orange-300 rounded text-xs text-orange-800">
                <strong>Note:</strong> {comparisonData.pipedriveError || 'Pipedrive integration is disabled for this organization'}
              </div>
            )}
            
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="text-center">
                <div className="text-lg font-bold text-green-600">{comparisonData.matchedCount}</div>
                <div className="text-xs text-gray-600">
                  {comparisonData.pipedriveDisabled ? 'N/A' : 'Matched'}
                </div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-blue-600">{comparisonData.onlyInPipedriveCount}</div>
                <div className="text-xs text-gray-600">
                  {comparisonData.pipedriveDisabled ? 'N/A' : 'Pipedrive Only'}
                </div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-orange-600">{comparisonData.onlyInXeroCount}</div>
                <div className="text-xs text-gray-600">Xero Projects</div>
              </div>
            </div>
          </div>
        )}

        {/* Technical Specifications */}
        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <h4 className="text-xs font-semibold text-gray-700 mb-2">System Architecture</h4>
          <div className="text-xs text-gray-600 space-y-1">
            <div>• RESTful API integration with OAuth 2.0 authentication</div>
            <div>• Real-time data synchronization with conflict resolution</div>
            <div>• Multi-threaded processing pipeline with exponential backoff</div>
            <div>• Immutable audit trail with cryptographic hashing</div>
          </div>
        </div>
      </div>

      {/* Professional Report Download Options */}
      {showDownloadOptions && !isAnalyzing && !isSyncing && comparisonData && reportMetadata && (
        <div className="border-t border-gray-100">
          <ReportDownloadOptions
            comparisonData={comparisonData}
            reportMetadata={reportMetadata}
            onDownload={handleDownloadReport}
            className="rounded-none shadow-none border-0"
          />
        </div>
      )}

      {/* Action Button - Fixed at bottom */}
      <div className="p-4 mt-auto">
        <button
          onClick={handleAnalyzeProjects}
          disabled={isDisabled}
          className="w-full inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
          style={{
            backgroundColor: isDisabled 
              ? 'oklch(21.6% 0.006 56.043)' 
              : 'oklch(27.4% 0.006 286.033)'
          }}
          onMouseEnter={(e) => {
            if (!isDisabled) {
              e.currentTarget.style.backgroundColor = 'oklch(21.6% 0.006 56.043)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isDisabled) {
              e.currentTarget.style.backgroundColor = 'oklch(27.4% 0.006 286.033)';
            }
          }}
        >
          {isAnalyzing ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
              {comparisonData?.pipedriveDisabled ? 'Analyzing Xero Projects...' : 'Analyzing Projects...'}
            </>
          ) : showDownloadOptions ? (
            <>
              <CheckCircleIcon className="h-4 w-4 mr-2" />
              {comparisonData?.pipedriveDisabled ? 'Re-analyze Xero Projects' : 'Re-analyze Projects'}
            </>
          ) : (
            <>
              <ArrowsRightLeftIcon className="h-4 w-4 mr-2" />
              {comparisonData?.pipedriveDisabled ? 'Analyze Xero Projects' : 'Analyze Projects'}
            </>
          )}
        </button>
      </div>
    </div>
  );
} 