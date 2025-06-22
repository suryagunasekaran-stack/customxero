'use client';

import React from 'react';
import { ActionGroup } from '@/lib/auditLogger';
import PremiumDropdown, { DropdownOption } from '../PremiumDropdown';

interface LogFiltersProps {
  filters: {
    actionGroup: ActionGroup | 'ALL';
    status: 'SUCCESS' | 'FAILURE' | 'IN_PROGRESS' | 'ALL';
    dateRange: { start: Date | null; end: Date | null };
  };
  onFiltersChange: (filters: any) => void;
}

export default function LogFilters({ filters, onFiltersChange }: LogFiltersProps) {
  const actionGroupOptions: DropdownOption[] = [
    { value: 'ALL', label: 'All Groups' },
    { value: 'TIMESHEET_PROCESSING', label: 'Timesheet Processing' },
    { value: 'PROJECT_SYNC', label: 'Project Sync' }
  ];

  const statusOptions: DropdownOption[] = [
    { value: 'ALL', label: 'All Statuses' },
    { value: 'SUCCESS', label: 'Success' },
    { value: 'FAILURE', label: 'Failure' },
    { value: 'IN_PROGRESS', label: 'In Progress' }
  ];

  const handleActionGroupChange = (value: string) => {
    onFiltersChange({ ...filters, actionGroup: value });
  };

  const handleStatusChange = (value: string) => {
    onFiltersChange({ ...filters, status: value });
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
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Action Group
          </label>
          <PremiumDropdown
            options={actionGroupOptions}
            value={filters.actionGroup}
            onChange={handleActionGroupChange}
            className="w-full"
            buttonClassName="w-full"
          />
        </div>

        {/* Status Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Status
          </label>
          <PremiumDropdown
            options={statusOptions}
            value={filters.status}
            onChange={handleStatusChange}
            className="w-full"
            buttonClassName="w-full"
          />
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