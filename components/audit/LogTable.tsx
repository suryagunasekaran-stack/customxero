'use client';

import React from 'react';
import { formatDistanceToNow } from 'date-fns';

interface LogTableProps {
  logs: any[];
  onSelectLog: (log: any) => void;
}

export default function LogTable({ logs, onSelectLog }: LogTableProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return 'bg-green-100 text-green-800';
      case 'FAILURE':
        return 'bg-red-100 text-red-800';
      case 'IN_PROGRESS':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getActionTypeLabel = (actionType: string) => {
    switch (actionType) {
      case 'TIMESHEET_UPLOAD':
        return 'Timesheet Upload';
      case 'TIMESHEET_PROCESS':
        return 'Timesheet Process';
      case 'PROJECT_UPDATE':
        return 'Project Update';
      case 'PROJECT_SYNC':
        return 'Project Sync';
      case 'PROJECT_SYNC_COMPLETE':
        return 'Sync Complete';
      default:
        return actionType;
    }
  };

  if (logs.length === 0) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <p className="text-gray-500 text-center">No audit logs found.</p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Action
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              User
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Time
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Duration
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {logs.map((log) => (
            <tr
              key={log.id}
              onClick={() => onSelectLog(log)}
              className="hover:bg-gray-50 cursor-pointer"
            >
              <td className="px-6 py-4 whitespace-nowrap">
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {getActionTypeLabel(log.action_type)}
                  </div>
                  <div className="text-sm text-gray-500">
                    {log.action_group === 'TIMESHEET_PROCESSING' ? 'Timesheet' : 'Project Sync'}
                  </div>
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900">{log.user_name || log.user_id}</div>
                <div className="text-sm text-gray-500">{log.tenant_name || 'Unknown Tenant'}</div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(log.status)}`}>
                  {log.status}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {log.execution_time_ms ? `${log.execution_time_ms}ms` : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
} 