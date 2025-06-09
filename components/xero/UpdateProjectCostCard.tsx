'use client';

import React, { useState } from 'react';
import { ArrowUpTrayIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/20/solid';
import { useLog } from '../../contexts/LogContext';
import { FunctionCardProps } from './types';

interface UpdateProjectCostCardProps extends FunctionCardProps {}

// Updated interfaces to match new Flask route response
interface TimeEntry {
  job_code: string;
  dept_name: string;
  date: string;
  entry_type: 'manhours' | 'overtime';
  hours: number;
  cost: number;
  cost_per_hour: number;
  ot15_hours?: number;
  ot20_hours?: number;
  idempotency_key: string;
  description: string;
}

interface JobSummary {
  job_code: string;
  total_entries: number;
  total_hours: number;
  total_cost: number;
  manhours_total: number;
  overtime_total: number;
  dates: string[];
  date_range: string;
}

interface ProcessingResults {
  success: boolean;
  message?: string;
  metadata: {
    creation_date: string;
    period_range: string;
    entries_processed: number;
    entries_grouped: number;
  };
  time_entries: TimeEntry[];
  job_summaries: JobSummary[];
  statistics: {
    total_entries: number;
    unique_job_codes: number;
    total_hours: number;
    total_cost: number;
    manhours_entries: number;
    overtime_entries: number;
    navy_entries: number;
    non_navy_entries: number;
    errors: string[];
  };
  error?: string;
}

export default function UpdateProjectCostCard({ disabled = false }: UpdateProjectCostCardProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [fileUploaded, setFileUploaded] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [results, setResults] = useState<ProcessingResults | null>(null);
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const { addLog } = useLog();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    
    if (!file) {
      addLog({ message: 'No file selected for timesheet processing.', source: 'UpdateProjectCostCard' });
      return;
    }

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.xlsx') && !file.name.toLowerCase().endsWith('.xls')) {
      addLog({ message: 'Invalid file format. Please upload an Excel file (.xlsx or .xls).', source: 'UpdateProjectCostCard' });
      return;
    }

    const logId = addLog({ 
      message: `📁 Processing timesheet: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`, 
      source: 'UpdateProjectCostCard' 
    });

    setIsUploading(true);
    setResults(null);
    setFileUploaded(false);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('http://127.0.0.1:5001/api/process-timesheet', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Server responded with ${response.status}`);
      }

      const data: ProcessingResults = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Processing failed');
      }

      addLog({ 
        message: `✅ Successfully processed ${data.statistics.total_entries} timesheet entries (${data.statistics.manhours_entries} manhours, ${data.statistics.overtime_entries} overtime) from ${data.statistics.unique_job_codes} job codes!`, 
        source: 'UpdateProjectCostCard',
        idToUpdate: logId,
        mode: 'replace'
      });

      setFileUploaded(true);
      setUploadedFileName(file.name);
      setResults(data);

    } catch (error: any) {
      addLog({ 
        message: `❌ Error processing ${file.name}: ${error.message}`, 
        source: 'UpdateProjectCostCard',
        idToUpdate: logId,
        mode: 'replace'
      });
      console.error("Timesheet processing error:", error);
      setFileUploaded(false);
      setResults({ success: false, error: error.message } as ProcessingResults);
    } finally {
      setIsUploading(false);
      // Reset file input to allow re-uploading the same file
      event.target.value = '';
    }
  };

  const toggleJobExpansion = (jobCode: string) => {
    const newExpanded = new Set(expandedJobs);
    if (newExpanded.has(jobCode)) {
      newExpanded.delete(jobCode);
      // Also collapse all tasks for this job
      const tasksToRemove = Array.from(expandedTasks).filter(task => task.startsWith(jobCode));
      tasksToRemove.forEach(task => expandedTasks.delete(task));
      setExpandedTasks(new Set(expandedTasks));
    } else {
      newExpanded.add(jobCode);
    }
    setExpandedJobs(newExpanded);
  };

  const toggleTaskExpansion = (jobCode: string, entryType: string) => {
    const taskKey = `${jobCode}-${entryType}`;
    const newExpanded = new Set(expandedTasks);
    if (newExpanded.has(taskKey)) {
      newExpanded.delete(taskKey);
    } else {
      newExpanded.add(taskKey);
    }
    setExpandedTasks(newExpanded);
  };

  // Group entries by job code and then by entry type
  const getJobCodeBreakdown = () => {
    if (!results?.time_entries) return {};
    
    const breakdown: Record<string, Record<string, TimeEntry[]>> = {};
    
    results.time_entries.forEach(entry => {
      const jobCode = entry.job_code;
      const entryType = entry.entry_type;
      
      if (!breakdown[jobCode]) breakdown[jobCode] = {};
      if (!breakdown[jobCode][entryType]) breakdown[jobCode][entryType] = [];
      
      breakdown[jobCode][entryType].push(entry);
    });
    
    return breakdown;
  };

  const triggerFileInput = () => {
    document.getElementById('timesheetFileInput')?.click();
  };

  const isDisabled = disabled || isUploading;
  const jobBreakdown = getJobCodeBreakdown();

  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-lg hover:shadow-xl transition-shadow duration-300 ease-in-out">
      <div className="p-6">
        <h2 className="text-lg font-semibold text-indigo-600">Process Timesheet Data</h2>
        <p className="mt-2 text-sm text-gray-600 min-h-[60px]">
          Upload an Excel timesheet to process and validate time entry data. The system will parse job codes, separate manhours and overtime entries, calculate costs based on department, and generate idempotency keys for time entry creation.
        </p>

        {/* Detailed Results Display */}
        {results && (
          <div className="mt-4 space-y-4">
            {/* Main Results Card */}
            <div className="p-4 bg-gray-50 rounded-lg border">
              <h3 className="text-sm font-medium text-gray-900 mb-3">
                {results.success ? '✅ Processing Complete' : '❌ Processing Failed'}
              </h3>
              
              {results.success ? (
                <div className="space-y-3">
                  {/* File Info */}
                  <div className="text-xs text-gray-600 space-y-1">
                    <div className="flex justify-between">
                      <span>📄 File:</span>
                      <span className="font-medium">{uploadedFileName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>📅 Period:</span>
                      <span className="font-medium">{results.metadata.period_range}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>📊 Total Entries:</span>
                      <span className="font-medium">{results.statistics.total_entries}</span>
                    </div>
                  </div>
                  
                  {/* Statistics Grid */}
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div className="bg-blue-50 p-2 rounded border">
                      <div className="text-xs text-blue-600 font-medium">Manhours Entries</div>
                      <div className="text-sm text-blue-900">{results.statistics.manhours_entries}</div>
                      <div className="text-xs text-blue-600">Regular hours</div>
                    </div>
                    <div className="bg-orange-50 p-2 rounded border">
                      <div className="text-xs text-orange-600 font-medium">Overtime Entries</div>
                      <div className="text-sm text-orange-900">{results.statistics.overtime_entries}</div>
                      <div className="text-xs text-orange-600">OT1.5 + OT2.0</div>
                    </div>
                    <div className="bg-purple-50 p-2 rounded border">
                      <div className="text-xs text-purple-600 font-medium">Total Hours</div>
                      <div className="text-sm text-purple-900">{results.statistics.total_hours}h</div>
                      <div className="text-xs text-purple-600">Navy: {results.statistics.navy_entries} | Non-Navy: {results.statistics.non_navy_entries}</div>
                    </div>
                    <div className="bg-yellow-50 p-2 rounded border">
                      <div className="text-xs text-yellow-600 font-medium">Total Cost</div>
                      <div className="text-sm text-yellow-900">${results.statistics.total_cost.toFixed(2)}</div>
                      <div className="text-xs text-yellow-600">Navy only</div>
                    </div>
                  </div>
                  
                  {/* Expandable Job Codes Summary */}
                  {results.job_summaries.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-xs font-medium text-gray-700 mb-2">
                        Job Code Breakdown ({results.statistics.unique_job_codes} codes)
                      </h4>
                      <div className="max-h-96 overflow-y-auto space-y-1">
                        {results.job_summaries.map((job, index) => (
                          <div key={index} className="bg-white rounded border">
                            {/* Job Code Header */}
                            <button
                              onClick={() => toggleJobExpansion(job.job_code)}
                              className="w-full text-xs p-3 flex justify-between items-center hover:bg-gray-50 transition-colors"
                            >
                              <div className="flex items-center">
                                {expandedJobs.has(job.job_code) ? (
                                  <ChevronDownIcon className="w-4 h-4 mr-2 text-gray-400" />
                                ) : (
                                  <ChevronRightIcon className="w-4 h-4 mr-2 text-gray-400" />
                                )}
                                <span className="font-medium text-gray-900">{job.job_code}</span>
                                <span className="text-gray-500 ml-2">({job.total_entries} entries)</span>
                              </div>
                              <div className="text-right">
                                <div className="text-gray-900">{job.total_hours}h</div>
                                <div className="text-gray-600">${job.total_cost.toFixed(2)}</div>
                                <div className="text-xs text-gray-500">
                                  MH: ${job.manhours_total.toFixed(2)} | OT: ${job.overtime_total.toFixed(2)}
                                </div>
                              </div>
                            </button>

                            {/* Expanded Task Breakdown */}
                            {expandedJobs.has(job.job_code) && jobBreakdown[job.job_code] && (
                              <div className="border-t bg-gray-50">
                                {Object.entries(jobBreakdown[job.job_code]).map(([entryType, entries]) => {
                                  const taskHours = entries.reduce((sum, entry) => sum + entry.hours, 0);
                                  const taskCost = entries.reduce((sum, entry) => sum + entry.cost, 0);
                                  const taskKey = `${job.job_code}-${entryType}`;
                                  
                                  return (
                                    <div key={entryType} className="border-b last:border-b-0">
                                      {/* Task Header */}
                                      <button
                                        onClick={() => toggleTaskExpansion(job.job_code, entryType)}
                                        className="w-full text-xs p-2 pl-8 flex justify-between items-center hover:bg-gray-100 transition-colors"
                                      >
                                        <div className="flex items-center">
                                          {expandedTasks.has(taskKey) ? (
                                            <ChevronDownIcon className="w-3 h-3 mr-2 text-gray-400" />
                                          ) : (
                                            <ChevronRightIcon className="w-3 h-3 mr-2 text-gray-400" />
                                          )}
                                          <span className="text-gray-700 capitalize">{entryType}</span>
                                          <span className="text-gray-500 ml-2">({entries.length} entries)</span>
                                        </div>
                                        <div className="text-right">
                                          <div className="text-gray-700">{taskHours.toFixed(1)}h</div>
                                          <div className="text-gray-500">${taskCost.toFixed(2)}</div>
                                        </div>
                                      </button>

                                      {/* Individual Entries */}
                                      {expandedTasks.has(taskKey) && (
                                        <div className="bg-white">
                                          {entries.map((entry, entryIndex) => (
                                            <div key={entryIndex} className="text-xs p-2 pl-12 border-b last:border-b-0 flex justify-between items-center">
                                              <div className="flex items-center space-x-4">
                                                <span className="text-gray-600">{entry.date}</span>
                                                <span className="text-gray-600">{entry.dept_name}</span>
                                                {entry.entry_type === 'overtime' && (entry.ot15_hours || entry.ot20_hours) && (
                                                  <span className="text-xs text-orange-600">
                                                    {entry.ot15_hours ? `1.5x: ${entry.ot15_hours}h` : ''} 
                                                    {entry.ot15_hours && entry.ot20_hours ? ' | ' : ''}
                                                    {entry.ot20_hours ? `2.0x: ${entry.ot20_hours}h` : ''}
                                                  </span>
                                                )}
                                                <span className="text-gray-400 font-mono text-xs">
                                                  {entry.idempotency_key.substring(0, 8)}...
                                                </span>
                                              </div>
                                              <div className="text-right">
                                                <div className="text-gray-700">{entry.hours}h</div>
                                                <div className="text-gray-500">${entry.cost.toFixed(2)}</div>
                                                <div className="text-xs text-gray-400">${entry.cost_per_hour}/h</div>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Ready Status */}
                  <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
                    <div className="text-sm text-green-800">
                      <strong>Ready for time entry creation!</strong>
                    </div>
                    <div className="text-xs text-green-600 mt-1">
                      All entries have been processed with idempotency keys. Ready for hybrid idempotency workflow.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-red-600 bg-red-50 p-3 rounded border border-red-200">
                  {results.error}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          {/* Hidden file input */}
          <input
            type="file"
            id="timesheetFileInput"
            style={{ display: 'none' }}
            onChange={handleFileUpload}
            accept=".xlsx, .xls"
          />
          
          {/* Upload Button */}
          <button
            type="button"
            onClick={triggerFileInput}
            disabled={isDisabled}
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowUpTrayIcon className="size-5 mr-2" />
            {isUploading ? 'Processing...' : 'Upload Timesheet'}
          </button>
        </div>
      </div>
    </div>
  );
} 