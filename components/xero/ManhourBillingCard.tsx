'use client';

import React from 'react';
import { PlayIcon } from '@heroicons/react/20/solid';
import { useLog } from '../../contexts/LogContext';
import { FunctionCardProps } from './types';

interface ManhourBillingCardProps extends FunctionCardProps {}

export default function ManhourBillingCard({ disabled = false }: ManhourBillingCardProps) {
  const { addLog } = useLog();

  const handleManhourBilling = () => {
    addLog({ message: 'Manhour Billing button clicked', source: 'ManhourBillingCard' });
    // Implement actual manhour billing logic here
  };

  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-lg hover:shadow-xl transition-shadow duration-300 ease-in-out">
      <div className="p-6">
        <h2 className="text-lg font-semibold text-indigo-600">Manhour Billing</h2>
        <p className="mt-2 text-sm text-gray-600 min-h-[60px]">
          Generates invoices for clients based on billable manhours logged for specific projects in Xero.
        </p>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={handleManhourBilling}
            disabled={disabled}
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PlayIcon className="size-5 mr-2" />
            Run
          </button>
        </div>
      </div>
    </div>
  );
} 