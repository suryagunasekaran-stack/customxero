import { LoggerOptions } from 'pino';

// Use dynamic import for crypto to avoid client-side issues
const getRandomUUID = () => {
  if (typeof window !== 'undefined' && window.crypto) {
    return window.crypto.randomUUID();
  } else if (typeof require !== 'undefined') {
    return require('crypto').randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export interface LoggerConfig {
  level: string;
  prettyPrint: boolean;
  timestamp: boolean;
  asyncLogging: boolean;
  redactPaths: string[];
  bindings?: Record<string, any>;
}

export const defaultConfig: LoggerConfig = {
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  prettyPrint: process.env.NODE_ENV !== 'production',
  timestamp: true,
  asyncLogging: false, // Disabled due to Next.js build constraints
  redactPaths: [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["x-api-key"]',
    'res.headers["set-cookie"]',
    '*.password',
    '*.token',
    '*.accessToken',
    '*.refreshToken',
    '*.apiKey',
    '*.api_key',
    '*.secret',
    '*.privateKey',
    '*.creditCard',
    '*.ssn',
  ],
  bindings: {
    pid: typeof process !== 'undefined' ? process.pid : 0,
    hostname: process.env.HOSTNAME || (typeof window === 'undefined' ? require('os').hostname() : 'browser'),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
  },
};

export function createPinoConfig(config: Partial<LoggerConfig> = {}): LoggerOptions {
  const mergedConfig = { ...defaultConfig, ...config };

  const baseConfig: LoggerOptions = {
    level: mergedConfig.level,
    timestamp: mergedConfig.timestamp ? () => `,"time":"${new Date().toISOString()}"` : false,
    base: mergedConfig.bindings,
    serializers: {
      req: (req: any) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        query: req.query,
        params: req.params,
        headers: {
          ...req.headers,
          authorization: req.headers?.authorization ? '[REDACTED]' : undefined,
          cookie: req.headers?.cookie ? '[REDACTED]' : undefined,
        },
        remoteAddress: req.ip || req.connection?.remoteAddress,
        remotePort: req.connection?.remotePort,
      }),
      res: (res: any) => ({
        statusCode: res.statusCode,
        headers: res.getHeaders ? res.getHeaders() : res.headers,
      }),
      err: (err: any) => ({
        type: err.type || err.constructor?.name,
        message: err.message,
        stack: err.stack,
        code: err.code,
        statusCode: err.statusCode,
        ...err,
      }),
    },
    redact: {
      paths: mergedConfig.redactPaths,
      censor: '[REDACTED]',
    },
    formatters: {
      level: (label: string) => ({ level: label }),
      bindings: (bindings: any) => ({
        ...bindings,
        requestId: bindings.requestId || getRandomUUID(),
      }),
    },
    hooks: {
      logMethod(inputArgs: any[], method: any) {
        // Add request ID from async local storage if available
        if ((global as any).asyncLocalStorage) {
          const store = (global as any).asyncLocalStorage.getStore();
          if (store?.requestId && inputArgs[0] && typeof inputArgs[0] === 'object') {
            inputArgs[0].requestId = store.requestId;
          }
        }
        return method.apply(this, inputArgs);
      },
    },
  };

  // Development configuration with pretty printing
  if (mergedConfig.prettyPrint && process.env.NODE_ENV !== 'production') {
    return {
      ...baseConfig,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          levelFirst: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
          ignore: 'pid,hostname',
          messageFormat: '{requestId} {msg}',
          errorLikeObjectKeys: ['err', 'error'],
          singleLine: false,
          customPrettifiers: {
            time: (timestamp: any) => `🕐 ${timestamp}`,
          },
        },
      },
    };
  }

  // Production configuration - simplified for Next.js compatibility
  // Async logging disabled due to worker thread issues in Next.js build
  if (mergedConfig.asyncLogging && typeof window === 'undefined' && process.env.NODE_ENV !== 'test') {
    // Only enable in runtime, not during build
    if (!process.env.NEXT_PHASE || process.env.NEXT_PHASE !== 'phase-production-build') {
      return {
        ...baseConfig,
        transport: {
          target: 'pino/file',
          options: {
            destination: 1, // stdout
            sync: false,
          },
        },
      };
    }
  }

  return baseConfig;
}