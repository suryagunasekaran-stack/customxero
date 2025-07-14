import pino, { Logger, LoggerOptions } from 'pino';
import { createPinoConfig, LoggerConfig, defaultConfig } from './config';

// Dynamic import for server-only modules
let AsyncLocalStorage: any;
let asyncLocalStorageInstance: any = null;

if (typeof window === 'undefined') {
  // Server-side only
  AsyncLocalStorage = require('async_hooks').AsyncLocalStorage;
  asyncLocalStorageInstance = new AsyncLocalStorage();
}

// Global async local storage for request context (server-side only)
export const asyncLocalStorage = asyncLocalStorageInstance;

if (typeof window === 'undefined' && asyncLocalStorage) {
  (global as any).asyncLocalStorage = asyncLocalStorage;
}

/**
 * Logger Factory implementing Singleton pattern
 * Ensures single logger instance across the application
 */
export class LoggerFactory {
  private static instance: LoggerFactory;
  private logger: Logger;
  private childLoggers: Map<string, Logger> = new Map();
  private config: LoggerConfig;

  private constructor(config?: Partial<LoggerConfig>) {
    try {
      const pinoConfig = createPinoConfig(config);
      this.logger = pino(pinoConfig);
      this.config = { ...config } as LoggerConfig;
    } catch (error) {
      // Fallback to basic pino if config fails (e.g., during build)
      console.warn('Logger initialization warning:', error);
      this.logger = pino({
        level: process.env.LOG_LEVEL || 'info',
        timestamp: () => `,"time":"${new Date().toISOString()}"`,
      });
      this.config = defaultConfig;
    }
    
    // Set up process handlers
    this.setupProcessHandlers();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(config?: Partial<LoggerConfig>): LoggerFactory {
    if (!LoggerFactory.instance) {
      LoggerFactory.instance = new LoggerFactory(config);
    }
    return LoggerFactory.instance;
  }

  /**
   * Get root logger
   */
  public getLogger(): Logger {
    return this.logger;
  }

  /**
   * Create or get child logger with context
   */
  public createLogger(module: string, context?: Record<string, any>): Logger {
    const key = module + JSON.stringify(context || {});
    
    if (!this.childLoggers.has(key)) {
      const childLogger = this.logger.child({
        module,
        ...context,
      });
      this.childLoggers.set(key, childLogger);
    }
    
    return this.childLoggers.get(key)!;
  }

  /**
   * Create request-scoped logger
   */
  public createRequestLogger(requestId: string, context?: Record<string, any>): Logger {
    return this.logger.child({
      requestId,
      type: 'request',
      ...context,
    });
  }

  /**
   * Run function with request context
   */
  public runWithRequestContext<T>(
    requestId: string, 
    context: Record<string, any>, 
    fn: () => T
  ): T {
    if (asyncLocalStorage) {
      return asyncLocalStorage.run({ requestId, ...context }, fn);
    }
    // In browser, just run the function without context
    return fn();
  }

  /**
   * Get current request context
   */
  public getCurrentContext(): { requestId: string; [key: string]: any } | undefined {
    if (asyncLocalStorage) {
      return asyncLocalStorage.getStore();
    }
    return undefined;
  }

  /**
   * Setup process handlers for clean shutdown and error handling
   */
  private setupProcessHandlers(): void {
    // Only setup handlers on server-side
    if (typeof window !== 'undefined') {
      return;
    }

    // Handle uncaught exceptions
    process.on('uncaughtException', (err) => {
      // Use pino.final only if available (server-side)
      const pinoWithFinal = pino as any;
      if (pinoWithFinal.final && typeof pinoWithFinal.final === 'function') {
        const finalLogger = pinoWithFinal.final(this.logger);
        finalLogger.fatal(err, 'Uncaught exception');
      } else {
        this.logger.fatal(err, 'Uncaught exception');
      }
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (err) => {
      const pinoWithFinal = pino as any;
      if (pinoWithFinal.final && typeof pinoWithFinal.final === 'function') {
        const finalLogger = pinoWithFinal.final(this.logger);
        finalLogger.fatal(err as Error, 'Unhandled promise rejection');
      } else {
        this.logger.fatal(err as Error, 'Unhandled promise rejection');
      }
      process.exit(1);
    });

    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
      this.logger.info('Received SIGINT, shutting down gracefully');
      this.shutdown();
    });

    // Handle SIGTERM
    process.on('SIGTERM', () => {
      this.logger.info('Received SIGTERM, shutting down gracefully');
      this.shutdown();
    });
  }

  /**
   * Graceful shutdown
   */
  private shutdown(): void {
    // Use pino.final if available
    const pinoWithFinal = pino as any;
    const finalLogger = pinoWithFinal.final && typeof pinoWithFinal.final === 'function' 
      ? pinoWithFinal.final(this.logger) 
      : this.logger;
    
    finalLogger.info('Starting graceful shutdown');
    
    // Flush any pending logs
    if (this.logger.flush) {
      this.logger.flush();
    }
    
    // Clear child loggers
    this.childLoggers.clear();
    
    finalLogger.info('Shutdown complete');
    process.exit(0);
  }

  /**
   * Update logger level at runtime
   */
  public setLevel(level: string): void {
    this.logger.level = level;
    this.childLoggers.forEach(child => child.level = level);
  }

  /**
   * Check if a log level is enabled
   */
  public isLevelEnabled(level: string): boolean {
    return this.logger.isLevelEnabled(level);
  }
}

// Export convenience functions
export const loggerFactory = LoggerFactory.getInstance();
export const rootLogger = loggerFactory.getLogger();
export const createLogger = (module: string, context?: Record<string, any>) => 
  loggerFactory.createLogger(module, context);