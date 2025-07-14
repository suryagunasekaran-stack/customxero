# Logger Usage in Next.js

Due to Next.js running code in both server and client environments, we provide different logger implementations:

## Import Guidelines

### 1. **Server Components & API Routes** (Recommended)
```typescript
// Use the server-specific logger for full functionality
import { logger, createLogger } from '@/lib/logger/server';

// This ensures you get:
// - Full Pino functionality
// - Async context tracking
// - File/transport logging
// - Process handlers
```

### 2. **Client Components**
```typescript
// Use the client-safe logger
import { logger, createLogger } from '@/lib/logger/client';

// This provides:
// - Console-based logging
// - Same API as server logger
// - No Node.js dependencies
// - Reduced bundle size
```

### 3. **Shared Code** (Use with caution)
```typescript
// Import from main logger file
import { logger, createLogger } from '@/lib/logger';

// This works in both environments but:
// - May cause build warnings about Node.js modules
// - Some features (like async context) won't work on client
// - Better to be explicit about server vs client
```

## Examples

### Server Component
```typescript
// app/api/users/route.ts
import { logger } from '@/lib/logger/server';

export async function GET() {
  logger.info('Fetching users');
  // Full Pino functionality available
}
```

### Client Component
```typescript
'use client';
import { logger } from '@/lib/logger/client';

export function UserList() {
  useEffect(() => {
    logger.info('UserList component mounted');
    // Logs to browser console
  }, []);
}
```

### Middleware
```typescript
// middleware.ts
import { createLoggerMiddleware } from '@/lib/logger/server';

// Middleware always runs on server
```

## Environment Detection

If you need to conditionally use different loggers:

```typescript
const logger = typeof window === 'undefined' 
  ? require('@/lib/logger/server').logger
  : require('@/lib/logger/client').logger;
```

## Best Practices

1. **Be explicit**: Import from `/server` or `/client` based on where code runs
2. **Avoid dynamic imports in components**: Can cause hydration issues
3. **Use server logger for**: API routes, middleware, server components, background jobs
4. **Use client logger for**: Client components, browser-only code
5. **Never log sensitive data on client**: Client logs are visible to users