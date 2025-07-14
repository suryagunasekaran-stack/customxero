/**
 * Client-safe logger implementation
 * This provides a console-based logger for client-side code
 */

export interface ClientLogger {
  trace: (message: string, meta?: any) => void;
  debug: (message: string, meta?: any) => void;
  info: (message: string, meta?: any) => void;
  warn: (message: string, meta?: any) => void;
  error: (message: string, meta?: any) => void;
  fatal: (message: string, meta?: any) => void;
  child: (context: Record<string, any>) => ClientLogger;
}

class ClientLoggerImpl implements ClientLogger {
  private context: Record<string, any>;
  private level: string;

  constructor(context: Record<string, any> = {}, level: string = 'info') {
    this.context = context;
    this.level = level;
  }

  private shouldLog(level: string): boolean {
    const levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
    const currentLevelIndex = levels.indexOf(this.level);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  private log(level: string, message: string, meta?: any) {
    if (!this.shouldLog(level)) return;

    const timestamp = new Date().toISOString();
    const logData = {
      timestamp,
      level,
      message,
      ...this.context,
      ...meta,
    };

    // Use appropriate console method
    switch (level) {
      case 'trace':
      case 'debug':
        console.debug(`[${level.toUpperCase()}]`, message, logData);
        break;
      case 'info':
        console.info(`[${level.toUpperCase()}]`, message, logData);
        break;
      case 'warn':
        console.warn(`[${level.toUpperCase()}]`, message, logData);
        break;
      case 'error':
      case 'fatal':
        console.error(`[${level.toUpperCase()}]`, message, logData);
        break;
    }
  }

  trace(message: string, meta?: any) {
    this.log('trace', message, meta);
  }

  debug(message: string, meta?: any) {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: any) {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: any) {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: any) {
    this.log('error', message, meta);
  }

  fatal(message: string, meta?: any) {
    this.log('fatal', message, meta);
  }

  child(context: Record<string, any>): ClientLogger {
    return new ClientLoggerImpl(
      { ...this.context, ...context },
      this.level
    );
  }
}

// Export a client-safe logger instance
export const logger = new ClientLoggerImpl(
  { environment: 'client' },
  process.env.NEXT_PUBLIC_LOG_LEVEL || 'info'
);

// Export factory function
export function createLogger(module: string, context?: Record<string, any>): ClientLogger {
  return logger.child({ module, ...context });
}

// Export stub functions that match server API but work on client
export function logApiRequest(
  method: string,
  url: string,
  statusCode?: number,
  duration?: number,
  error?: Error
): void {
  if (error) {
    logger.error(`API request failed: ${method} ${url}`, {
      method,
      url,
      statusCode,
      duration,
      error: error.message,
    });
  } else {
    logger.info(`API request completed: ${method} ${url}`, {
      method,
      url,
      statusCode,
      duration,
    });
  }
}

export function logDbOperation(
  operation: string,
  collection: string,
  duration?: number,
  error?: Error
): void {
  // No-op on client
  if (process.env.NODE_ENV === 'development') {
    console.debug('[Client Logger] DB operations should not be logged on client side');
  }
}

export function logAuthEvent(
  event: string,
  userId?: string,
  details?: Record<string, any>,
  error?: Error
): void {
  const logData = { event, userId, ...details };
  
  if (error) {
    logger.error(`Authentication ${event} failed`, { ...logData, error: error.message });
  } else {
    logger.info(`Authentication ${event}`, logData);
  }
}

export function logSyncOperation(
  operation: string,
  step?: string,
  details?: Record<string, any>,
  error?: Error
): void {
  // No-op on client
  if (process.env.NODE_ENV === 'development') {
    console.debug('[Client Logger] Sync operations should not be logged on client side');
  }
}

// Convenience methods
export const trace = (message: string, meta?: Record<string, any>) => logger.trace(message, meta);
export const debug = (message: string, meta?: Record<string, any>) => logger.debug(message, meta);
export const info = (message: string, meta?: Record<string, any>) => logger.info(message, meta);
export const warn = (message: string, meta?: Record<string, any>) => logger.warn(message, meta);
export const error = (message: string, meta?: Record<string, any>) => logger.error(message, meta);
export const fatal = (message: string, meta?: Record<string, any>) => logger.fatal(message, meta);