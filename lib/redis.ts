/**
 * Main Redis module export
 * Re-exports commonly used Redis functions for easy access
 */

export {
  createRedisConnection,
  createRedisConnection as getRedisConnection, // Alias for compatibility
  withRedis,
  withRedisFallback,
  withDistributedLock,
  withDistributedLockRetry
} from './redis/redisClient';

export { parseRedisUrl } from './redis/parseRedisUrl';