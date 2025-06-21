'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useSession } from 'next-auth/react';
import { ActionGroup } from '@/lib/auditLogger';
import LogFilters from '@/components/audit/LogFilters';
import LogTable from '@/components/audit/LogTable';
import LogDetails from '@/components/audit/LogDetails';

// Get Supabase URL from the existing supabase.ts config
const supabaseUrl = 'https://cxqamciqlaazofrwxpsc.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

export default function AuditLogsPage() {
  const { data: session } = useSession();
  const [logs, setLogs] = useState<any[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [filters, setFilters] = useState({
    actionGroup: 'ALL' as ActionGroup | 'ALL',
    status: 'ALL' as 'SUCCESS' | 'FAILURE' | 'IN_PROGRESS' | 'ALL',
    dateRange: { start: null as Date | null, end: null as Date | null }
  });

  useEffect(() => {
    fetchLogs();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [logs, filters]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...logs];

    // Filter by action group
    if (filters.actionGroup !== 'ALL') {
      filtered = filtered.filter(log => log.action_group === filters.actionGroup);
    }

    // Filter by status
    if (filters.status !== 'ALL') {
      filtered = filtered.filter(log => log.status === filters.status);
    }

    // Filter by date range
    if (filters.dateRange.start) {
      filtered = filtered.filter(log => 
        new Date(log.created_at) >= filters.dateRange.start!
      );
    }
    if (filters.dateRange.end) {
      filtered = filtered.filter(log => 
        new Date(log.created_at) <= filters.dateRange.end!
      );
    }

    setFilteredLogs(filtered);
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">Audit Logs</h1>
          <p className="mt-2 text-sm text-gray-700">
            View and monitor all system activities and user actions
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
          <button
            onClick={fetchLogs}
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-8 flex gap-6">
        <div className="w-64">
          <LogFilters filters={filters} onFiltersChange={setFilters} />
        </div>
        
        <div className="flex-1">
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
          ) : (
            <LogTable 
              logs={filteredLogs} 
              onSelectLog={setSelectedLog}
            />
          )}
        </div>
      </div>

      {selectedLog && (
        <LogDetails 
          log={selectedLog} 
          onClose={() => setSelectedLog(null)} 
        />
      )}
    </div>
  );
} 