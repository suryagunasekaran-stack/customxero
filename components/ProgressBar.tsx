'use client';

import React, { useEffect, useState } from 'react';

interface ProgressBarProps {
  current: number;
  total: number;
  message?: string;
  startTime?: number;
  className?: string;
}

export default function ProgressBar({ current, total, message, startTime, className = '' }: ProgressBarProps) {
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  useEffect(() => {
    if (startTime && current > 0 && current < total) {
      const elapsed = Date.now() - startTime;
      const rate = current / elapsed;
      const remaining = (total - current) / rate;
      
      // Format time remaining
      if (remaining < 60000) { // Less than 1 minute
        setTimeRemaining(`${Math.ceil(remaining / 1000)}s remaining`);
      } else if (remaining < 3600000) { // Less than 1 hour
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.ceil((remaining % 60000) / 1000);
        setTimeRemaining(`${minutes}m ${seconds}s remaining`);
      } else {
        setTimeRemaining('Calculating...');
      }
    } else if (current >= total) {
      setTimeRemaining('Complete');
    }
  }, [current, total, startTime]);

  return (
    <div className={`w-full ${className}`}>
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-700">
          {message || `Processing ${current} of ${total}`}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">{percentage}%</span>
          {timeRemaining && (
            <span className="text-xs text-gray-500">{timeRemaining}</span>
          )}
        </div>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
        <div 
          className="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
        >
          <div className="h-full bg-white/20 animate-pulse"></div>
        </div>
      </div>
    </div>
  );
} 