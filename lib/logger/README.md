# Production-Grade Logger with Pino

A comprehensive logging solution for Node.js applications using Pino, featuring structured JSON logging, async transports, Express middleware integration, and proper error handling.

## Features

- **Structured JSON Logging**: All logs are structured JSON for easy parsing and analysis
- **Multiple Log Levels**: Support for trace, debug, info, warn, error, and fatal levels
- **Pretty Printing**: Beautiful, readable logs in development with pino-pretty
- **Async Logging**: Non-blocking logging in production using pino transports
- **Request ID Tracking**: Automatic request ID generation and propagation
- **Express Integration**: Middleware for automatic request/response logging
- **Child Loggers**: Create contextual loggers with additional metadata
- **Singleton Pattern**: Single logger instance across the application
- **Graceful Shutdown**: Proper handling of process termination
- **Security**: Automatic redaction of sensitive data

## Installation

```bash
npm install pino pino-pretty
```

## Basic Usage

### Import the Logger

```typescript
import { logger, createLogger, info, error, debug } from '@/lib/logger';
```

### Simple Logging

```typescript
// Using the root logger
logger.info('Application started');
logger.error({ err: new Error('Something went wrong') }, 'Error occurred');
logger.debug({ userId: 123 }, 'User logged in');

// Using convenience methods
info('Application started');
error('Error occurred', { err: new Error('Something went wrong') });
debug('User logged in', { userId: 123 });
```

### Create Module-Specific Logger

```typescript
// Create a child logger for a specific module
const moduleLogger = createLogger('UserService', { version: '1.0.0' });

moduleLogger.info('Processing user registration');
moduleLogger.error({ userId: 123 }, 'Failed to create user');
```

## Express Integration

### Basic Setup

```typescript
import express from 'express';
import { createLoggerMiddleware, createErrorLoggerMiddleware } from '@/lib/logger';

const app = express();

// Add request logging middleware
app.use(createLoggerMiddleware({
  ignorePaths: ['/health', '/metrics'],
  logBody: true, // Be careful with sensitive data
}));

// Your routes here
app.get('/api/users', (req, res) => {
  // Logger is automatically attached to request
  req.logger.info('Fetching users');
  res.json({ users: [] });
});

// Add error logging middleware (should be last)
app.use(createErrorLoggerMiddleware());
```

### Advanced Middleware Configuration

```typescript
app.use(createLoggerMiddleware({
  // Custom request ID generator
  genReqId: (req) => req.headers['x-request-id'] || randomUUID(),
  
  // Skip logging for certain requests
  skip: (req, res) => res.statusCode < 400,
  
  // Add custom properties to logs
  customProps: (req, res) => ({
    userId: req.user?.id,
    responseTime: res.locals.responseTime,
  }),
  
  // Custom messages
  successMessage: 'Request processed successfully',
  errorMessage: 'Request processing failed',
}));
```

## Request Context

The logger automatically tracks request context using AsyncLocalStorage:

```typescript
// In middleware or route handler
app.get('/api/orders/:id', async (req, res) => {
  // This will automatically include the request ID
  info('Processing order request', { orderId: req.params.id });
  
  // Even in nested async operations
  await processOrder(req.params.id);
  
  res.json({ success: true });
});

async function processOrder(orderId: string) {
  // Request ID is automatically included
  debug('Fetching order from database', { orderId });
  
  // Simulate async operation
  await new Promise(resolve => setTimeout(resolve, 100));
  
  info('Order processed successfully', { orderId });
}
```

## Child Loggers with Context

```typescript
class OrderService {
  private logger = createLogger('OrderService');
  
  async createOrder(orderData: any) {
    // Create a child logger for this specific operation
    const opLogger = this.logger.child({ 
      operation: 'createOrder',
      orderId: orderData.id 
    });
    
    opLogger.info('Starting order creation');
    
    try {
      // Process order
      opLogger.debug('Validating order data');
      await this.validateOrder(orderData);
      
      opLogger.debug('Saving order to database');
      const order = await this.saveOrder(orderData);
      
      opLogger.info('Order created successfully');
      return order;
    } catch (error) {
      opLogger.error({ err: error }, 'Failed to create order');
      throw error;
    }
  }
}
```

## Timing Operations

```typescript
import { createTimer } from '@/lib/logger';

async function expensiveOperation() {
  const logger = createLogger('ExpensiveOp');
  const endTimer = createTimer(logger, 'dataProcessing');
  
  try {
    // Do expensive work
    await processLargeDataset();
    
    // Timer will log the duration
    endTimer();
  } catch (error) {
    logger.error({ err: error }, 'Operation failed');
    endTimer(); // Still log the duration
    throw error;
  }
}
```

## API Request Logging

```typescript
import { logApiRequest } from '@/lib/logger';

async function fetchUserData(userId: string) {
  const startTime = Date.now();
  const url = `/api/users/${userId}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    logApiRequest('GET', url, response.status, Date.now() - startTime);
    
    return data;
  } catch (error) {
    logApiRequest('GET', url, 0, Date.now() - startTime, error as Error);
    throw error;
  }
}
```

## Database Operation Logging

```typescript
import { logDbOperation } from '@/lib/logger';

async function updateUser(userId: string, data: any) {
  const startTime = Date.now();
  
  try {
    const result = await db.collection('users').updateOne(
      { _id: userId },
      { $set: data }
    );
    
    logDbOperation('updateOne', 'users', Date.now() - startTime);
    
    return result;
  } catch (error) {
    logDbOperation('updateOne', 'users', Date.now() - startTime, error as Error);
    throw error;
  }
}
```

## Authentication Event Logging

```typescript
import { logAuthEvent } from '@/lib/logger';

async function handleLogin(email: string, password: string) {
  try {
    const user = await authenticateUser(email, password);
    
    logAuthEvent('login', user.id, { email, ip: req.ip });
    
    return user;
  } catch (error) {
    logAuthEvent('error', undefined, { email }, error as Error);
    throw error;
  }
}
```

## Configuration

### Environment Variables

```bash
# Log level (trace, debug, info, warn, error, fatal)
LOG_LEVEL=info

# Node environment
NODE_ENV=production
```

### Custom Configuration

```typescript
import { LoggerFactory } from '@/lib/logger';

const customLogger = LoggerFactory.getInstance({
  level: 'debug',
  prettyPrint: true,
  timestamp: true,
  asyncLogging: false,
  redactPaths: [
    '*.password',
    '*.token',
    '*.apiKey',
    'req.headers.authorization',
  ],
  bindings: {
    service: 'my-service',
    version: '2.0.0',
  },
});
```

## Production Best Practices

### 1. Use Appropriate Log Levels

```typescript
// Development debugging
logger.trace('Detailed trace information');
logger.debug('Debug information');

// Production logs
logger.info('Important business events');
logger.warn('Warning conditions');
logger.error('Error conditions');
logger.fatal('Fatal errors requiring immediate attention');
```

### 2. Structure Your Logs

```typescript
// Good: Structured with context
logger.info({
  event: 'user_registered',
  userId: user.id,
  email: user.email,
  plan: user.plan,
}, 'New user registration');

// Bad: Unstructured string concatenation
logger.info(`User ${user.id} registered with email ${user.email}`);
```

### 3. Use Child Loggers for Context

```typescript
class PaymentService {
  private logger = createLogger('PaymentService');
  
  async processPayment(paymentId: string) {
    const paymentLogger = this.logger.child({ paymentId });
    
    paymentLogger.info('Processing payment');
    // All subsequent logs will include paymentId
  }
}
```

### 4. Handle Sensitive Data

```typescript
// Sensitive data is automatically redacted
logger.info({
  user: {
    id: 123,
    email: 'user@example.com',
    password: 'secret123', // Will be logged as [REDACTED]
    token: 'jwt-token',    // Will be logged as [REDACTED]
  }
}, 'User data');
```

### 5. Monitor Performance

```typescript
// Check if debug logging is enabled before expensive operations
if (logger.isLevelEnabled('debug')) {
  const debugData = generateExpensiveDebugInfo();
  logger.debug(debugData, 'Detailed debug information');
}
```

## Testing

### Mock Logger in Tests

```typescript
import { createLogger } from '@/lib/logger';

// Create a test logger with higher level to reduce noise
const testLogger = createLogger('TestSuite', { level: 'error' });

// Or use a mock
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));
```

## Troubleshooting

### Logs Not Appearing

1. Check the log level: `logger.level`
2. Ensure NODE_ENV is set correctly
3. Verify transport configuration

### Performance Issues

1. Use async logging in production
2. Avoid logging large objects
3. Use appropriate log levels
4. Consider sampling for high-frequency logs

### Missing Request IDs

1. Ensure middleware is properly configured
2. Check AsyncLocalStorage is working
3. Verify middleware order

## Migration from Console.log

```typescript
// Before
console.log('User logged in:', userId);
console.error('Error:', error);

// After
logger.info({ userId }, 'User logged in');
logger.error({ err: error }, 'Error occurred');
```

## Integration with Monitoring Tools

The structured JSON output integrates seamlessly with:
- ELK Stack (Elasticsearch, Logstash, Kibana)
- Datadog
- New Relic
- AWS CloudWatch
- Google Cloud Logging

Example log output:
```json
{
  "level": 30,
  "time": "2024-01-10T12:00:00.000Z",
  "pid": 12345,
  "hostname": "server-1",
  "module": "UserService",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "msg": "User logged in",
  "userId": 123,
  "email": "user@example.com"
}
```