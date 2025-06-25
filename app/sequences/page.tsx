'use client';

import { useState, useEffect } from 'react';
import SequenceCard from '@/components/sequences/SequenceCard';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

interface SequenceData {
  _id: string;
  departmentCode: string;
  departmentName: string;
  year: number;
  lastSequenceNumber: number;
  projectCount: number;
  lastProjectNumber?: string | null;
  lastProjectCreated?: Date | null;
  sampleProjects?: Array<{
    projectNumber: string;
    dealIds: string[];
    createdAt: Date;
  }>;
}

interface Stats {
  overview: {
    totalSequences: number;
    totalProjectMappings: number;
    currentYear: number;
  };
  sequencesByDepartment: Array<{
    _id: string;
    count: number;
    totalProjects: number;
    maxSequence: number;
    minSequence: number;
  }>;
  projectsByDepartment: Array<{
    _id: string;
    projectCount: number;
    dealCount: number;
    latestProject: Date;
  }>;
  recentProjects: Array<{
    projectNumber: string;
    department: string;
    dealCount: number;
    createdAt: Date;
  }>;
}

export default function SequencesPage() {
  const [sequences, setSequences] = useState<SequenceData[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchSequences = async () => {
    try {
      const response = await fetch('/api/sequences');
      if (!response.ok) throw new Error('Failed to fetch sequences');
      const data = await response.json();
      setSequences(data.sequences);
    } catch (err) {
      setError('Failed to load sequences');
      console.error(err);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/sequences/stats');
      if (!response.ok) throw new Error('Failed to fetch stats');
      const data = await response.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const loadData = async () => {
    setLoading(true);
    await Promise.all([fetchSequences(), fetchStats()]);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <ArrowPathIcon className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading sequences...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button 
            onClick={loadData}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Project Sequences</h1>
              <p className="mt-2 text-gray-600">Manage department project numbering sequences</p>
            </div>
            <button
              onClick={loadData}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <ArrowPathIcon className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Stats Overview */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500">Total Sequences</h3>
              <p className="mt-2 text-3xl font-semibold text-gray-900">{stats.overview.totalSequences}</p>
              <p className="mt-1 text-sm text-gray-600">Active department sequences</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500">Total Projects</h3>
              <p className="mt-2 text-3xl font-semibold text-gray-900">{stats.overview.totalProjectMappings}</p>
              <p className="mt-1 text-sm text-gray-600">Projects created to date</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500">Current Year</h3>
              <p className="mt-2 text-3xl font-semibold text-gray-900">20{stats.overview.currentYear}</p>
              <p className="mt-1 text-sm text-gray-600">Active year for new projects</p>
            </div>
          </div>
        )}

        {/* Sequence Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sequences.map((sequence) => (
            <SequenceCard 
              key={sequence._id} 
              sequence={sequence} 
              onUpdate={loadData}
            />
          ))}
        </div>

        {/* Recent Activity */}
        {stats && stats.recentProjects.length > 0 && (
          <div className="mt-12">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Project Activity</h2>
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Project Number
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Department
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Deals
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {stats.recentProjects.map((project, idx) => (
                    <tr key={idx}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                        {project.projectNumber}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {project.department}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {project.dealCount}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(project.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 