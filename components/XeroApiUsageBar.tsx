'use client';

import React, { useState, useEffect } from 'react';
import { useXeroApiUsage } from '../contexts/XeroApiUsageContext';
import { ClockIcon, CloudIcon, ChartBarIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { ExclamationTriangleIcon } from '@heroicons/react/24/solid';

const XeroApiUsageBar = () => {
  const { usage, refreshUsage, checkTenantChange } = useXeroApiUsage();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [timeUntilReset, setTimeUntilReset] = useState('');

  // Calculate percentages
  const dailyUsagePercentage = (usage.usedToday / usage.dailyLimit) * 100;
  const minuteUsagePercentage = (usage.usedThisMinute / usage.minuteLimit) * 100;

  // Determine status colors based on usage
  const getDailyStatusColor = () => {
    if (dailyUsagePercentage >= 90) return 'bg-red-500';
    if (dailyUsagePercentage >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getMinuteStatusColor = () => {
    if (minuteUsagePercentage >= 90) return 'bg-red-500';
    if (minuteUsagePercentage >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getDailyTextColor = () => {
    if (dailyUsagePercentage >= 90) return 'text-red-600';
    if (dailyUsagePercentage >= 70) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getMinuteTextColor = () => {
    if (minuteUsagePercentage >= 90) return 'text-red-600';
    if (minuteUsagePercentage >= 70) return 'text-yellow-600';
    return 'text-green-600';
  };

  // Update countdown timer
  useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      const resetTime = new Date(usage.resetTime);
      const timeDiff = resetTime.getTime() - now.getTime();

      if (timeDiff > 0) {
        const hours = Math.floor(timeDiff / (1000 * 60 * 60));
        const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
        setTimeUntilReset(`${hours}h ${minutes}m`);
      } else {
        setTimeUntilReset('Resetting...');
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [usage.resetTime]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Check for tenant changes first, then refresh usage
      await checkTenantChange();
      await refreshUsage();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <CloudIcon className="h-5 w-5 text-blue-600" />
          <h3 className="text-sm font-semibold text-gray-900">Xero API Usage</h3>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-1 text-gray-400 hover:text-gray-600 transition-colors duration-200 disabled:opacity-50"
          title="Refresh usage data"
        >
          <ArrowPathIcon className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Daily Usage */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <ChartBarIcon className="h-4 w-4 text-gray-500" />
            <span className="text-xs font-medium text-gray-700">Daily Limit</span>
            {dailyUsagePercentage >= 90 && (
              <ExclamationTriangleIcon className="h-4 w-4 text-red-500" />
            )}
          </div>
          <div className="text-right">
            <span className={`text-xs font-bold ${getDailyTextColor()}`}>
              {usage.remainingToday.toLocaleString()}
            </span>
            <span className="text-xs text-gray-500 ml-1">/ {usage.dailyLimit.toLocaleString()}</span>
          </div>
        </div>
        
        {/* Daily Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${getDailyStatusColor()}`}
            style={{ width: `${Math.min(dailyUsagePercentage, 100)}%` }}
          />
        </div>
        
        <div className="flex justify-between items-center mt-1">
          <span className="text-xs text-gray-500">
            {usage.usedToday.toLocaleString()} used ({dailyUsagePercentage.toFixed(1)}%)
          </span>
          <div className="flex items-center space-x-1">
            <ClockIcon className="h-3 w-3 text-gray-400" />
            <span className="text-xs text-gray-500">
              Resets in {timeUntilReset}
            </span>
          </div>
        </div>
      </div>

      {/* Minute Usage */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <ClockIcon className="h-4 w-4 text-gray-500" />
            <span className="text-xs font-medium text-gray-700">Per Minute</span>
            {minuteUsagePercentage >= 90 && (
              <ExclamationTriangleIcon className="h-4 w-4 text-red-500" />
            )}
          </div>
          <div className="text-right">
            <span className={`text-xs font-bold ${getMinuteTextColor()}`}>
              {usage.remainingThisMinute}
            </span>
            <span className="text-xs text-gray-500 ml-1">/ {usage.minuteLimit}</span>
          </div>
        </div>
        
        {/* Minute Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-1.5 rounded-full transition-all duration-300 ${getMinuteStatusColor()}`}
            style={{ width: `${Math.min(minuteUsagePercentage, 100)}%` }}
          />
        </div>
        
        <div className="flex justify-between items-center mt-1">
          <span className="text-xs text-gray-500">
            {usage.usedThisMinute} used ({minuteUsagePercentage.toFixed(1)}%)
          </span>
          <span className="text-xs text-gray-400">
            Last updated: {usage.lastUpdated.toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Warning Messages */}
      {dailyUsagePercentage >= 90 && (
        <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-center space-x-2">
            <ExclamationTriangleIcon className="h-4 w-4 text-red-500" />
            <span className="text-xs text-red-700 font-medium">
              Daily limit nearly reached! {usage.remainingToday} calls remaining.
            </span>
          </div>
        </div>
      )}
      
      {minuteUsagePercentage >= 90 && (
        <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
          <div className="flex items-center space-x-2">
            <ExclamationTriangleIcon className="h-4 w-4 text-yellow-500" />
            <span className="text-xs text-yellow-700 font-medium">
              Minute limit nearly reached! Wait for the next minute.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default XeroApiUsageBar; 