'use client';

import React from 'react';
import { TimesheetProcessingCard } from '../../../components/xero';

export default function XeroPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Xero Integration Dashboard</h1>
          <p className="mt-2 text-gray-600">Process timesheets and synchronize data with Xero</p>
        </div>

        <div className="flex justify-center">
          <div className="w-full max-w-4xl">
            <TimesheetProcessingCard disabled={false} />
          </div>
        </div>
      </div>
    </div>
  );
}