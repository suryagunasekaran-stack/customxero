import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { loggerFactory, asyncLocalStorage } from './factory';
import { Logger } from 'pino';

// Extend Express Request type to include logger
declare global {
  namespace Express {
    interface Request {
      id: string;
      logger: Logger;
      startTime?: number;
    }
  }
}

export interface LoggerMiddlewareOptions {
  /**
   * Function to generate request ID
   */
  genReqId?: (req: Request) => string;
  
  /**
   * Skip logging for certain requests
   */
  skip?: (req: Request, res: Response) => boolean;
  
  /**
   * Custom properties to add to log
   */
  customProps?: (req: Request, res: Response) => Record<string, any>;
  
  /**
   * Log request body (be careful with sensitive data)
   */
  logBody?: boolean;
  
  /**
   * Paths to ignore (e.g., health checks)
   */
  ignorePaths?: string[];
  
  /**
   * Custom success message
   */
  successMessage?: string;
  
  /**
   * Custom error message
   */
  errorMessage?: string;
}

/**
 * Express middleware for request/response logging with Pino
 */
export function createLoggerMiddleware(options: LoggerMiddlewareOptions = {}) {
  const {
    genReqId = () => randomUUID(),
    skip,
    customProps,
    logBody = false,
    ignorePaths = ['/health', '/metrics', '/favicon.ico'],
    successMessage = 'Request completed',
    errorMessage = 'Request failed',
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip if path should be ignored
    if (ignorePaths.includes(req.path)) {
      return next();
    }

    // Generate request ID
    req.id = req.headers['x-request-id'] as string || genReqId(req);
    req.startTime = Date.now();

    // Create request-scoped logger
    const requestLogger = loggerFactory.createRequestLogger(req.id, {
      method: req.method,
      url: req.url,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    // Attach logger to request
    req.logger = requestLogger;

    // Run the rest of the request in async context
    const executeRequest = () => {
      // Skip logging if configured
      if (skip && skip(req, res)) {
        return next();
      }

      // Log request
      const requestLog: Record<string, any> = {
        msg: 'Incoming request',
        method: req.method,
        url: req.url,
        query: req.query,
        params: req.params,
        headers: req.headers,
      };

      if (logBody && req.body) {
        requestLog.body = req.body;
      }

      if (customProps) {
        Object.assign(requestLog, customProps(req, res));
      }

      requestLogger.info(requestLog);

      // Capture response
      const originalSend = res.send;
      const originalJson = res.json;
      const originalEnd = res.end;

      // Override send
      res.send = function(data: any) {
        res.locals.body = data;
        return originalSend.call(this, data);
      };

      // Override json
      res.json = function(data: any) {
        res.locals.body = data;
        return originalJson.call(this, data);
      };

      // Override end
      res.end = function(...args: any[]) {
        logResponse();
        return originalEnd.apply(this, args as any);
      };

      // Log response
      const logResponse = () => {
        const duration = Date.now() - (req.startTime || 0);
        const responseLog: Record<string, any> = {
          msg: res.statusCode >= 400 ? errorMessage : successMessage,
          statusCode: res.statusCode,
          duration,
          contentLength: res.get('content-length'),
        };

        if (customProps) {
          Object.assign(responseLog, customProps(req, res));
        }

        // Log at appropriate level based on status code
        if (res.statusCode >= 500) {
          requestLogger.error(responseLog);
        } else if (res.statusCode >= 400) {
          requestLogger.warn(responseLog);
        } else {
          requestLogger.info(responseLog);
        }
      };

      // Handle errors
      res.on('error', (error: Error) => {
        requestLogger.error({
          msg: 'Response error',
          error: error.message,
          stack: error.stack,
        });
      });

      next();
    };

    // Run with async context if available (server-side)
    if (asyncLocalStorage) {
      asyncLocalStorage.run({ requestId: req.id }, executeRequest);
    } else {
      // Client-side or no async context
      executeRequest();
    }
  };
}

/**
 * Error logging middleware
 */
export function createErrorLoggerMiddleware() {
  return (err: Error, req: Request, res: Response, next: NextFunction) => {
    const logger = req.logger || loggerFactory.createRequestLogger(req.id || randomUUID());
    
    logger.error({
      msg: 'Unhandled error',
      error: {
        message: err.message,
        stack: err.stack,
        name: err.name,
      },
      statusCode: res.statusCode || 500,
      method: req.method,
      url: req.url,
    });

    next(err);
  };
}

/**
 * Morgan-compatible stream for Pino
 */
export const pinoStream = {
  write: (message: string) => {
    const logger = loggerFactory.getLogger();
    logger.info(message.trim());
  },
};

/**
 * Helper to attach logger to request without full middleware
 */
export function attachLogger(req: Request, res: Response, next: NextFunction) {
  req.id = req.id || req.headers['x-request-id'] as string || randomUUID();
  req.logger = loggerFactory.createRequestLogger(req.id);
  next();
}