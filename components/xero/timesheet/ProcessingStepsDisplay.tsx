'use client';

import React from 'react';
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/solid';
import ProgressBar from '../../ProgressBar';
import { ProcessingStep } from '../../../lib/timesheet/types';

interface ProcessingStepsDisplayProps {
  steps: ProcessingStep[];
  currentStepIndex: number;
  startTime: number | null;
  filePreview?: {
    fileName: string;
    fileSize: string;
  } | null;
  tenantName?: string;
}

export default function ProcessingStepsDisplay({
  steps,
  currentStepIndex,
  startTime,
  filePreview,
  tenantName
}: ProcessingStepsDisplayProps) {
  
  const StepIndicator = ({ step }: { step: ProcessingStep }) => {
    const isActive = step.status === 'current';
    const isCompleted = step.status === 'completed';
    const isError = step.status === 'error';
    const isPending = step.status === 'pending';
    
    if (isCompleted) {
      return (
        <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
          <CheckIcon className="w-3 h-3 text-white" />
        </div>
      );
    }
    
    if (isActive) {
      return (
        <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
        </div>
      );
    }
    
    if (isError) {
      return (
        <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
          <XMarkIcon className="w-3 h-3 text-white" />
        </div>
      );
    }
    
    return <div className="w-5 h-5 bg-gray-300 rounded-full" />;
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative w-5 h-5">
            <div className="absolute inset-0 rounded-full border-2 border-blue-200"></div>
            <div className="absolute inset-0 rounded-full border-2 border-blue-600 border-t-transparent animate-spin"></div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-blue-800">Processing Timesheet</h3>
            <p className="text-xs text-blue-600">
              {tenantName 
                ? `Processing in "${tenantName}"...`
                : 'Initializing processing...'
              }
            </p>
          </div>
        </div>
        
        {filePreview && (
          <div className="mb-4 text-xs text-blue-700 bg-blue-100 bg-opacity-50 rounded p-2">
            📄 <strong>{filePreview.fileName}</strong> ({filePreview.fileSize})
          </div>
        )}

        {/* Step Progress */}
        {steps.length > 0 && (
          <div className="mt-4 space-y-3">
            {steps.map((step) => (
              <div key={step.id} className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <StepIndicator step={step} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className={`text-sm font-medium ${
                      step.status === 'completed' ? 'text-green-700' :
                      step.status === 'current' ? 'text-blue-700' :
                      step.status === 'error' ? 'text-red-700' :
                      'text-gray-500'
                    }`}>
                      {step.title}
                    </h4>
                    {step.startTime && (step.status === 'current' || step.status === 'completed' || step.status === 'error') && (
                      <span className="text-xs text-gray-400">
                        {step.status === 'completed' && step.completedTime 
                          ? `${((step.completedTime - step.startTime) / 1000).toFixed(1)}s`
                          : step.status === 'current' 
                          ? `${((Date.now() - step.startTime) / 1000).toFixed(0)}s`
                          : ''
                        }
                      </span>
                    )}
                  </div>
                  
                  <p className={`text-xs mt-0.5 ${
                    step.status === 'completed' ? 'text-green-600' :
                    step.status === 'current' ? 'text-blue-600' :
                    step.status === 'error' ? 'text-red-600' :
                    'text-gray-400'
                  }`}>
                    {step.details || step.description}
                  </p>
                  
                  {step.status === 'current' && (
                    <div className="mt-1">
                      <div className="w-full bg-blue-200 rounded-full h-1">
                        <div className="bg-blue-500 h-1 rounded-full animate-pulse" style={{ width: '60%' }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Overall Progress Bar */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
        <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
          <span>Overall Progress</span>
          <span>
            {steps.filter(s => s.status === 'completed').length} / {steps.length} steps
          </span>
        </div>
        <ProgressBar 
          current={steps.filter(s => s.status === 'completed').length}
          total={steps.length}
          startTime={startTime || undefined}
          message={
            currentStepIndex >= 0 && currentStepIndex < steps.length
              ? steps[currentStepIndex]?.title || 'Processing...'
              : 'Processing...'
          }
        />
        
        {startTime && (
          <div className="text-xs text-gray-500 mt-2 text-center">
            Elapsed: {((Date.now() - startTime) / 1000).toFixed(0)}s
          </div>
        )}
      </div>
    </div>
  );
} 