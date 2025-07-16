# Vercel Authentication Fix Documentation

## Overview

This document describes the changes made to fix authentication and token refresh issues on Vercel's serverless environment.

## Root Causes Identified

1. **Singleton Pattern Incompatibility**: The original `XeroTokenManager` used a singleton pattern that doesn't work in serverless environments where each function invocation gets a fresh execution context.

2. **Global Redis Connections**: Redis connections were created globally and persisted across requests, causing connection leaks and timeouts in serverless.

3. **In-Memory State**: The fallback `memoryTenantStore` Map was wiped on every cold start, causing inconsistent behavior.

4. **No Connection Cleanup**: Redis connections were never properly closed, leading to connection pool exhaustion.

5. **Race Conditions**: Multiple concurrent Lambda functions could attempt to refresh the same token simultaneously.

## Solutions Implemented

### 1. New Redis Client Architecture (`lib/redis/redisClient.ts`)

- **Request-scoped connections**: Each Redis operation creates and closes its own connection
- **Proper cleanup**: Connections are always closed with `quit()` or `disconnect()`
- **Fallback handling**: `withRedisFallback` function for non-critical operations
- **Distributed locking**: Prevents race conditions during token refresh

### 2. Serverless-Compatible Token Store (`lib/redis/xeroTokenStore.ts`)

- **No singleton pattern**: Static methods that create connections per request
- **No in-memory state**: All state is stored in Redis
- **Proper error handling**: Graceful degradation when Redis is unavailable

### 3. Updated Authentication (`lib/auth.ts`)

- **Distributed lock for token refresh**: Prevents concurrent refresh attempts
- **Dynamic imports**: Avoids edge runtime issues with Redis
- **Better error handling**: Handles lock acquisition failures gracefully

### 4. Backward Compatibility

- The old `xeroTokenManager.ts` is now a compatibility wrapper that delegates to the new `XeroTokenStore`
- Existing code continues to work without changes
- Deprecation warnings guide developers to migrate

## Key Changes

### Before (Problematic for Serverless):
```typescript
// Global Redis instance - BAD for serverless
const redis = new Redis(process.env.REDIS_URL);

// Singleton pattern - BAD for serverless
class XeroTokenManager {
  private static instance: XeroTokenManager;
  private redis: Redis;
  private memoryTenantStore: Map<string, string> = new Map();
}
```

### After (Serverless-Compatible):
```typescript
// Request-scoped connections - GOOD for serverless
export async function withRedis<T>(
  operation: (redis: Redis) => Promise<T>
): Promise<T> {
  const redis = await createRedisConnection();
  try {
    return await operation(redis);
  } finally {
    await redis.quit(); // Always cleanup
  }
}

// Static methods, no singleton - GOOD for serverless
export class XeroTokenStore {
  static async getUserTenants(userId: string) {
    return withRedis(async (redis) => {
      // Operation with automatic cleanup
    });
  }
}
```

## Deployment Instructions

### Local Development

No changes required. The new architecture works seamlessly in local development:

```bash
npm run dev
```

### Vercel Deployment

1. **Ensure Redis URL is set in Vercel:**
   ```
   REDIS_URL=redis://your-redis-instance:6379
   ```

2. **Deploy to Vercel:**
   ```bash
   vercel --prod
   ```

3. **Monitor logs for any Redis connection issues:**
   - Check Vercel Functions logs
   - Look for `[Redis]` prefixed messages
   - Monitor for `[Auth]` token refresh logs

## Testing Checklist

- [ ] User can log in successfully
- [ ] Tokens are refreshed automatically before expiry
- [ ] Tenant selection persists across sessions
- [ ] No authentication errors after idle periods
- [ ] Concurrent requests don't cause token refresh conflicts
- [ ] Redis connection limits are not exceeded
- [ ] Application works when Redis is temporarily unavailable

## Migration Guide for Developers

### Old Code:
```typescript
import { xeroTokenManager } from '@/lib/xeroTokenManager';

const tenants = await xeroTokenManager.getUserTenants(userId);
```

### New Code (Recommended):
```typescript
import { XeroTokenStore } from '@/lib/redis/xeroTokenStore';

const tenants = await XeroTokenStore.getUserTenants(userId);
```

The old import still works but will show deprecation warnings.

## Troubleshooting

### Common Issues:

1. **"Failed to connect to Redis"**
   - Check `REDIS_URL` environment variable
   - Ensure Redis instance is accessible from Vercel

2. **"Failed to acquire lock for token-refresh"**
   - Normal behavior when multiple requests trigger refresh
   - The request will use the existing token

3. **Tenant selection not persisting**
   - Check Redis connectivity
   - Verify `REDIS_URL` is correctly set in Vercel

### Debug Mode

Enable detailed logging by setting:
```
NODE_ENV=development
```

This will show detailed Redis connection and operation logs.

## Performance Considerations

1. **Connection Overhead**: Each request creates its own Redis connection. This is necessary for serverless but adds ~5-10ms overhead.

2. **Distributed Locking**: Token refresh uses distributed locks which add ~10-20ms when contention occurs.

3. **Fallback Behavior**: When Redis is down, the app continues to work with degraded functionality (no tenant persistence).

## Security Notes

- Tokens are stored with appropriate TTLs matching their expiry
- Distributed locks prevent token refresh spam
- All Redis keys are namespaced by user ID
- Sensitive data is never logged

## Future Improvements

1. Consider using Vercel KV (managed Redis) for better serverless integration
2. Implement connection pooling for high-traffic scenarios
3. Add metrics for monitoring Redis connection health
4. Consider edge-compatible storage for middleware