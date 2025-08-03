import Redis from 'ioredis';
import { parseRedisUrl } from './parseRedisUrl';

/**
 * Redis connection configuration optimized for serverless environments
 * Handles both local development and Vercel deployment scenarios
 */
const REDIS_CONFIG = {
  maxRetriesPerRequest: 3,
  enableOfflineQueue: true,  // Changed to true to handle connection issues better
  connectTimeout: 5000,
  commandTimeout: 5000,
  lazyConnect: true,
  retryStrategy: (times: number) => {
    if (times > 3) return null;
    return Math.min(times * 100, 3000);
  },
  reconnectOnError: (err: Error) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      return true;
    }
    return false;
  },
};

/**
 * Creates a new Redis connection for serverless environments
 * Each request gets its own connection that must be properly closed
 * @returns {Promise<Redis>} Connected Redis client instance
 */
export async function createRedisConnection(): Promise<Redis> {
  const redisUrl = process.env.REDIS_URL;
  
  let redis: Redis;
  
  try {
    // Parse Redis URL to handle various formats safely
    const connectionOptions = parseRedisUrl(redisUrl);
    
    // Create Redis instance with parsed options
    redis = new Redis({
      ...connectionOptions,
      ...REDIS_CONFIG,
      // Add event handlers to catch connection issues
      connectionName: 'xero-auth',
      family: 4, // Force IPv4 to avoid IPv6 issues
    });
    
    // Add error handler before connecting
    redis.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message);
    });
    
    // Connect explicitly with timeout
    await Promise.race([
      redis.connect(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Redis connection timeout')), 5000)
      )
    ]);
    
    // Verify connection with ping
    await redis.ping();
    
    return redis;
  } catch (error) {
    console.error('[Redis] Connection failed:', error);
    // Close the connection attempt if it exists
    if (redis!) {
      try {
        redis.disconnect();
      } catch (disconnectError) {
        // Ignore disconnect errors
      }
    }
    throw new Error('Failed to connect to Redis');
  }
}

/**
 * Executes a Redis operation with automatic connection management
 * Ensures connections are properly closed after use (critical for serverless)
 * @template T
 * @param {(redis: Redis) => Promise<T>} operation - The Redis operation to execute
 * @returns {Promise<T>} Result of the operation
 */
export async function withRedis<T>(
  operation: (redis: Redis) => Promise<T>
): Promise<T> {
  let redis: Redis | null = null;
  
  try {
    redis = await createRedisConnection();
    return await operation(redis);
  } catch (error) {
    // Log more details about the error
    if (error instanceof Error) {
      console.error('[Redis] Operation failed:', error.message);
      // Check for specific ioredis errors
      if (error.message.includes('charCodeAt')) {
        console.error('[Redis] Possible connection string issue. Check REDIS_URL format.');
      }
    } else {
      console.error('[Redis] Operation failed:', error);
    }
    throw error;
  } finally {
    // Always close the connection to prevent connection leaks in serverless
    if (redis) {
      try {
        await redis.quit();
      } catch (quitError) {
        console.warn('[Redis] Failed to quit gracefully:', quitError);
        try {
          // Force disconnect if quit fails
          redis.disconnect();
        } catch (disconnectError) {
          // Ignore disconnect errors
          console.warn('[Redis] Failed to disconnect:', disconnectError);
        }
      }
    }
  }
}

/**
 * Executes a Redis operation with fallback value on failure
 * Useful for non-critical operations that should not block the application
 * @template T
 * @param {(redis: Redis) => Promise<T>} operation - The Redis operation to execute
 * @param {T} fallback - Fallback value if operation fails
 * @returns {Promise<T>} Result of operation or fallback value
 */
export async function withRedisFallback<T>(
  operation: (redis: Redis) => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await withRedis(operation);
  } catch (error) {
    console.warn('[Redis] Operation failed, using fallback:', error);
    return fallback;
  }
}

/**
 * Distributed lock implementation for serverless environments
 * Prevents race conditions during concurrent operations like token refresh
 * @param {string} key - Lock key
 * @param {number} ttl - Lock TTL in seconds
 * @param {() => Promise<T>} operation - Operation to execute with lock
 * @returns {Promise<T>} Result of the operation
 */
export async function withDistributedLock<T>(
  key: string,
  ttl: number,
  operation: () => Promise<T>
): Promise<T> {
  const lockKey = `lock:${key}`;
  const lockValue = `${Date.now()}-${Math.random()}`;
  
  return withRedis(async (redis) => {
    // Try to acquire lock
    const acquired = await redis.set(lockKey, lockValue, 'EX', ttl, 'NX');
    
    if (!acquired) {
      // Lock is held by another process
      throw new Error(`Failed to acquire lock for ${key}`);
    }
    
    try {
      // Execute the operation
      return await operation();
    } finally {
      // Release lock only if we still own it
      const currentValue = await redis.get(lockKey);
      if (currentValue === lockValue) {
        await redis.del(lockKey);
      }
    }
  });
}

/**
 * Distributed lock with retry logic
 * Waits and retries if lock is not immediately available
 * @param {string} key - Lock key
 * @param {number} ttl - Lock TTL in seconds
 * @param {() => Promise<T>} operation - Operation to execute with lock
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} retryDelay - Delay between retries in ms
 * @returns {Promise<T>} Result of the operation
 */
export async function withDistributedLockRetry<T>(
  key: string,
  ttl: number,
  operation: () => Promise<T>,
  maxRetries: number = 3,
  retryDelay: number = 500
): Promise<T> {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await withDistributedLock(key, ttl, operation);
    } catch (error) {
      if (i === maxRetries || !(error instanceof Error) || !error.message.includes('Failed to acquire lock')) {
        throw error;
      }
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  throw new Error(`Failed to acquire lock after ${maxRetries} retries`);
}