/**
 * Custom error class for API errors with status codes and details
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public details?: any,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
    
    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }
}

// Common API errors
export class ValidationError extends ApiError {
  constructor(message: string, details?: any) {
    super(message, 400, details, 'VALIDATION_ERROR');
  }
}

export class AuthenticationError extends ApiError {
  constructor(message: string = 'Authentication required', details?: any) {
    super(message, 401, details, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends ApiError {
  constructor(message: string = 'Forbidden', details?: any) {
    super(message, 403, details, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string = 'Resource not found', details?: any) {
    super(message, 404, details, 'NOT_FOUND');
  }
}

export class ConflictError extends ApiError {
  constructor(message: string, details?: any) {
    super(message, 409, details, 'CONFLICT');
  }
}

export class RateLimitError extends ApiError {
  constructor(message: string = 'Rate limit exceeded', details?: any) {
    super(message, 429, details, 'RATE_LIMIT_EXCEEDED');
  }
}

export class ExternalApiError extends ApiError {
  constructor(
    message: string,
    public externalService: string,
    statusCode: number = 502,
    details?: any
  ) {
    super(message, statusCode, details, 'EXTERNAL_API_ERROR');
  }
}