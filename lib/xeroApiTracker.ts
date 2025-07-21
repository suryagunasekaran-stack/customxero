import { withRedis, withRedisFallback } from './redis/redisClient';

const XERO_API_USAGE_KEY_PREFIX = 'xero_api_usage';
const XERO_DAILY_LIMIT = 5000;
const XERO_MINUTE_LIMIT = 60;
const XERO_MINUTE_SAFETY_BUFFER = 5; // Reserve 5 calls per minute as safety
const XERO_DAILY_SAFETY_BUFFER = 100; // Reserve 100 calls per day as safety

/**
 * Generates tenant-specific Redis key for API usage tracking
 * @param {string} tenantId - Xero tenant ID
 * @returns {string} Formatted Redis key for storing usage data
 * @throws {Error} When tenantId is invalid or empty
 */
function getUsageKey(tenantId: string): string {
  if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
    throw new Error('Invalid tenantId provided to getUsageKey');
  }
  return `${XERO_API_USAGE_KEY_PREFIX}:${tenantId.trim()}`;
}

export interface XeroApiUsage {
  daily: {
    count: number;
    resetAt: Date;
  };
  perMinute: {
    count: number;
    resetAt: Date;
  };
}

/**
 * Tracks Xero API calls and enforces rate limits (5000/day, 60/minute)
 * Now uses serverless-compatible Redis connections
 * @param {string} tenantId - Xero tenant ID for tracking
 * @returns {Promise<void>} Resolves if within limits
 * @throws {Error} When rate limit is exceeded or Redis operation fails
 */
export async function trackXeroApiCall(tenantId: string): Promise<void> {
  if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
    console.warn('trackXeroApiCall called with invalid tenantId:', tenantId);
    throw new Error('Invalid tenantId provided');
  }

  const key = getUsageKey(tenantId);
  const now = new Date();
  const todayKey = `${key}:daily:${now.toISOString().split('T')[0]}`;
  const minuteKey = `${key}:minute:${now.toISOString().slice(0, 16)}`;

  await withRedis(async (redis) => {
    // Use pipeline for atomic operations
    const pipeline = redis.pipeline();
    
    // Increment daily counter with 24-hour expiry
    pipeline.incr(todayKey);
    pipeline.expire(todayKey, 86400); // 24 hours
    
    // Increment minute counter with 60-second expiry
    pipeline.incr(minuteKey);
    pipeline.expire(minuteKey, 60);
    
    const results = await pipeline.exec();
    
    if (!results || results.some(r => r[0] !== null)) {
      throw new Error('Failed to track API usage');
    }
    
    const dailyCount = results[0][1] as number;
    const minuteCount = results[2][1] as number;
    
    // Check rate limits
    if (dailyCount > XERO_DAILY_LIMIT) {
      throw new Error(`Xero API daily limit exceeded (${XERO_DAILY_LIMIT}/day)`);
    }
    
    if (minuteCount > XERO_MINUTE_LIMIT) {
      throw new Error(`Xero API rate limit exceeded (${XERO_MINUTE_LIMIT}/minute)`);
    }
  });
}

/**
 * Retrieves current API usage statistics for a tenant
 * Useful for monitoring and displaying usage to users
 * @param {string} tenantId - Xero tenant ID
 * @returns {Promise<XeroApiUsage>} Usage statistics with counts and reset times
 */
export async function getXeroApiUsage(tenantId: string): Promise<XeroApiUsage> {
  if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
    console.warn('getXeroApiUsage called with invalid tenantId:', tenantId);
    return {
      daily: { count: 0, resetAt: new Date() },
      perMinute: { count: 0, resetAt: new Date() }
    };
  }

  const key = getUsageKey(tenantId);
  const now = new Date();
  const todayKey = `${key}:daily:${now.toISOString().split('T')[0]}`;
  const minuteKey = `${key}:minute:${now.toISOString().slice(0, 16)}`;

  return withRedisFallback(async (redis) => {
    const [dailyCount, minuteCount] = await Promise.all([
      redis.get(todayKey),
      redis.get(minuteKey)
    ]);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const endOfMinute = new Date();
    endOfMinute.setSeconds(59, 999);

    return {
      daily: {
        count: parseInt(dailyCount || '0', 10),
        resetAt: endOfDay
      },
      perMinute: {
        count: parseInt(minuteCount || '0', 10),
        resetAt: endOfMinute
      }
    };
  }, {
    daily: { count: 0, resetAt: new Date() },
    perMinute: { count: 0, resetAt: new Date() }
  });
}

/**
 * Checks if API call would exceed rate limits without incrementing
 * Useful for pre-flight checks before making expensive operations
 * @param {string} tenantId - Xero tenant ID
 * @returns {Promise<boolean>} True if call would be within limits
 */
export async function checkXeroApiLimit(tenantId: string): Promise<boolean> {
  if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
    console.warn('checkXeroApiLimit called with invalid tenantId:', tenantId);
    return true; // Allow if we can't check
  }

  try {
    const usage = await getXeroApiUsage(tenantId);
    return usage.daily.count < XERO_DAILY_LIMIT && usage.perMinute.count < XERO_MINUTE_LIMIT;
  } catch (error) {
    console.error('Error checking API limits:', error);
    return true; // Allow if Redis is down
  }
}

/**
 * Waits if necessary before making an API call to respect rate limits
 * This should be called BEFORE making any Xero API request
 * @param {string} tenantId - Xero tenant ID
 * @returns {Promise<void>} Resolves when it's safe to make the API call
 * @throws {Error} If rate limits cannot be checked or daily limit is exceeded
 */
export async function waitForXeroRateLimit(tenantId: string): Promise<void> {
  if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
    throw new Error('Invalid tenantId provided to waitForXeroRateLimit');
  }

  const usage = await getXeroApiUsage(tenantId);
  
  // Check daily limit with safety buffer
  if (usage.daily.count >= (XERO_DAILY_LIMIT - XERO_DAILY_SAFETY_BUFFER)) {
    throw new Error(`Xero API daily limit approaching (${usage.daily.count}/${XERO_DAILY_LIMIT}). Stopping to preserve quota.`);
  }
  
  // If we're approaching the minute limit, wait
  if (usage.perMinute.count >= (XERO_MINUTE_LIMIT - XERO_MINUTE_SAFETY_BUFFER)) {
    const waitTime = Math.max(0, usage.perMinute.resetAt.getTime() - Date.now());
    
    if (waitTime > 0) {
      console.log(`[Xero Rate Limit] Approaching minute limit (${usage.perMinute.count}/${XERO_MINUTE_LIMIT}), waiting ${Math.ceil(waitTime / 1000)}s`);
      await new Promise(resolve => setTimeout(resolve, waitTime + 1000)); // Add 1s buffer
    }
  }
  
  // Add a small delay between calls to avoid bursts
  const delayMs = usage.perMinute.count > 40 ? 500 : usage.perMinute.count > 20 ? 200 : 100;
  await new Promise(resolve => setTimeout(resolve, delayMs));
}

/**
 * Updates rate limit tracking from Xero API response headers
 * @param {Headers} headers - Response headers from Xero API
 * @param {string} tenantId - Xero tenant ID
 */
export async function updateXeroRateLimitFromHeaders(headers: Headers, tenantId: string): Promise<void> {
  // Extract rate limit info from headers if available
  const xeroMinRemaining = headers.get('x-minlimit-remaining');
  const xeroDayRemaining = headers.get('x-daylimit-remaining');
  
  if (xeroMinRemaining !== null || xeroDayRemaining !== null) {
    console.log(`[Xero Rate Limit] Headers - Minute: ${xeroMinRemaining || 'N/A'}, Day: ${xeroDayRemaining || 'N/A'}`);
    
    // If we're getting low on limits, log a warning
    if (xeroMinRemaining && parseInt(xeroMinRemaining) <= 10) {
      console.warn(`[Xero Rate Limit] WARNING: Only ${xeroMinRemaining} minute calls remaining!`);
    }
    if (xeroDayRemaining && parseInt(xeroDayRemaining) <= 200) {
      console.warn(`[Xero Rate Limit] WARNING: Only ${xeroDayRemaining} daily calls remaining!`);
    }
  }
}