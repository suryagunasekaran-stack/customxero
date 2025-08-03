/**
 * Simple logger implementation for production use
 */

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LogMethod {
  (message: string, ...args: any[]): void;
  (obj: object, message?: string, ...args: any[]): void;
}

export interface Logger {
  trace: LogMethod;
  debug: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
  fatal: LogMethod;
  child: (bindings: object) => Logger;
}

const createLogMethod = (level: LogLevel): LogMethod => {
  return (messageOrObj: string | object, ...args: any[]) => {
    if (typeof window === 'undefined') {
      // Server-side logging
      const timestamp = new Date().toISOString();
      const logData = typeof messageOrObj === 'string' 
        ? { level, timestamp, msg: messageOrObj, ...args[0] }
        : { level, timestamp, ...messageOrObj, msg: args[0] };
      
      console.log(JSON.stringify(logData));
    } else {
      // Client-side logging
      const method = level === 'trace' || level === 'debug' ? 'log' : 
                     level === 'info' ? 'info' :
                     level === 'warn' ? 'warn' : 'error';
      
      if (typeof messageOrObj === 'string') {
        console[method](`[${level.toUpperCase()}]`, messageOrObj, ...args);
      } else {
        console[method](`[${level.toUpperCase()}]`, messageOrObj, ...args);
      }
    }
  };
};

export const logger: Logger = {
  trace: createLogMethod('trace'),
  debug: createLogMethod('debug'),
  info: createLogMethod('info'),
  warn: createLogMethod('warn'),
  error: createLogMethod('error'),
  fatal: createLogMethod('fatal'),
  child: (bindings: object) => {
    // Return a new logger with bound context
    return {
      trace: (messageOrObj: string | object, ...args: any[]) => {
        const merged = typeof messageOrObj === 'string' 
          ? logger.trace(messageOrObj, { ...bindings, ...args[0] })
          : logger.trace({ ...bindings, ...messageOrObj }, ...args);
      },
      debug: (messageOrObj: string | object, ...args: any[]) => {
        const merged = typeof messageOrObj === 'string' 
          ? logger.debug(messageOrObj, { ...bindings, ...args[0] })
          : logger.debug({ ...bindings, ...messageOrObj }, ...args);
      },
      info: (messageOrObj: string | object, ...args: any[]) => {
        const merged = typeof messageOrObj === 'string' 
          ? logger.info(messageOrObj, { ...bindings, ...args[0] })
          : logger.info({ ...bindings, ...messageOrObj }, ...args);
      },
      warn: (messageOrObj: string | object, ...args: any[]) => {
        const merged = typeof messageOrObj === 'string' 
          ? logger.warn(messageOrObj, { ...bindings, ...args[0] })
          : logger.warn({ ...bindings, ...messageOrObj }, ...args);
      },
      error: (messageOrObj: string | object, ...args: any[]) => {
        const merged = typeof messageOrObj === 'string' 
          ? logger.error(messageOrObj, { ...bindings, ...args[0] })
          : logger.error({ ...bindings, ...messageOrObj }, ...args);
      },
      fatal: (messageOrObj: string | object, ...args: any[]) => {
        const merged = typeof messageOrObj === 'string' 
          ? logger.fatal(messageOrObj, { ...bindings, ...args[0] })
          : logger.fatal({ ...bindings, ...messageOrObj }, ...args);
      },
      child: (moreBindings: object) => logger.child({ ...bindings, ...moreBindings })
    } as Logger;
  }
};

export default logger;

// Helper functions for compatibility
export function createLogger(name: string) {
  return logger.child({ component: name });
}

export function logSyncOperation(operation: string, data?: any) {
  logger.info(`Sync operation: ${operation}`, data);
}

export function logApiRequest(method: string, url: string, data?: any) {
  logger.info(`API Request: ${method} ${url}`, data);
}