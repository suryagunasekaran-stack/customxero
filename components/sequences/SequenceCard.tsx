'use client';

import { useState } from 'react';
import { PencilIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';

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

interface SequenceCardProps {
  sequence: SequenceData;
  onUpdate: () => void;
}

export default function SequenceCard({ sequence, onUpdate }: SequenceCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [newSequence, setNewSequence] = useState(sequence.lastSequenceNumber.toString());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleUpdate = async () => {
    const newSequenceNum = parseInt(newSequence);
    
    if (newSequenceNum === sequence.lastSequenceNumber) {
      setIsEditing(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/sequences/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          departmentCode: sequence.departmentCode,
          year: sequence.year,
          newSequence: newSequenceNum
        }),
      });

      const data = await response.json();

      if (response.ok) {
        onUpdate();
        setIsEditing(false);
        if (data.validation?.warnings?.length > 0) {
          alert(`Updated successfully with warnings:\n${data.validation.warnings.join('\n')}`);
        }
      } else {
        setError(data.validation?.errors?.[0] || data.message || 'Update failed');
      }
    } catch (err) {
      setError('Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setNewSequence(sequence.lastSequenceNumber.toString());
    setIsEditing(false);
    setError('');
  };

  const formatProjectNumber = (seq: number) => {
    return `${sequence.departmentCode}${sequence.year.toString().padStart(2, '0')}${seq.toString().padStart(3, '0')}`;
  };

  const getTestingRange = () => {
    const current = sequence.lastSequenceNumber;
    if (current >= 900) return null;
    return { start: 900, end: 999 };
  };

  const testingRange = getTestingRange();

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            {sequence.departmentName} ({sequence.departmentCode})
          </h3>
          <p className="text-sm text-gray-500">Year: 20{sequence.year}</p>
        </div>
        <div className="flex space-x-2">
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
              title="Edit sequence"
            >
              <PencilIcon className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex space-x-1">
              <button
                onClick={handleUpdate}
                disabled={loading}
                className="p-2 text-green-600 hover:text-green-700 disabled:opacity-50"
                title="Save changes"
              >
                <CheckIcon className="h-4 w-4" />
              </button>
              <button
                onClick={handleCancel}
                disabled={loading}
                className="p-2 text-red-600 hover:text-red-700 disabled:opacity-50"
                title="Cancel"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Current Sequence:</span>
          {!isEditing ? (
            <span className="text-lg font-mono bg-gray-100 px-3 py-1 rounded">
              {sequence.lastSequenceNumber.toString().padStart(3, '0')}
            </span>
          ) : (
            <input
              type="number"
              value={newSequence}
              onChange={(e) => setNewSequence(e.target.value)}
              className="w-20 px-3 py-1 border border-gray-300 rounded text-center font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              min="1"
              max="999"
            />
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Next Project:</span>
          <span className="text-sm font-mono bg-blue-50 text-blue-800 px-3 py-1 rounded">
            {formatProjectNumber(isEditing ? parseInt(newSequence) + 1 : sequence.lastSequenceNumber + 1)}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Projects Created:</span>
          <span className="text-sm bg-green-50 text-green-800 px-3 py-1 rounded">
            {sequence.projectCount}
          </span>
        </div>

        {sequence.lastProjectNumber && (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Latest Project:</span>
            <span className="text-sm font-mono text-gray-600">
              {sequence.lastProjectNumber}
            </span>
          </div>
        )}

        {testingRange && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
            <p className="text-sm text-yellow-800">
              <strong>Testing Range Available:</strong> {formatProjectNumber(testingRange.start)} - {formatProjectNumber(testingRange.end)}
            </p>
            <button
              onClick={() => {
                setNewSequence(testingRange.start.toString());
                setIsEditing(true);
              }}
              className="mt-2 text-xs bg-yellow-200 hover:bg-yellow-300 text-yellow-800 px-2 py-1 rounded transition-colors"
            >
              Set to Testing Range
            </button>
          </div>
        )}

        {sequence.sampleProjects && sequence.sampleProjects.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Recent Projects:</p>
            <div className="space-y-1">
              {sequence.sampleProjects.map((project, idx) => (
                <div key={idx} className="text-xs text-gray-600 flex justify-between">
                  <span className="font-mono">{project.projectNumber}</span>
                  <span>{project.dealIds.length} deal{project.dealIds.length !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
} 