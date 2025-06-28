'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  FolderOpenIcon, 
  ArrowDownTrayIcon, 
  TrashIcon,
  DocumentIcon 
} from '@heroicons/react/24/outline';

interface BlobFile {
  url: string;
  pathname: string;
  size: number;
  uploadedAt: Date;
  downloadUrl?: string;
}

interface BlobBrowserCardProps {
  disabled?: boolean;
  refreshTrigger?: any; // Trigger refresh when files are uploaded
  onFileSelect?: (blobUrl: string, fileName: string) => void; // Optional callback for file selection
}

export default function BlobBrowserCard({ disabled = false, refreshTrigger, onFileSelect }: BlobBrowserCardProps) {
  const [files, setFiles] = useState<BlobFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<BlobFile | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/blob/list');
      if (response.ok) {
        const data = await response.json();
        setFiles(data.blobs || []);
      } else {
        console.error('Failed to fetch files');
      }
    } catch (error) {
      console.error('Error fetching files:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles, refreshTrigger]);

  const handleDownload = useCallback(async (file: BlobFile) => {
    try {
      // Create a temporary anchor element to trigger download
      const link = document.createElement('a');
      link.href = file.url;
      link.download = file.pathname;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Download error:', error);
      alert('Download failed. Please try again.');
    }
  }, []);

  const handleDelete = useCallback(async (file: BlobFile) => {
    if (!confirm(`Are you sure you want to delete "${file.pathname}"?`)) {
      return;
    }

    setDeleting(file.url);
    try {
      const response = await fetch(`/api/blob/delete?url=${encodeURIComponent(file.url)}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setFiles(prev => prev.filter(f => f.url !== file.url));
        if (selectedFile?.url === file.url) {
          setSelectedFile(null);
        }
      } else {
        throw new Error('Delete failed');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Delete failed. Please try again.');
    } finally {
      setDeleting(null);
    }
  }, [selectedFile]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString() + ' ' + new Date(date).toLocaleTimeString();
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            <FolderOpenIcon className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-gray-900">File Browser</h3>
            <p className="text-sm text-gray-500">Browse and download uploaded files</p>
          </div>
        </div>
        <button
          onClick={fetchFiles}
          disabled={loading || disabled}
          className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Files List */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-sm text-gray-500 mt-2">Loading files...</p>
          </div>
        ) : files.length === 0 ? (
          <div className="text-center py-8">
            <DocumentIcon className="mx-auto h-12 w-12 text-gray-400" />
            <p className="text-sm text-gray-500 mt-2">No files uploaded yet</p>
          </div>
        ) : (
          files.map((file) => (
            <div
              key={file.url}
              className={`
                p-3 rounded-lg border transition-colors cursor-pointer
                ${selectedFile?.url === file.url
                  ? 'border-blue-300 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }
              `}
              onClick={() => setSelectedFile(file)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  <DocumentIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {file.pathname}
                    </p>
                    <div className="flex items-center space-x-4 text-xs text-gray-500">
                      <span>{formatFileSize(file.size)}</span>
                      <span>{formatDate(file.uploadedAt)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(file);
                    }}
                    disabled={disabled}
                    className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                    title="Download"
                  >
                    <ArrowDownTrayIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(file);
                    }}
                    disabled={disabled || deleting === file.url}
                    className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                    title="Delete"
                  >
                    {deleting === file.url ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                    ) : (
                      <TrashIcon className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Selected File Details */}
      {selectedFile && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <h4 className="text-sm font-medium text-gray-900 mb-2">Selected File</h4>
          <div className="space-y-1 text-xs text-gray-600">
            <p><span className="font-medium">Name:</span> {selectedFile.pathname}</p>
            <p><span className="font-medium">Size:</span> {formatFileSize(selectedFile.size)}</p>
            <p><span className="font-medium">Uploaded:</span> {formatDate(selectedFile.uploadedAt)}</p>
            <p><span className="font-medium">URL:</span> 
              <span className="break-all ml-1">{selectedFile.url}</span>
            </p>
          </div>
          <div className="mt-3 flex space-x-2">
            {onFileSelect && (
              <button
                onClick={() => onFileSelect(selectedFile.url, selectedFile.pathname)}
                disabled={disabled}
                className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
              >
                Select for Processing
              </button>
            )}
            <button
              onClick={() => handleDownload(selectedFile)}
              disabled={disabled}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <ArrowDownTrayIcon className="h-3 w-3 mr-1" />
              Download
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(selectedFile.url);
                alert('URL copied to clipboard!');
              }}
              className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Copy URL
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 