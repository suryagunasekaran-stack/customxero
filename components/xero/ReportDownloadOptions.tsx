import React from 'react';
import { 
  DocumentArrowDownIcon, 
  TableCellsIcon, 
  DocumentTextIcon,
  ChartBarIcon,
  UserCircleIcon,
  BuildingOfficeIcon,
  ClockIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';
import { ReportMetadata, ProjectComparisonData } from '@/lib/reportGenerator';

interface ReportDownloadOptionsProps {
  comparisonData: ProjectComparisonData;
  reportMetadata: ReportMetadata;
  onDownload: (format: 'xlsx' | 'csv' | 'txt') => Promise<void>;
  className?: string;
}

export default function ReportDownloadOptions({ 
  comparisonData, 
  reportMetadata, 
  onDownload, 
  className = '' 
}: ReportDownloadOptionsProps) {
  const [downloading, setDownloading] = React.useState<string | null>(null);

  const handleDownload = async (format: 'xlsx' | 'csv' | 'txt') => {
    setDownloading(format);
    try {
      await onDownload(format);
    } catch (error) {
      console.error('Download failed:', error);
    } finally {
      setDownloading(null);
    }
  };

  const getSyncStatusColor = (data: ProjectComparisonData) => {
    const total = data.matchedCount + data.onlyInPipedriveCount + data.onlyInXeroCount;
    if (total === 0) return 'text-gray-500';
    
    const syncPercentage = (data.matchedCount / total) * 100;
    
    if (syncPercentage === 100) return 'text-green-600';
    if (syncPercentage >= 90) return 'text-emerald-600';
    if (syncPercentage >= 75) return 'text-blue-600';
    if (syncPercentage >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getSyncStatusText = (data: ProjectComparisonData) => {
    const total = data.matchedCount + data.onlyInPipedriveCount + data.onlyInXeroCount;
    if (total === 0) return 'No Data';
    
    const syncPercentage = (data.matchedCount / total) * 100;
    
    if (syncPercentage === 100) return 'Perfect Sync';
    if (syncPercentage >= 90) return 'Excellent';
    if (syncPercentage >= 75) return 'Good';
    if (syncPercentage >= 50) return 'Moderate';
    return 'Needs Attention';
  };

  const downloadOptions = [
    {
      format: 'xlsx' as const,
      title: 'Excel Report',
      description: 'Professional multi-sheet analysis with charts and formatting',
      icon: TableCellsIcon,
      color: 'bg-green-50 border-green-200 hover:bg-green-100',
      iconColor: 'text-green-600',
      recommended: true
    },
    {
      format: 'csv' as const,
      title: 'CSV Data',
      description: 'Raw data export for further analysis and integration',
      icon: DocumentArrowDownIcon,
      color: 'bg-blue-50 border-blue-200 hover:bg-blue-100',
      iconColor: 'text-blue-600',
      recommended: false
    },
    {
      format: 'txt' as const,
      title: 'Text Report',
      description: 'Formatted text report for easy sharing and archiving',
      icon: DocumentTextIcon,
      color: 'bg-gray-50 border-gray-200 hover:bg-gray-100',
      iconColor: 'text-gray-600',
      recommended: false
    }
  ];

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      {/* Report Summary Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <ChartBarIcon className="h-5 w-5 mr-2 text-blue-600" />
              Project Comparison Report
            </h3>
            <p className="text-sm text-gray-600 mt-1">Professional analysis ready for download</p>
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-medium bg-gray-100 ${getSyncStatusColor(comparisonData)}`}>
            {getSyncStatusText(comparisonData)}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{comparisonData.matchedCount}</div>
            <div className="text-xs text-gray-500">Matched</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{comparisonData.onlyInPipedriveCount}</div>
            <div className="text-xs text-gray-500">Pipedrive Only</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{comparisonData.onlyInXeroCount}</div>
            <div className="text-xs text-gray-500">Xero Only</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-700">
              {comparisonData.matchedCount + comparisonData.onlyInPipedriveCount + comparisonData.onlyInXeroCount}
            </div>
            <div className="text-xs text-gray-500">Total</div>
          </div>
        </div>

        {/* Metadata */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
          <div className="flex items-center">
            <UserCircleIcon className="h-4 w-4 mr-2" />
            <span>{reportMetadata.generatedBy}</span>
          </div>
          <div className="flex items-center">
            <BuildingOfficeIcon className="h-4 w-4 mr-2" />
            <span>{reportMetadata.tenantName}</span>
          </div>
          <div className="flex items-center">
            <ClockIcon className="h-4 w-4 mr-2" />
            <span>{reportMetadata.generatedAt.toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      {/* Download Options */}
      <div className="p-6">
        <h4 className="text-sm font-medium text-gray-900 mb-4">Choose Download Format</h4>
        <div className="grid gap-3">
          {downloadOptions.map((option) => {
            const Icon = option.icon;
            const isDownloading = downloading === option.format;
            
            return (
              <button
                key={option.format}
                onClick={() => handleDownload(option.format)}
                disabled={isDownloading}
                className="relative p-4 rounded-lg border-2 transition-all duration-200 text-left text-white disabled:opacity-75 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: isDownloading 
                    ? 'oklch(21.6% 0.006 56.043)' 
                    : 'oklch(27.4% 0.006 286.033)',
                  borderColor: isDownloading 
                    ? 'oklch(21.6% 0.006 56.043)' 
                    : 'oklch(27.4% 0.006 286.033)'
                }}
                onMouseEnter={(e) => {
                  if (!isDownloading) {
                    e.currentTarget.style.backgroundColor = 'oklch(21.6% 0.006 56.043)';
                    e.currentTarget.style.borderColor = 'oklch(21.6% 0.006 56.043)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isDownloading) {
                    e.currentTarget.style.backgroundColor = 'oklch(27.4% 0.006 286.033)';
                    e.currentTarget.style.borderColor = 'oklch(27.4% 0.006 286.033)';
                  }
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start">
                    <Icon className="h-6 w-6 mr-3 mt-0.5 text-white" />
                    <div>
                      <div className="flex items-center">
                        <h5 className="font-medium text-white">{option.title}</h5>
                        {option.recommended && (
                          <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                            Recommended
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-white opacity-80 mt-1">{option.description}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center">
                    {isDownloading ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    ) : (
                      <DocumentArrowDownIcon className="h-5 w-5 text-white opacity-60" />
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Action Required Alert */}
        {(comparisonData.onlyInPipedriveCount > 0 || comparisonData.onlyInXeroCount > 0) && (
          <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-amber-800">Action Required</h3>
                <p className="text-sm text-amber-700 mt-1">
                  Some projects are not synchronized between systems. Review the detailed report to identify next steps.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Perfect Sync Celebration */}
        {comparisonData.matchedCount > 0 && comparisonData.onlyInPipedriveCount === 0 && comparisonData.onlyInXeroCount === 0 && (
          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-start">
              <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-green-800">Perfect Synchronization!</h3>
                <p className="text-sm text-green-700 mt-1">
                  Congratulations! All projects are perfectly synchronized between Pipedrive and Xero.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 