'use client';

import React from 'react';
import { PlayIcon } from '@heroicons/react/20/solid';
import { useLog } from '../../../contexts/LogContext';

interface RunProjectCostButtonProps {
  disabled?: boolean;
  fileUploaded: boolean;
  buttonText: string;
}

export default function RunProjectCostButton({
  disabled = false,
  fileUploaded,
  buttonText,
}: RunProjectCostButtonProps) {
  const { addLog } = useLog();

  const handleRunAction = () => {
    if (fileUploaded) {
      addLog({ message: `Step 2 action triggered for Update Project Cost.`, source: 'RunProjectCostButton' });
      // Implement actual Step 2 logic here
    } else {
      addLog({ message: 'Please upload a file first for Update Project Cost.', source: 'RunProjectCostButton' });
    }
  };

  return (
    <button
      type="button"
      onClick={handleRunAction}
      disabled={!fileUploaded || disabled}
      className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <PlayIcon className="size-5 mr-2" />
      {buttonText}
    </button>
  );
} 