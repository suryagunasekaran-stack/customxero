'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';

export interface XeroApiUsage {
  dailyLimit: number;
  usedToday: number;
  remainingToday: number;
  minuteLimit: number;
  usedThisMinute: number;
  remainingThisMinute: number;
  lastUpdated: Date;
  resetTime: Date; // When the daily limit resets (midnight UTC)
}

interface XeroApiUsageContextType {
  usage: XeroApiUsage;
  incrementUsage: () => void;
  refreshUsage: () => Promise<void>;
  checkTenantChange: () => Promise<void>;
}

const XeroApiUsageContext = createContext<XeroApiUsageContextType | undefined>(undefined);

// Xero API limits according to their documentation
const XERO_DAILY_LIMIT = 5000;
const XERO_MINUTE_LIMIT = 60;

export const XeroApiUsageProvider = ({ children }: { children: ReactNode }) => {
  const [usage, setUsage] = useState<XeroApiUsage>(() => {
    // Initialize with default values
    const now = new Date();
    const resetTime = new Date();
    resetTime.setUTCHours(24, 0, 0, 0); // Next midnight UTC
    
    return {
      dailyLimit: XERO_DAILY_LIMIT,
      usedToday: 0,
      remainingToday: XERO_DAILY_LIMIT,
      minuteLimit: XERO_MINUTE_LIMIT,
      usedThisMinute: 0,
      remainingThisMinute: XERO_MINUTE_LIMIT,
      lastUpdated: now,
      resetTime: resetTime
    };
  });
  
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);

  // Load usage from localStorage on mount (before server data is available)
  useEffect(() => {
    const savedUsage = localStorage.getItem('xero-api-usage');
    if (savedUsage) {
      try {
        const parsed = JSON.parse(savedUsage);
        const now = new Date();
        
        // Check if we've crossed midnight UTC (daily reset)
        const lastDate = new Date(parsed.lastUpdated);
        const hasResetDaily = now.getUTCDate() !== lastDate.getUTCDate() || 
                             now.getUTCMonth() !== lastDate.getUTCMonth() || 
                             now.getUTCFullYear() !== lastDate.getUTCFullYear();
        
        // Check if we've crossed a minute boundary (minute reset)
        const hasResetMinute = Math.floor(now.getTime() / 60000) !== Math.floor(lastDate.getTime() / 60000);
        
        if (hasResetDaily) {
          // Reset daily counters
          const resetTime = new Date();
          resetTime.setUTCHours(24, 0, 0, 0);
          
          setUsage({
            ...parsed,
            usedToday: 0,
            remainingToday: XERO_DAILY_LIMIT,
            usedThisMinute: hasResetMinute ? 0 : parsed.usedThisMinute,
            remainingThisMinute: hasResetMinute ? XERO_MINUTE_LIMIT : parsed.remainingThisMinute,
            lastUpdated: now,
            resetTime: resetTime
          });
        } else if (hasResetMinute) {
          // Reset only minute counters
          setUsage({
            ...parsed,
            usedThisMinute: 0,
            remainingThisMinute: XERO_MINUTE_LIMIT,
            lastUpdated: now
          });
        } else {
          // Just update the parsed dates
          setUsage({
            ...parsed,
            lastUpdated: new Date(parsed.lastUpdated),
            resetTime: new Date(parsed.resetTime)
          });
        }
      } catch (error) {
        console.error('Failed to parse saved Xero API usage:', error);
      }
    }
  }, []);

  // Save usage to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('xero-api-usage', JSON.stringify(usage));
  }, [usage]);

  const incrementUsage = useCallback(() => {
    setUsage(prevUsage => {
      const now = new Date();
      
      // Check for resets
      const hasResetDaily = now.getUTCDate() !== prevUsage.lastUpdated.getUTCDate() || 
                           now.getUTCMonth() !== prevUsage.lastUpdated.getUTCMonth() || 
                           now.getUTCFullYear() !== prevUsage.lastUpdated.getUTCFullYear();
      
      const hasResetMinute = Math.floor(now.getTime() / 60000) !== Math.floor(prevUsage.lastUpdated.getTime() / 60000);
      
      if (hasResetDaily) {
        const resetTime = new Date();
        resetTime.setUTCHours(24, 0, 0, 0);
        
        return {
          ...prevUsage,
          usedToday: 1,
          remainingToday: XERO_DAILY_LIMIT - 1,
          usedThisMinute: 1,
          remainingThisMinute: XERO_MINUTE_LIMIT - 1,
          lastUpdated: now,
          resetTime: resetTime
        };
      } else if (hasResetMinute) {
        return {
          ...prevUsage,
          usedToday: prevUsage.usedToday + 1,
          remainingToday: Math.max(0, prevUsage.remainingToday - 1),
          usedThisMinute: 1,
          remainingThisMinute: XERO_MINUTE_LIMIT - 1,
          lastUpdated: now
        };
      } else {
        return {
          ...prevUsage,
          usedToday: prevUsage.usedToday + 1,
          remainingToday: Math.max(0, prevUsage.remainingToday - 1),
          usedThisMinute: prevUsage.usedThisMinute + 1,
          remainingThisMinute: Math.max(0, prevUsage.remainingThisMinute - 1),
          lastUpdated: now
        };
      }
    });
  }, []);

  const refreshUsage = useCallback(async () => {
    try {
      const response = await fetch('/api/xero/api-usage');
      if (response.ok) {
        const serverUsage = await response.json();
        
        // Convert ISO strings back to Date objects
        setUsage({
          ...serverUsage,
          lastUpdated: new Date(serverUsage.lastUpdated),
          resetTime: new Date(serverUsage.resetTime)
        });
      }
    } catch (error) {
      console.error('Failed to fetch server-side usage data:', error);
      // Fallback to local timestamp update
      const now = new Date();
      
      setUsage(prevUsage => {
        const hasResetDaily = now.getUTCDate() !== prevUsage.lastUpdated.getUTCDate() || 
                             now.getUTCMonth() !== prevUsage.lastUpdated.getUTCMonth() || 
                             now.getUTCFullYear() !== prevUsage.lastUpdated.getUTCFullYear();
        
        const hasResetMinute = Math.floor(now.getTime() / 60000) !== Math.floor(prevUsage.lastUpdated.getTime() / 60000);
        
        if (hasResetDaily) {
          const resetTime = new Date();
          resetTime.setUTCHours(24, 0, 0, 0);
          
          return {
            ...prevUsage,
            usedToday: 0,
            remainingToday: XERO_DAILY_LIMIT,
            usedThisMinute: hasResetMinute ? 0 : prevUsage.usedThisMinute,
            remainingThisMinute: hasResetMinute ? XERO_MINUTE_LIMIT : prevUsage.remainingThisMinute,
            lastUpdated: now,
            resetTime: resetTime
          };
        } else if (hasResetMinute) {
          return {
            ...prevUsage,
            usedThisMinute: 0,
            remainingThisMinute: XERO_MINUTE_LIMIT,
            lastUpdated: now
          };
        } else {
          return {
            ...prevUsage,
            lastUpdated: now
          };
        }
      });
    }
  }, []);

  // Check for tenant changes only when explicitly triggered (not automatically polling)
  const checkTenantChange = useCallback(async () => {
    try {
      const response = await fetch('/api/organisation');
      if (response.ok) {
        const data = await response.json();
        if (data.organisations && data.organisations.length > 0) {
          const newTenantId = data.organisations[0].organisationID;
          if (currentTenantId === null) {
            // First time setting tenant ID
            setCurrentTenantId(newTenantId);
          } else if (currentTenantId !== newTenantId) {
            // Tenant changed, refresh usage
            console.log(`[Xero API Usage] Tenant changed from ${currentTenantId} to ${newTenantId}, refreshing usage`);
            setCurrentTenantId(newTenantId);
            await refreshUsage();
          }
        }
      }
    } catch (error) {
      console.error('Failed to check tenant change:', error);
    }
  }, [currentTenantId, refreshUsage]);

  // Only check tenant once on mount, not continuously
  useEffect(() => {
    checkTenantChange();
  }, [checkTenantChange]);

  // Load server-side usage data after mounting
  useEffect(() => {
    refreshUsage().catch(error => {
      console.error('Failed to refresh usage on mount:', error);
    });
  }, [refreshUsage]);

  return (
    <XeroApiUsageContext.Provider value={{ usage, incrementUsage, refreshUsage, checkTenantChange }}>
      {children}
    </XeroApiUsageContext.Provider>
  );
};

export const useXeroApiUsage = () => {
  const context = useContext(XeroApiUsageContext);
  if (context === undefined) {
    throw new Error('useXeroApiUsage must be used within a XeroApiUsageProvider');
  }
  return context;
}; 