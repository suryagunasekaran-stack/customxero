'use client';

import React, { useState } from 'react';
import { CheckCircleIcon } from '@heroicons/react/20/solid';
import { useLog } from '../../../contexts/LogContext';

interface CheckProjectTasksButtonProps {
  disabled?: boolean;
}

export default function CheckProjectTasksButton({
  disabled = false,
}: CheckProjectTasksButtonProps) {
  const { addLog } = useLog();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleCheckTasks = async () => {
    if (isProcessing) return;

    setIsProcessing(true);
    
    // Initial log entry
    addLog({ 
      message: 'Check Project Tasks: Initiated\\nAnalyzing INPROGRESS projects for required task compliance...', 
      source: 'CheckProjectTasksButton' 
    });

    try {
      addLog({ 
        message: 'Check Project Tasks: Calling Xero API to fetch projects and tasks...\\nThis may take a moment depending on the number of projects.', 
        source: 'CheckProjectTasksButton' 
      });

      const response = await fetch('/api/xero/check-project-tasks');
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(`API Error: ${response.status} - ${errorData.message || errorData.error || 'Unknown error'}`);
      }

      const data = await response.json();

      // Step 1: Data retrieval summary
      addLog({ 
        message: `✅ Check Project Tasks: Data retrieval complete\\n\\n📊 Project Fetching Summary:\\n   • Total INPROGRESS projects found: ${data.totalProjects}\\n   • Successful task fetches: ${data.successfulProjectFetches}\\n   • Failed task fetches: ${data.failedProjectFetches}\\n   • Total tasks retrieved: ${data.totalTasks}`, 
        source: 'CheckProjectTasksButton' 
      });

      // Step 2: Task frequency analysis
      const taskFrequencyEntries = Object.entries(data.taskFrequency)
        .sort(([,a], [,b]) => (b as number) - (a as number));

      let frequencyMessage = '📈 Required Task Frequency Analysis:';
      taskFrequencyEntries.forEach(([taskName, count]) => {
        const percentage = data.totalProjects > 0 ? Math.round(((count as number) / data.totalProjects) * 100) : 0;
        frequencyMessage += `\\n   • ${taskName}: ${count}/${data.totalProjects} projects (${percentage}%)`;
      });

      addLog({ 
        message: frequencyMessage, 
        source: 'CheckProjectTasksButton' 
      });

      // Step 3: Standardization Results (NEW!)
      if (data.summary.totalTasksCreated > 0) {
        addLog({ 
          message: `========================================\\n🔧 AUTOMATIC STANDARDIZATION COMPLETE\\n========================================\\n✅ Tasks Created: ${data.summary.totalTasksCreated}\\n✅ Projects Standardized: ${data.summary.projectsStandardized}\\n\\n🎯 All projects now have the required task structure!`, 
          source: 'CheckProjectTasksButton' 
        });

        // Show standardization details
        if (data.standardizationReports && data.standardizationReports.length > 0) {
          let standardizationDetails = '\\n📋 Standardization Details:';
          data.standardizationReports.forEach((report: any, index: number) => {
            const successfulTasks = report.createdTasks.filter((task: any) => task.success);
            if (successfulTasks.length > 0) {
              standardizationDetails += `\\n\\n${index + 1}. 📝 Project: ${report.projectName}`;
              standardizationDetails += `\\n   ✅ Tasks Created: ${successfulTasks.map((task: any) => task.taskName).join(', ')}`;
            }
          });
          
          addLog({ 
            message: standardizationDetails, 
            source: 'CheckProjectTasksButton' 
          });
        }
      }

      // Step 4: Final compliance analysis
      addLog({ 
        message: `========================================\\n🎯 PROJECT TASKS COMPLIANCE ANALYSIS\\n========================================\\n📅 Analysis Date: ${data.analysisDateTime}\\n\\n🔧 Required Tasks: ${data.requiredTasks.join(', ')}\\n\\n📋 Final Compliance Summary:\\n   • Projects analyzed: ${data.summary.totalProjectsAnalyzed}\\n   • Projects with ALL required tasks: ${data.summary.projectsWithAllRequiredTasks}\\n   • Projects MISSING required tasks: ${data.summary.projectsMissingRequiredTasks}\\n   • Overall compliance rate: ${data.summary.completionPercentage}%`, 
        source: 'CheckProjectTasksButton' 
      });

      // Step 5: Non-compliant projects details
      if (data.projectsWithMissingTasks.length > 0) {
        addLog({ 
          message: `========================================\\n❌ PROJECTS MISSING REQUIRED TASKS (${data.projectsWithMissingTasks.length})\\n========================================`, 
          source: 'CheckProjectTasksButton' 
        });

        // Group projects by number of missing tasks for better organization
        const projectsByMissingCount = data.projectsWithMissingTasks.reduce((acc: any, project: any) => {
          const missingCount = project.missingTasks.length;
          if (!acc[missingCount]) acc[missingCount] = [];
          acc[missingCount].push(project);
          return acc;
        }, {});

        Object.keys(projectsByMissingCount)
          .sort((a, b) => parseInt(b) - parseInt(a))
          .forEach((missingCount) => {
            const projects = projectsByMissingCount[missingCount];
            addLog({
              message: `\\n🔴 Projects missing ${missingCount} required task${missingCount !== '1' ? 's' : ''} (${projects.length} project${projects.length !== 1 ? 's' : ''}):`,
              source: 'CheckProjectTasksButton'
            });

            projects.forEach((project: any, index: number) => {
              const hasExistingTasks = project.existingTasks && project.existingTasks.length > 0;
              let projectMessage = `\\n${String(index + 1).padStart(3, ' ')}. 📝 Project: ${project.projectName}\\n      🆔 ID: ${project.projectId}\\n      📊 Status: ${project.status}\\n      📈 Total Tasks: ${project.totalTasks}\\n      ❌ Missing Required: ${project.missingTasks.join(', ')}`;
              
              if (hasExistingTasks) {
                projectMessage += `\\n      ✅ Has Required: ${project.existingTasks.join(', ')}`;
              } else {
                projectMessage += `\\n      ✅ Has Required: None`;
              }

              addLog({
                message: projectMessage,
                source: 'CheckProjectTasksButton'
              });
            });
          });

        // Step 6: Missing task breakdown summary
        const missingTaskSummary: { [taskName: string]: number } = {};
        data.projectsWithMissingTasks.forEach((project: any) => {
          project.missingTasks.forEach((task: string) => {
            missingTaskSummary[task] = (missingTaskSummary[task] || 0) + 1;
          });
        });

        const sortedMissingTasks = Object.entries(missingTaskSummary)
          .sort(([,a], [,b]) => (b as number) - (a as number));

        let summaryMessage = '📊 Missing Task Breakdown Summary:';
        sortedMissingTasks.forEach(([taskName, count]) => {
          summaryMessage += `\\n   • "${taskName}" missing in ${count} project${count !== 1 ? 's' : ''}`;
        });

        addLog({
          message: summaryMessage,
          source: 'CheckProjectTasksButton'
        });

      } else {
        addLog({ 
          message: '🎉 EXCELLENT! All INPROGRESS projects have the required tasks!\\n\\n✅ All projects are compliant with the required task structure:\\n   ✓ Manhour\\n   ✓ Overtime\\n   ✓ Supply Labour\\n   ✓ Transport\\n\\n🎯 Perfect compliance achieved!', 
          source: 'CheckProjectTasksButton' 
        });
      }

      // Step 7: Compliant projects (if there are both compliant and non-compliant)
      if (data.projectsWithAllTasks.length > 0 && data.projectsWithMissingTasks.length > 0) {
        const projectsToShow = data.projectsWithAllTasks.slice(0, 10);
        let compliantMessage = `========================================\\n✅ FULLY COMPLIANT PROJECTS (${data.projectsWithAllTasks.length})\\n========================================`;

        projectsToShow.forEach((project: any, index: number) => {
          compliantMessage += `\\n${String(index + 1).padStart(3, ' ')}. 📝 ${project.projectName} (${project.totalTasks} tasks)`;
        });

        if (data.projectsWithAllTasks.length > 10) {
          compliantMessage += `\\n\\n      ... and ${data.projectsWithAllTasks.length - 10} more compliant projects`;
        }

        addLog({
          message: compliantMessage,
          source: 'CheckProjectTasksButton'
        });
      }

      // Step 8: Action recommendations
      if (data.projectsWithMissingTasks.length > 0) {
        addLog({ 
          message: '========================================\\n💡 RECOMMENDED ACTIONS\\n========================================\\n\\n1️⃣ Review the projects listed above that are missing required tasks\\n2️⃣ Add the missing tasks to each project in Xero\\n3️⃣ Ensure all required tasks have appropriate rates configured\\n4️⃣ Re-run this analysis to verify compliance\\n\\n⚠️  Required tasks should be created for proper project tracking and billing accuracy.', 
          source: 'CheckProjectTasksButton' 
        });
      }

      // Step 9: Download Report
      if (data.downloadableReport) {
        addLog({ 
          message: '========================================\\n📥 DOWNLOADABLE REPORT AVAILABLE\\n========================================\\n🎯 A detailed standardization report has been generated!\\n\\n📄 The report contains:\\n   • Complete analysis results\\n   • All standardization actions taken\\n   • Task creation details\\n   • Compliance status for each project\\n\\n⬇️ Starting automatic download...', 
          source: 'CheckProjectTasksButton' 
        });

        // Trigger automatic download
        try {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
          const filename = `xero-standardization-report-${timestamp}.txt`;
          
          const blob = new Blob([data.downloadableReport], { type: 'text/plain' });
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);

          addLog({ 
            message: `✅ Report downloaded successfully: ${filename}\\n\\n📂 Check your Downloads folder for the complete report.`, 
            source: 'CheckProjectTasksButton' 
          });
        } catch (downloadError) {
          console.error('Download error:', downloadError);
          addLog({ 
            message: `❌ Download failed. You can still access the report via:\\n🔗 /api/xero/download-standardization-report`, 
            source: 'CheckProjectTasksButton' 
          });
        }
      }

      // Final completion message
      addLog({ 
        message: '========================================\\n🏁 ANALYSIS COMPLETE\\n========================================\\n✅ Project task compliance check finished successfully.', 
        source: 'CheckProjectTasksButton' 
      });

    } catch (error) {
      console.error('Error checking project tasks:', error);
      addLog({ 
        message: `❌ Check Project Tasks: FAILED\\n\\n🚨 Error Details:\\n${error instanceof Error ? error.message : 'Unknown error'}\\n\\n💡 Please check your Xero connection and try again.`, 
        source: 'CheckProjectTasksButton' 
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCheckTasks}
      disabled={disabled || isProcessing}
      className="inline-flex items-center justify-center rounded-md border border-transparent bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <CheckCircleIcon className="size-5 mr-2" />
      {isProcessing ? 'Analyzing...' : 'Check Tasks'}
    </button>
  );
} 