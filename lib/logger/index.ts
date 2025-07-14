/**
 * Production-grade logger for Node.js applications using Pino
 * 
 * Features:
 * - Structured JSON logging
 * - Multiple log levels (trace, debug, info, warn, error, fatal)
 * - Pretty printing in development
 * - Child loggers with context
 * - Async logging in production
 * - Request ID tracking
 * - Express middleware integration
 * - Graceful shutdown handling
 * - Singleton pattern implementation
 */

export { LoggerFactory, loggerFactory, rootLogger, createLogger, asyncLocalStorage } from './factory';
export { createLoggerMiddleware, createErrorLoggerMiddleware, attachLogger, pinoStream } from './middleware';
export { defaultConfig } from './config';
export type { LoggerConfig } from './config';
export type { Logger } from 'pino';
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

// Re-export utility functions from the existing logger
import { loggerFactory } from './factory';
import type { Logger } from 'pino';

/**
 * Get the root logger instance
 */
export const logger = loggerFactory.getLogger();

/**
 * Log API request with timing information
 */
export function logApiRequest(
  method: string,
  url: string,
  statusCode?: number,
  duration?: number,
  error?: Error
): void {
  const log = logger.child({ 
    type: 'api_request',
    method,
    url,
    statusCode,
    duration,
  });

  if (error) {
    log.error({ err: error }, `API request failed: ${method} ${url}`);
  } else {
    log.info(`API request completed: ${method} ${url} - ${statusCode} (${duration}ms)`);
  }
}

/**
 * Log database operations
 */
export function logDbOperation(
  operation: string,
  collection: string,
  duration?: number,
  error?: Error
): void {
  const log = logger.child({
    type: 'db_operation',
    operation,
    collection,
    duration,
  });

  if (error) {
    log.error({ err: error }, `Database operation failed: ${operation} on ${collection}`);
  } else {
    log.debug(`Database operation completed: ${operation} on ${collection} (${duration}ms)`);
  }
}

/**
 * Log authentication events
 */
export function logAuthEvent(
  event: 'login' | 'logout' | 'refresh' | 'error',
  userId?: string,
  details?: Record<string, any>,
  error?: Error
): void {
  const log = logger.child({
    type: 'auth_event',
    event,
    userId,
    ...details,
  });

  if (error) {
    log.error({ err: error }, `Authentication ${event} failed`);
  } else {
    log.info(`Authentication ${event} successful`);
  }
}

/**
 * Log sync operations
 */
export function logSyncOperation(
  operation: string,
  step?: string,
  details?: Record<string, any>,
  error?: Error
): void {
  const log = logger.child({
    type: 'sync_operation',
    operation,
    step,
    ...details,
  });

  if (error) {
    log.error({ err: error }, `Sync operation failed: ${operation} - ${step}`);
  } else {
    log.info(`Sync operation: ${operation} - ${step}`);
  }
}

/**
 * Create a timer for measuring operation duration
 */
export function createTimer(logger: Logger, operation: string): () => void {
  const startTime = Date.now();
  return () => {
    const duration = Date.now() - startTime;
    logger.debug({ operation, duration }, `Operation completed in ${duration}ms`);
  };
}

/**
 * Log with context from async local storage
 */
export function logWithContext(level: string, message: string, meta?: Record<string, any>): void {
  const context = loggerFactory.getCurrentContext();
  const log = context ? logger.child(context) : logger;
  
  switch (level) {
    case 'trace':
      log.trace(meta, message);
      break;
    case 'debug':
      log.debug(meta, message);
      break;
    case 'info':
      log.info(meta, message);
      break;
    case 'warn':
      log.warn(meta, message);
      break;
    case 'error':
      log.error(meta, message);
      break;
    case 'fatal':
      log.fatal(meta, message);
      break;
    default:
      log.info(meta, message);
  }
}

// Convenience methods for different log levels
export const trace = (message: string, meta?: Record<string, any>) => logWithContext('trace', message, meta);
export const debug = (message: string, meta?: Record<string, any>) => logWithContext('debug', message, meta);
export const info = (message: string, meta?: Record<string, any>) => logWithContext('info', message, meta);
export const warn = (message: string, meta?: Record<string, any>) => logWithContext('warn', message, meta);
export const error = (message: string, meta?: Record<string, any>) => logWithContext('error', message, meta);
export const fatal = (message: string, meta?: Record<string, any>) => logWithContext('fatal', message, meta);