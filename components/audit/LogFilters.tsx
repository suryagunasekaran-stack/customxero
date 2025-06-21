'use client';

import React from 'react';
import { ActionGroup } from '@/lib/auditLogger';

interface LogFiltersProps {
  filters: {
    actionGroup: ActionGroup | 'ALL';
    status: 'SUCCESS' | 'FAILURE' | 'IN_PROGRESS' | 'ALL';
    dateRange: { start: Date | null; end: Date | null };
  };
  onFiltersChange: (filters: any) => void;
}

export default function LogFilters({ filters, onFiltersChange }: LogFiltersProps) {
  const handleActionGroupChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onFiltersChange({ ...filters, actionGroup: e.target.value });
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onFiltersChange({ ...filters, status: e.target.value });
  };

  const handleDateChange = (field: 'start' | 'end', value: string) => {
    onFiltersChange({
      ...filters,
      dateRange: {
        ...filters.dateRange,
        [field]: value ? new Date(value) : null
      }
    });
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Filters</h3>
      
      <div className="space-y-4">
        {/* Action Group Filter */}
        <div>
          <label htmlFor="action-group" className="block text-sm font-medium text-gray-700">
            Action Group
          </label>
          <select
            id="action-group"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            value={filters.actionGroup}
            onChange={handleActionGroupChange}
          >
            <option value="ALL">All Groups</option>
            <option value="TIMESHEET_PROCESSING">Timesheet Processing</option>
            <option value="PROJECT_SYNC">Project Sync</option>
          </select>
        </div>

        {/* Status Filter */}
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700">
            Status
          </label>
          <select
            id="status"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            value={filters.status}
            onChange={handleStatusChange}
          >
            <option value="ALL">All Statuses</option>
            <option value="SUCCESS">Success</option>
            <option value="FAILURE">Failure</option>
            <option value="IN_PROGRESS">In Progress</option>
          </select>
        </div>

        {/* Date Range Filters */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Date Range
          </label>
          <div className="space-y-2">
            <input
              type="datetime-local"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              onChange={(e) => handleDateChange('start', e.target.value)}
              placeholder="Start date"
            />
            <input
              type="datetime-local"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              onChange={(e) => handleDateChange('end', e.target.value)}
              placeholder="End date"
            />
          </div>
        </div>

        {/* Clear Filters Button */}
        <button
          onClick={() => onFiltersChange({
            actionGroup: 'ALL',
            status: 'ALL',
            dateRange: { start: null, end: null }
          })}
          className="w-full text-sm text-indigo-600 hover:text-indigo-500"
        >
          Clear all filters
        </button>
      </div>
    </div>
  );
} 