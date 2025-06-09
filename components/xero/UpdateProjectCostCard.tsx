'use client';

import React, { useState } from 'react';
import { FunctionCardProps } from './types';
import {
  UploadFileButton,
  RunProjectCostButton,
} from './buttons';

interface UpdateProjectCostCardProps extends FunctionCardProps {}

export default function UpdateProjectCostCard({ disabled = false }: UpdateProjectCostCardProps) {
  const [projectCostFileUploaded, setProjectCostFileUploaded] = useState(false);
  const [isUploadingProjectCostFile, setIsUploadingProjectCostFile] = useState(false);
  const [projectCostRunButtonText, setProjectCostRunButtonText] = useState('Run');

  const handleUploadStart = () => {
    setProjectCostRunButtonText('Run');
    setProjectCostFileUploaded(false);
    setIsUploadingProjectCostFile(true);
  };

  const handleUploadSuccess = () => {
    setProjectCostFileUploaded(true);
    setProjectCostRunButtonText('Step 2');
    setIsUploadingProjectCostFile(false);
  };

  const handleUploadError = () => {
    setIsUploadingProjectCostFile(false);
  };

  const isDisabled = disabled || isUploadingProjectCostFile;

  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-lg hover:shadow-xl transition-shadow duration-300 ease-in-out">
      <div className="p-6">
        <h2 className="text-lg font-semibold text-indigo-600">Update Project Cost</h2>
        <p className="mt-2 text-sm text-gray-600 min-h-[60px]">
          Recalculates and updates the total project costs in Xero based on the latest expenses and resource allocations.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <UploadFileButton
            disabled={isDisabled}
            isUploading={isUploadingProjectCostFile}
            onUploadStart={handleUploadStart}
            onUploadSuccess={handleUploadSuccess}
            onUploadError={handleUploadError}
          />
          <RunProjectCostButton
            disabled={isDisabled}
            fileUploaded={projectCostFileUploaded}
            buttonText={projectCostRunButtonText}
          />
        </div>
      </div>
    </div>
  );
} 