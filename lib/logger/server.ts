/**
 * Server-only logger exports
 * Use this file when you need logger functionality that should only run on the server
 */

// Mark this file as server-only
import 'server-only';

// Re-export everything from the main logger
export * from './index';

// Additional server-only utilities
import { loggerFactory } from './factory';

/**
 * Create a logger with server-specific features
 * This ensures async context and other Node.js features are available
 */
export function createServerLogger(module: string, context?: Record<string, any>) {
  if (typeof window !== 'undefined') {
    throw new Error('createServerLogger can only be used on the server');
  }
  
  return loggerFactory.createLogger(module, context);
}

/**
 * Run with guaranteed async context (server only)
 */
export function runWithContext<T>(
  requestId: string,
  context: Record<string, any>,
  fn: () => T
): T {
  if (typeof window !== 'undefined') {
    throw new Error('runWithContext can only be used on the server');
  }
  
  return loggerFactory.runWithRequestContext(requestId, context, fn);
}