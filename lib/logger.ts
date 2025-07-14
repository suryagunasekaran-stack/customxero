/**
 * Production-grade logger implementation
 * This file provides a unified interface that works in both client and server environments
 */

// For server-side components, use the full logger
// For client-side components, operations are no-ops or use console
// Import specific versions when you need guaranteed behavior:
// - import { logger } from '@/lib/logger/server' for server-only
// - import { logger } from '@/lib/logger/client' for client-only

export * from './logger/index';
export type { Logger, LogLevel } from './logger/index';