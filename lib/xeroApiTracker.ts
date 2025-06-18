import Redis from 'ioredis';

// Initialize Redis client for server-side API tracking with proper error handling
const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: 3,
  enableOfflineQueue: false,
  connectTimeout: 10000,
  commandTimeout: 5000,
  lazyConnect: true,
});

// Add error handling for Redis connection
redis.on('error', (err) => {
  console.error('Redis API Tracker connection error:', err.message);
});

redis.on('connect', () => {
  console.log('Redis API Tracker connected successfully');
});

const XERO_API_USAGE_KEY_PREFIX = 'xero_api_usage';
const XERO_DAILY_LIMIT = 5000;
const XERO_MINUTE_LIMIT = 60;

// Helper function to generate tenant-specific Redis key with validation
function getUsageKey(tenantId: string): string {
  if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
    throw new Error('Invalid tenantId provided to getUsageKey');
  }
  return `${XERO_API_USAGE_KEY_PREFIX}:${tenantId.trim()}`;
}

// Helper function to check if Redis is ready
async function isRedisReady(): Promise<boolean> {
  try {
    return redis.status === 'ready' || redis.status === 'connect';
  } catch (error) {
    return false;
  }
}

// Helper function to safely execute Redis operations
async function safeRedisOperation<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
  try {
    if (!(await isRedisReady())) {
      console.warn('Redis API Tracker not ready, using fallback value');
      return fallback;
    }
    return await operation();
  } catch (error) {
    console.warn('Redis API Tracker operation failed, using fallback:', (error as Error).message);
    return fallback;
  }
}

export interface XeroApiUsageData {
  dailyLimit: number;
  usedToday: number;
  remainingToday: number;
  minuteLimit: number;
  usedThisMinute: number;
  remainingThisMinute: number;
  lastUpdated: string; // ISO string
  resetTime: string; // ISO string
  lastMinuteReset: string; // ISO string for minute tracking
}

// Server-side function to track API usage from actual Xero response headers
export async function trackXeroApiCallFromHeaders(responseHeaders: Headers, tenantId: string): Promise<void> {
  try {
    // Validate tenantId
    if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
      console.warn('[Xero API Tracker] trackXeroApiCallFromHeaders called with invalid tenantId:', tenantId);
      return;
    }
    
    const now = new Date();
    
    // Parse actual rate limit data from Xero response headers
    // Xero uses X-DayLimit-Remaining and X-MinLimit-Remaining
    const remainingDaily = parseInt(responseHeaders.get('X-DayLimit-Remaining') || '5000');
    const remainingMinute = parseInt(responseHeaders.get('X-MinLimit-Remaining') || '60');
    
    // Use standard limits (5000 daily, 60 per minute)
    const dailyLimit = 5000;
    const minuteLimit = 60;
    
    console.log(`[Xero API Tracker] Found Xero rate limit headers:`);
    console.log(`  X-DayLimit-Remaining: ${responseHeaders.get('X-DayLimit-Remaining')} (parsed: ${remainingDaily})`);
    console.log(`  X-MinLimit-Remaining: ${responseHeaders.get('X-MinLimit-Remaining')} (parsed: ${remainingMinute})`);
    
    // Validate that we got reasonable values
    if (isNaN(remainingDaily) || isNaN(remainingMinute)) {
      console.log('[Xero API Tracker] Invalid header values, falling back to manual tracking');
      throw new Error('Invalid rate limit header values');
    }
    
    // Calculate used calls
    const usedToday = dailyLimit - remainingDaily;
    const usedThisMinute = minuteLimit - remainingMinute;
    
    // Calculate reset time (midnight UTC)
    const resetTime = new Date();
    resetTime.setUTCHours(24, 0, 0, 0);
    
    const usage: XeroApiUsageData = {
      dailyLimit: dailyLimit,
      usedToday: usedToday,
      remainingToday: remainingDaily,
      minuteLimit: minuteLimit,
      usedThisMinute: usedThisMinute,
      remainingThisMinute: remainingMinute,
      lastUpdated: now.toISOString(),
      resetTime: resetTime.toISOString(),
      lastMinuteReset: now.toISOString()
    };
    
    // Save the authoritative usage data from Xero using safe Redis operations
    await safeRedisOperation(async () => {
      await redis.set(getUsageKey(tenantId), JSON.stringify(usage), 'EX', 25 * 60 * 60);
    }, undefined);
    
    console.log(`[Xero API Tracker] API usage from headers - Daily: ${usedToday}/${dailyLimit} (${remainingDaily} remaining), Minute: ${usedThisMinute}/${minuteLimit} (${remainingMinute} remaining)`);
  } catch (error) {
    console.error('[Xero API Tracker] Failed to track API call from headers:', error);
    // Fallback to manual tracking
    await trackXeroApiCallManual(tenantId);
  }
}

// Fallback manual tracking function (for when headers aren't available)
export async function trackXeroApiCallManual(tenantId: string): Promise<void> {
  try {
    // Validate tenantId
    if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
      console.warn('[Xero API Tracker] trackXeroApiCallManual called with invalid tenantId:', tenantId);
      return;
    }
    
    const now = new Date();
    const currentMinute = Math.floor(now.getTime() / 60000);
    
    // Get current usage data using safe Redis operations
    const existingData = await safeRedisOperation(async () => {
      return await redis.get(getUsageKey(tenantId));
    }, null);
    let usage: XeroApiUsageData;
    
    if (existingData) {
      usage = JSON.parse(existingData);
      
      // Check if we need to reset daily counters (new day)
      const lastDate = new Date(usage.lastUpdated);
      const hasResetDaily = now.getUTCDate() !== lastDate.getUTCDate() || 
                           now.getUTCMonth() !== lastDate.getUTCMonth() || 
                           now.getUTCFullYear() !== lastDate.getUTCFullYear();
      
      // Check if we need to reset minute counters
      const lastMinute = Math.floor(new Date(usage.lastMinuteReset).getTime() / 60000);
      const hasResetMinute = currentMinute !== lastMinute;
      
      if (hasResetDaily) {
        // Reset daily and minute counters
        const resetTime = new Date();
        resetTime.setUTCHours(24, 0, 0, 0);
        
        usage = {
          dailyLimit: XERO_DAILY_LIMIT,
          usedToday: 1,
          remainingToday: XERO_DAILY_LIMIT - 1,
          minuteLimit: XERO_MINUTE_LIMIT,
          usedThisMinute: 1,
          remainingThisMinute: XERO_MINUTE_LIMIT - 1,
          lastUpdated: now.toISOString(),
          resetTime: resetTime.toISOString(),
          lastMinuteReset: now.toISOString()
        };
      } else if (hasResetMinute) {
        // Reset only minute counters
        usage = {
          ...usage,
          usedToday: usage.usedToday + 1,
          remainingToday: Math.max(0, usage.remainingToday - 1),
          usedThisMinute: 1,
          remainingThisMinute: XERO_MINUTE_LIMIT - 1,
          lastUpdated: now.toISOString(),
          lastMinuteReset: now.toISOString()
        };
      } else {
        // Increment both daily and minute counters
        usage = {
          ...usage,
          usedToday: usage.usedToday + 1,
          remainingToday: Math.max(0, usage.remainingToday - 1),
          usedThisMinute: usage.usedThisMinute + 1,
          remainingThisMinute: Math.max(0, usage.remainingThisMinute - 1),
          lastUpdated: now.toISOString()
        };
      }
    } else {
      // Initialize usage data
      const resetTime = new Date();
      resetTime.setUTCHours(24, 0, 0, 0);
      
      usage = {
        dailyLimit: XERO_DAILY_LIMIT,
        usedToday: 1,
        remainingToday: XERO_DAILY_LIMIT - 1,
        minuteLimit: XERO_MINUTE_LIMIT,
        usedThisMinute: 1,
        remainingThisMinute: XERO_MINUTE_LIMIT - 1,
        lastUpdated: now.toISOString(),
        resetTime: resetTime.toISOString(),
        lastMinuteReset: now.toISOString()
      };
    }
    
    // Save updated usage data with TTL of 25 hours (to ensure cleanup) using safe Redis operations
    await safeRedisOperation(async () => {
      await redis.set(getUsageKey(tenantId), JSON.stringify(usage), 'EX', 25 * 60 * 60);
    }, undefined);
    
    console.log(`[Xero API Tracker] Manual API call tracked for tenant ${tenantId}. Daily: ${usage.usedToday}/${usage.dailyLimit}, Minute: ${usage.usedThisMinute}/${usage.minuteLimit}`);
  } catch (error) {
    console.error('[Xero API Tracker] Failed to track API call manually:', error);
    // Don't throw error to avoid breaking the main API call
  }
}

// Convenience function that tries headers first, falls back to manual
export async function trackXeroApiCall(responseHeaders: Headers | undefined, tenantId: string): Promise<void> {
  if (responseHeaders) {
    await trackXeroApiCallFromHeaders(responseHeaders, tenantId);
  } else {
    await trackXeroApiCallManual(tenantId);
  }
}

// Server-side function to get current usage
export async function getXeroApiUsage(tenantId: string): Promise<XeroApiUsageData | null> {
  try {
    // Validate tenantId
    if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
      console.warn('[Xero API Tracker] getXeroApiUsage called with invalid tenantId:', tenantId);
      return null;
    }
    
    const existingData = await safeRedisOperation(async () => {
      return await redis.get(getUsageKey(tenantId));
    }, null);
    if (existingData) {
      const usage = JSON.parse(existingData);
      
      // Check if data needs reset
      const now = new Date();
      const lastDate = new Date(usage.lastUpdated);
      const hasResetDaily = now.getUTCDate() !== lastDate.getUTCDate() || 
                           now.getUTCMonth() !== lastDate.getUTCMonth() || 
                           now.getUTCFullYear() !== lastDate.getUTCFullYear();
      
      const currentMinute = Math.floor(now.getTime() / 60000);
      const lastMinute = Math.floor(new Date(usage.lastMinuteReset).getTime() / 60000);
      const hasResetMinute = currentMinute !== lastMinute;
      
      if (hasResetDaily) {
        // Reset daily counters
        const resetTime = new Date();
        resetTime.setUTCHours(24, 0, 0, 0);
        
        const resetUsage = {
          dailyLimit: XERO_DAILY_LIMIT,
          usedToday: 0,
          remainingToday: XERO_DAILY_LIMIT,
          minuteLimit: XERO_MINUTE_LIMIT,
          usedThisMinute: hasResetMinute ? 0 : usage.usedThisMinute,
          remainingThisMinute: hasResetMinute ? XERO_MINUTE_LIMIT : usage.remainingThisMinute,
          lastUpdated: now.toISOString(),
          resetTime: resetTime.toISOString(),
          lastMinuteReset: hasResetMinute ? now.toISOString() : usage.lastMinuteReset
        };
        
        // Save the reset data using safe Redis operations
        await safeRedisOperation(async () => {
          await redis.set(getUsageKey(tenantId), JSON.stringify(resetUsage), 'EX', 25 * 60 * 60);
        }, undefined);
        return resetUsage;
      } else if (hasResetMinute) {
        // Reset minute counters
        const resetUsage = {
          ...usage,
          usedThisMinute: 0,
          remainingThisMinute: XERO_MINUTE_LIMIT,
          lastUpdated: now.toISOString(),
          lastMinuteReset: now.toISOString()
        };
        
        // Save the reset data using safe Redis operations
        await safeRedisOperation(async () => {
          await redis.set(getUsageKey(tenantId), JSON.stringify(resetUsage), 'EX', 25 * 60 * 60);
        }, undefined);
        return resetUsage;
      }
      
      return usage;
    }
    
    return null;
  } catch (error) {
    console.error('[Xero API Tracker] Failed to get API usage:', error);
    return null;
  }
} 