'use client';

import React from 'react';
import { FunctionCardProps } from '../types';

export default function AnotherTenantProjectSync({ disabled }: FunctionCardProps) {
  return (
    <div className={`bg-white p-6 rounded-lg shadow ${disabled ? 'opacity-50' : ''}`}>
      <h3 className="text-lg font-semibold mb-2">Another Tenant Project Sync</h3>
      <p className="text-gray-600 mb-4">Project sync for another tenant</p>
      <div className="bg-gray-50 p-4 rounded">
        <p className="text-sm text-gray-500">Another tenant sync implementation placeholder</p>
      </div>
    </div>
  );
}