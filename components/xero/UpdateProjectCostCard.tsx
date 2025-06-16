'use client';

import React, { useState } from 'react';
import { ArrowUpTrayIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/20/solid';
import { useLog } from '../../contexts/LogContext';
import { FunctionCardProps } from './types';

interface UpdateProjectCostCardProps extends FunctionCardProps {}

// Updated interfaces to match new Flask route response
interface ConsolidatedTask {
  name: string;
  rate: {
    currency: string;
    value: number;
  };
  chargeType: string;
  estimateMinutes: number;
  idempotencyKey: string;
}

interface ConsolidatedPayload {
  [projectCode: string]: ConsolidatedTask[];
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
    projects_consolidated: number;
    total_category_entries: number;
  };
  consolidated_payload: ConsolidatedPayload;
  job_summaries?: JobSummary[];
  statistics?: {
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
  const [projectData, setProjectData] = useState<any>(null);
  const [updatePlanData, setUpdatePlanData] = useState<any>(null);
  const [isExecuting, setIsExecuting] = useState(false);
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
        message: `✅ Successfully processed ${data.metadata.entries_processed} timesheet entries and consolidated into ${data.metadata.projects_consolidated} projects with ${data.metadata.total_category_entries} total tasks!`, 
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

  // Group tasks by project code
  const getJobCodeBreakdown = () => {
    if (!results?.consolidated_payload) return {};
    
    const breakdown: Record<string, Record<string, ConsolidatedTask[]>> = {};
    
    Object.entries(results.consolidated_payload).forEach(([projectCode, tasks]) => {
      breakdown[projectCode] = {};
      
      tasks.forEach(task => {
        const taskType = task.name.toLowerCase().replace(' ', '_');
        if (!breakdown[projectCode][taskType]) breakdown[projectCode][taskType] = [];
        breakdown[projectCode][taskType].push(task);
      });
    });
    
    return breakdown;
  };

  const triggerFileInput = () => {
    document.getElementById('timesheetFileInput')?.click();
  };

  // New function to fetch and extract project codes
  const handleFetchProjectCodes = async () => {
    const logId = addLog({ 
      message: 'Fetching INPROGRESS projects and extracting project codes...', 
      source: 'UpdateProjectCostCard' 
    });

    try {
      const response = await fetch('/api/xero/projects/extract-codes');
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(`API Error: ${response.status} - ${errorData.message || errorData.error || 'Unknown error'}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to extract project codes');
      }

      // Log successful results with detailed breakdown
      const testingModeText = data.summary.testingMode ? ` (TESTING MODE: processed ${data.summary.processedProjects} of ${data.summary.totalProjects})` : '';
      addLog({ 
        message: `✅ Successfully fetched ${data.summary.totalProjects} INPROGRESS projects and extracted ${data.summary.uniqueProjectCodes} unique project codes!${testingModeText}`, 
        source: 'UpdateProjectCostCard',
        idToUpdate: logId,
        mode: 'replace'
      });

      // Log project codes summary
      addLog({ 
        message: `\n📊 Project Code Analysis:\n   • Total Projects Found: ${data.summary.totalProjects}\n   • Projects Processed: ${data.summary.processedProjects}\n   • Unique Project Codes: ${data.summary.uniqueProjectCodes}\n   • Average Projects per Code: ${data.summary.averageProjectsPerCode.toFixed(2)}\n   • Duplicate Codes: ${data.summary.duplicateCodesCount}${data.summary.testingMode ? '\n   ⚠️ TESTING MODE: Limited processing to avoid rate limits' : ''}`, 
        source: 'UpdateProjectCostCard',
        idToUpdate: logId,
        mode: 'append'
      });

      // Log task fetching summary
      addLog({ 
        message: `\n🔧 Task Fetching Summary:\n   • Total Tasks Fetched: ${data.summary.totalTasksFetched}\n   • Successful Fetches: ${data.summary.successfulTaskFetches}\n   • Failed Fetches: ${data.summary.failedTaskFetches}`, 
        source: 'UpdateProjectCostCard',
        idToUpdate: logId,
        mode: 'append'
      });

      // Log time entry fetching summary
      addLog({ 
        message: `\n⏱️ Time Entry Fetching Summary:\n   • Total Time Entries Fetched: ${data.summary.totalTimeEntriesFetched}\n   • Successful Fetches: ${data.summary.successfulTimeEntryFetches}\n   • Failed Fetches: ${data.summary.failedTimeEntryFetches}\n   • Total Existing Time Entries: ${data.summary.totalExistingTimeEntries}`, 
        source: 'UpdateProjectCostCard',
        idToUpdate: logId,
        mode: 'append'
      });

      // Log unique project codes
      if (data.uniqueProjectCodes && data.uniqueProjectCodes.length > 0) {
        const codesList = data.uniqueProjectCodes.slice(0, 20).join(', ');
        const moreText = data.uniqueProjectCodes.length > 20 ? ` (+${data.uniqueProjectCodes.length - 20} more)` : '';
        addLog({ 
          message: `\n🔖 Project Codes Found: ${codesList}${moreText}`, 
          source: 'UpdateProjectCostCard',
          idToUpdate: logId,
          mode: 'append'
        });
      }

      // Log common tasks found
      if (data.allTaskNames && data.allTaskNames.length > 0) {
        const tasksList = data.allTaskNames.slice(0, 10).join(', ');
        const moreTasksText = data.allTaskNames.length > 10 ? ` (+${data.allTaskNames.length - 10} more)` : '';
        addLog({ 
          message: `\n📋 Common Tasks Found: ${tasksList}${moreTasksText}`, 
          source: 'UpdateProjectCostCard',
          idToUpdate: logId,
          mode: 'append'
        });
      }

      // Log duplicates if any
      if (data.duplicateCodes && data.duplicateCodes.length > 0) {
        addLog({ 
          message: `\n⚠️ Duplicate Project Codes Found:`, 
          source: 'UpdateProjectCostCard',
          idToUpdate: logId,
          mode: 'append'
        });
        
        data.duplicateCodes.forEach((duplicate: any) => {
          addLog({ 
            message: `   • "${duplicate.code}" appears ${duplicate.count} times`, 
            source: 'UpdateProjectCostCard',
            idToUpdate: logId,
            mode: 'append'
          });
        });
      }

      // Log project codes with required tasks
      if (data.projectCodeTaskMapping) {
        const requiredTasks = ['Manhour', 'Overtime', 'Supply Labour'];
        const codesWithRequiredTasks: string[] = [];
        const codesWithMissingTasks: { code: string, missing: string[] }[] = [];

        Object.entries(data.projectCodeTaskMapping).forEach(([code, data]: [string, any]) => {
          const availableTasks = Object.keys(data.tasks);
          const missingTasks = requiredTasks.filter(task => !availableTasks.includes(task));
          
          if (missingTasks.length === 0) {
            codesWithRequiredTasks.push(code);
          } else {
            codesWithMissingTasks.push({ code, missing: missingTasks });
          }
        });

        addLog({ 
          message: `\n✅ Project Codes with Required Tasks (${codesWithRequiredTasks.length}): ${codesWithRequiredTasks.slice(0, 15).join(', ')}${codesWithRequiredTasks.length > 15 ? `... (+${codesWithRequiredTasks.length - 15} more)` : ''}`, 
          source: 'UpdateProjectCostCard',
          idToUpdate: logId,
          mode: 'append'
        });

        if (codesWithMissingTasks.length > 0) {
          addLog({ 
            message: `\n⚠️ Project Codes Missing Required Tasks (${codesWithMissingTasks.length}):`, 
            source: 'UpdateProjectCostCard',
            idToUpdate: logId,
            mode: 'append'
          });
          
          codesWithMissingTasks.slice(0, 10).forEach(({ code, missing }) => {
            addLog({ 
              message: `   • ${code}: missing ${missing.join(', ')}`, 
              source: 'UpdateProjectCostCard',
              idToUpdate: logId,
              mode: 'append'
            });
          });

          if (codesWithMissingTasks.length > 10) {
            addLog({ 
              message: `   ... and ${codesWithMissingTasks.length - 10} more codes with missing tasks`, 
              source: 'UpdateProjectCostCard',
              idToUpdate: logId,
              mode: 'append'
            });
          }
        }
      }

      // Log time entry statistics by project code
      if (data.timeEntrySummary) {
        const codesWithTimeEntries = Object.entries(data.timeEntrySummary)
          .filter(([code, tasks]: [string, any]) => 
            Object.values(tasks).some((count: any) => count > 0)
          );
        
        const codesWithoutTimeEntries = Object.entries(data.timeEntrySummary)
          .filter(([code, tasks]: [string, any]) => 
            Object.values(tasks).every((count: any) => count === 0)
          );

        if (codesWithTimeEntries.length > 0) {
          addLog({ 
            message: `\n📊 Project Codes with Existing Time Entries (${codesWithTimeEntries.length}): ${codesWithTimeEntries.slice(0, 10).map(([code]) => code).join(', ')}${codesWithTimeEntries.length > 10 ? `... (+${codesWithTimeEntries.length - 10} more)` : ''}`, 
            source: 'UpdateProjectCostCard',
            idToUpdate: logId,
            mode: 'append'
          });
        }

        if (codesWithoutTimeEntries.length > 0) {
          addLog({ 
            message: `\n🆕 Project Codes with No Time Entries (${codesWithoutTimeEntries.length}): ${codesWithoutTimeEntries.slice(0, 10).map(([code]) => code).join(', ')}${codesWithoutTimeEntries.length > 10 ? `... (+${codesWithoutTimeEntries.length - 10} more)` : ''}`, 
            source: 'UpdateProjectCostCard',
            idToUpdate: logId,
            mode: 'append'
          });
        }
      }

      // Store the project data for comparison step
      setProjectData(data);
      console.log('Project extraction results:', data);

    } catch (error: any) {
      addLog({ 
        message: `❌ Error extracting project codes: ${error.message}`, 
        source: 'UpdateProjectCostCard',
        idToUpdate: logId,
        mode: 'replace'
      });
      console.error("Project codes extraction error:", error);
    }
  };

  // New function to generate project update plan
  const handleGenerateUpdatePlan = async () => {
    if (!results || !results.consolidated_payload || !projectData || !projectData.projectCodeTaskMapping) {
      addLog({ 
        message: '❌ Cannot generate plan: Missing processed timesheet data or project data. Please upload timesheet and extract project codes first.', 
        source: 'UpdateProjectCostCard' 
      });
      return;
    }

    const logId = addLog({ 
      message: `Generating update plan for ${Object.keys(results.consolidated_payload).length} project codes...`, 
      source: 'UpdateProjectCostCard' 
    });

    try {
      const response = await fetch('/api/xero/compare-time-entries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          processedTimesheet: results,
          projectCodeTaskMapping: projectData.projectCodeTaskMapping
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(`API Error: ${response.status} - ${errorData.message || errorData.error || 'Unknown error'}`);
      }

      const planData = await response.json();

      if (!planData.success) {
        throw new Error(planData.error || 'Update plan generation failed');
      }

      // Log successful plan generation
      addLog({ 
        message: `✅ Update plan generated! ${planData.summary.message}`, 
        source: 'UpdateProjectCostCard',
        idToUpdate: logId,
        mode: 'replace'
      });

      // Log detailed statistics
      addLog({ 
        message: `\n📊 Update Plan Statistics:\n   • Total Projects: ${planData.updatePlan.statistics.totalProjects}\n   • Projects to Update: ${planData.updatePlan.statistics.projectsToUpdate}\n   • Projects Up to Date: ${planData.updatePlan.statistics.projectsToSkip}\n   • Projects Not Found: ${planData.updatePlan.statistics.projectsNoMatch}\n   • Total Tasks: ${planData.updatePlan.statistics.totalTasks}\n   • Tasks to Update: ${planData.updatePlan.statistics.tasksToUpdate}\n   • Tasks Missing: ${planData.updatePlan.statistics.tasksMissing}`, 
        source: 'UpdateProjectCostCard',
        idToUpdate: logId,
        mode: 'append'
      });

      // Add download report functionality
      if (planData.updatePlan.reportData) {
        const downloadReport = () => {
          const blob = new Blob([planData.updatePlan.reportData.content], { type: 'text/csv' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = planData.updatePlan.reportData.filename;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
        };

        addLog({ 
          message: `\n📄 Download Report Available: ${planData.updatePlan.reportData.filename}`, 
          source: 'UpdateProjectCostCard',
          idToUpdate: logId,
          mode: 'append'
        });

        // Store download function for button click
        (window as any).downloadUpdatePlanReport = downloadReport;
      }

      // Store the update plan data for execution
      setUpdatePlanData(planData);

      // Log detailed project breakdown
      if (planData.updatePlan.projectActions && planData.updatePlan.projectActions.length > 0) {
        addLog({ 
          message: `\n📋 Project Update Plan:`, 
          source: 'UpdateProjectCostCard',
          idToUpdate: logId,
          mode: 'append'
        });

        // Filter to only show matching projects (skip no_match projects)
        const matchingProjects = planData.updatePlan.projectActions.filter((project: any) => project.action !== 'no_match');
        
        matchingProjects.forEach((project: any) => {
          const projectName = project.projectName && project.projectName.length > 30 ? 
            `${project.projectName.substring(0, 30)}...` : project.projectName || 'Unknown';
          addLog({ 
            message: `\n🏗️ ${project.projectCode} - ${projectName}:\n   • Action: ${project.action.toUpperCase()}\n   • Tasks: ${project.tasks.length}\n   • Total Estimate: ${project.totalNewEstimate} minutes\n   • Total Fixed Cost: $${(project.totalNewRate / 100).toFixed(2)}`, 
            source: 'UpdateProjectCostCard',
            idToUpdate: logId,
            mode: 'append'
          });

          // Log task details
          project.tasks.forEach((task: any) => {
            const statusIcon = task.action === 'update' ? '🔄' : task.action === 'skip' ? '✅' : '❌';
            addLog({ 
              message: `     ${statusIcon} ${task.taskName}: ${task.newEstimate}min, $${(task.newRate / 100).toFixed(2)} (${task.action})`, 
              source: 'UpdateProjectCostCard',
              idToUpdate: logId,
              mode: 'append'
            });
          });
        });
      }

      // Log readiness for execution
      if (planData.summary.readyForExecution) {
        addLog({ 
          message: `\n🚀 Ready for execution! ${planData.updatePlan.statistics.projectsToUpdate} projects need updates`, 
          source: 'UpdateProjectCostCard',
          idToUpdate: logId,
          mode: 'append'
        });
      } else {
        addLog({ 
          message: `\n✨ All projects are up to date! No updates needed.`, 
          source: 'UpdateProjectCostCard',
          idToUpdate: logId,
          mode: 'append'
        });
      }

      console.log('Update plan results:', planData);

    } catch (error: any) {
      addLog({ 
        message: `❌ Error during comparison: ${error.message}`, 
        source: 'UpdateProjectCostCard',
        idToUpdate: logId,
        mode: 'replace'
      });
      console.error("Time entries comparison error:", error);
    }
  };

  // New function to execute the update plan
  const handleExecuteUpdatePlan = async () => {
    if (!updatePlanData || !updatePlanData.updatePlan) {
      addLog({ 
        message: '❌ No update plan available. Please generate an update plan first.', 
        source: 'UpdateProjectCostCard' 
      });
      return;
    }

    const logId = addLog({ 
      message: '🚀 Executing update plan - updating task estimates and rates in Xero...', 
      source: 'UpdateProjectCostCard' 
    });

    setIsExecuting(true);

    try {
      // Get tenant ID from project data
      const tenantId = projectData?.tenantId;
      if (!tenantId) {
        throw new Error('Tenant ID not available. Please extract project codes first.');
      }

      // Validate update plan has projects that need updating
      const projectsToUpdate = updatePlanData.updatePlan.projectActions.filter((p: any) => p.action === 'update');
      if (projectsToUpdate.length === 0) {
        throw new Error('No projects require updates. All projects are already up to date.');
      }

      // Log estimated execution time for large batches
      if (projectsToUpdate.length > 50) {
        const estimatedMinutes = Math.ceil((projectsToUpdate.length * 1.2) / 60);
        addLog({ 
          message: `\n⏱️ Large batch execution: ${projectsToUpdate.length} projects. Estimated time: ${estimatedMinutes} minutes`, 
          source: 'UpdateProjectCostCard',
          idToUpdate: logId,
          mode: 'append'
        });
      }

      const response = await fetch('/api/xero/execute-update-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          updatePlan: updatePlanData.updatePlan,
          tenantId: tenantId
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(`API Error: ${response.status} - ${errorData.message || errorData.error || 'Unknown error'}`);
      }

      const executionData = await response.json();

      if (!executionData.success) {
        throw new Error(executionData.error || 'Failed to execute update plan');
      }

      // Log successful execution results
      addLog({ 
        message: `✅ Update plan executed successfully! ${executionData.summary.message}`, 
        source: 'UpdateProjectCostCard',
        idToUpdate: logId,
        mode: 'replace'
      });

      // Log execution statistics
      addLog({ 
        message: `\n📊 Execution Statistics:\n   • Execution Time: ${executionData.summary.executionTime}\n   • Projects Processed: ${executionData.statistics.totalProjectsProcessed}\n   • Projects Successful: ${executionData.statistics.projectsSuccessful}\n   • Projects Failed: ${executionData.statistics.projectsFailed}\n   • Tasks Updated: ${executionData.statistics.tasksUpdated}\n   • Tasks Failed: ${executionData.statistics.tasksFailed}`, 
        source: 'UpdateProjectCostCard',
        idToUpdate: logId,
        mode: 'append'
      });

      // Log detailed project results
      if (executionData.results && executionData.results.length > 0) {
        addLog({ 
          message: `\n📋 Project Execution Results:`, 
          source: 'UpdateProjectCostCard',
          idToUpdate: logId,
          mode: 'append'
        });

        executionData.results.forEach((project: any) => {
          const statusIcon = project.action === 'success' ? '✅' : '❌';
          addLog({ 
            message: `\n${statusIcon} ${project.projectCode} - ${project.projectName}:\n   • Status: ${project.action.toUpperCase()}\n   • Tasks Updated: ${project.tasksUpdated}\n   • Tasks Failed: ${project.tasksFailed}\n   • Tasks Skipped: ${project.tasksSkipped}`, 
            source: 'UpdateProjectCostCard',
            idToUpdate: logId,
            mode: 'append'
          });

          // Log individual task results
          project.taskResults.forEach((task: any) => {
            const taskIcon = task.action === 'updated' ? '🔄' : task.action === 'failed' ? '❌' : '⏭️';
            const errorText = task.error ? ` - ${task.error}` : '';
            addLog({ 
              message: `     ${taskIcon} ${task.taskName}: ${task.action}${errorText}`, 
              source: 'UpdateProjectCostCard',
              idToUpdate: logId,
              mode: 'append'
            });
          });
        });
      }

      // Set up execution report download function
      const downloadExecutionReport = () => {
        const blob = new Blob([executionData.reportData.content], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = executionData.reportData.filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      };

      // Store execution report download function
      if (typeof window !== 'undefined') {
        (window as any).downloadExecutionReport = downloadExecutionReport;
      }

      // Auto-download the execution report
      setTimeout(() => {
        downloadExecutionReport();
        addLog({ 
          message: `\n📥 Execution report downloaded: ${executionData.reportData.filename}`, 
          source: 'UpdateProjectCostCard',
          idToUpdate: logId,
          mode: 'append'
        });
      }, 1000);

      console.log('Execution results:', executionData);

    } catch (error: any) {
      addLog({ 
        message: `❌ Error during execution: ${error.message}`, 
        source: 'UpdateProjectCostCard',
        idToUpdate: logId,
        mode: 'replace'
      });
      console.error("Update plan execution error:", error);
    } finally {
      setIsExecuting(false);
    }
  };

  const isDisabled = disabled || isUploading || isExecuting;
  const canGeneratePlan = results && results.consolidated_payload && projectData && projectData.projectCodeTaskMapping;
  const canExecutePlan = updatePlanData && updatePlanData.summary?.readyForExecution && projectData?.tenantId;
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
                      <span>📊 Projects Consolidated:</span>
                      <span className="font-medium">{results.metadata.projects_consolidated}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>📝 Category Entries:</span>
                      <span className="font-medium">{results.metadata.total_category_entries}</span>
                    </div>
                  </div>
                  
                  {/* Metadata Grid */}
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div className="bg-blue-50 p-2 rounded border">
                      <div className="text-xs text-blue-600 font-medium">Creation Date</div>
                      <div className="text-sm text-blue-900">{results.metadata.creation_date}</div>
                      <div className="text-xs text-blue-600">Report generated</div>
                    </div>
                    <div className="bg-orange-50 p-2 rounded border">
                      <div className="text-xs text-orange-600 font-medium">Period Range</div>
                      <div className="text-sm text-orange-900">{results.metadata.period_range}</div>
                      <div className="text-xs text-orange-600">Date coverage</div>
                    </div>
                    <div className="bg-purple-50 p-2 rounded border">
                      <div className="text-xs text-purple-600 font-medium">Entries Processed</div>
                      <div className="text-sm text-purple-900">{results.metadata.entries_processed}</div>
                      <div className="text-xs text-purple-600">Raw entries handled</div>
                    </div>
                    <div className="bg-yellow-50 p-2 rounded border">
                      <div className="text-xs text-yellow-600 font-medium">Entries Grouped</div>
                      <div className="text-sm text-yellow-900">{results.metadata.entries_grouped}</div>
                      <div className="text-xs text-yellow-600">Consolidated groups</div>
                    </div>
                  </div>
                  
                  {/* Expandable Project Codes Summary */}
                  {results.consolidated_payload && Object.keys(results.consolidated_payload).length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-xs font-medium text-gray-700 mb-2">
                        Project Code Breakdown ({Object.keys(results.consolidated_payload).length} projects)
                      </h4>
                      <div className="max-h-96 overflow-y-auto space-y-1">
                        {Object.entries(results.consolidated_payload).map(([projectCode, tasks], index) => (
                          <div key={index} className="bg-white rounded border p-3">
                            <div className="text-xs flex justify-between items-center">
                              <div className="flex items-center">
                                <span className="font-medium text-gray-900">{projectCode}</span>
                                <span className="text-gray-500 ml-2">({tasks.length} tasks)</span>
                              </div>
                              <div className="text-right">
                                <div className="text-gray-900">{(tasks.reduce((sum, task) => sum + task.estimateMinutes, 0) / 60).toFixed(1)}h</div>
                                <div className="text-gray-600">${(tasks.reduce((sum, task) => sum + task.rate.value, 0) / 100).toFixed(2)}</div>
                              </div>
                                        </div>
                            <div className="mt-2 space-y-1">
                              {tasks.map((task, taskIndex) => (
                                <div key={taskIndex} className="text-xs p-2 bg-gray-50 rounded flex justify-between items-center">
                                              <div className="flex items-center space-x-4">
                                    <span className="text-gray-600">{task.name}</span>
                                    <span className="text-gray-600">{task.chargeType}</span>
                                              </div>
                                              <div className="text-right">
                                    <div className="text-gray-700">{(task.estimateMinutes / 60).toFixed(1)}h</div>
                                    <div className="text-gray-500">${(task.rate.value / 100).toFixed(2)}</div>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
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

        <div className="mt-6 flex justify-end space-x-3">
          {/* Hidden file input */}
          <input
            type="file"
            id="timesheetFileInput"
            style={{ display: 'none' }}
            onChange={handleFileUpload}
            accept=".xlsx, .xls"
          />
          
          {/* Extract Project Codes Button */}
          <button
            type="button"
            onClick={handleFetchProjectCodes}
            disabled={isDisabled}
            className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="size-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Extract Project Codes
          </button>

          {/* Generate Update Plan Button */}
          <button
            type="button"
            onClick={handleGenerateUpdatePlan}
            disabled={isDisabled || !canGeneratePlan}
            className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="size-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Generate Update Plan
          </button>
          
          {/* Download Report Button */}
          {typeof window !== 'undefined' && (window as any).downloadUpdatePlanReport && (
            <button
              type="button"
              onClick={() => (window as any).downloadUpdatePlanReport()}
              className="inline-flex items-center justify-center rounded-md border border-transparent bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors duration-150"
            >
              <svg className="size-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download Report
            </button>
          )}

          {/* Execute Update Plan Button */}
          {canExecutePlan && (
            <button
              type="button"
              onClick={handleExecuteUpdatePlan}
              disabled={isDisabled}
              className="inline-flex items-center justify-center rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="size-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              {isExecuting ? 'Executing...' : 'Execute Updates'}
            </button>
          )}
          
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