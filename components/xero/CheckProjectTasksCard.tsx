'use client';

import React from 'react';
import { CheckProjectTasksButton } from './buttons';
import { FunctionCardProps } from './types';

interface CheckProjectTasksCardProps extends FunctionCardProps {}

export default function CheckProjectTasksCard({ disabled = false }: CheckProjectTasksCardProps) {
  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-lg hover:shadow-xl transition-shadow duration-300 ease-in-out">
      <div className="p-6">
        <h2 className="text-lg font-semibold text-indigo-600">Check Project Tasks</h2>
        <p className="mt-2 text-sm text-gray-600 min-h-[60px]">
          Analyzes all INPROGRESS projects in Xero to verify they have the required tasks: Manhour, Overtime, Supply Labour, and Transport. Provides detailed compliance reporting with actionable recommendations.
        </p>
        <div className="mt-6 flex justify-end">
          <CheckProjectTasksButton disabled={disabled} />
        </div>
      </div>
    </div>
  );
} 