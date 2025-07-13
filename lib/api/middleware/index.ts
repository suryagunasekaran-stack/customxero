import { withAuth } from './withAuth';
import { withErrorHandler } from './withErrorHandler';
import { composeMiddleware } from './withErrorHandler';

// Export all middleware
export { withAuth, withErrorHandler, composeMiddleware };

// Export types
export type { AuthContext, AuthenticatedHandler } from './withAuth';
export type { ApiHandler } from './withErrorHandler';

/**
 * Create a protected API route with error handling
 * Combines authentication and error handling middleware
 */
export const createProtectedRoute = composeMiddleware(
  withErrorHandler,
  withAuth
);

/**
 * Create a public API route with error handling
 * Only applies error handling middleware
 */
export const createPublicRoute = withErrorHandler;