import { NextResponse } from 'next/server';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  metadata?: {
    timestamp: string;
    requestId?: string;
    pagination?: {
      page: number;
      pageSize: number;
      total: number;
      hasNext: boolean;
    };
    [key: string]: any;
  };
}

/**
 * Builder class for creating standardized API responses
 */
export class ResponseBuilder {
  /**
   * Create a successful response
   */
  static success<T>(
    data: T,
    options?: {
      message?: string;
      metadata?: Record<string, any>;
      status?: number;
      headers?: HeadersInit;
    }
  ): NextResponse {
    const response: ApiResponse<T> = {
      success: true,
      data,
      message: options?.message,
      metadata: {
        timestamp: new Date().toISOString(),
        ...options?.metadata
      }
    };

    return NextResponse.json(response, {
      status: options?.status || 200,
      headers: options?.headers
    });
  }

  /**
   * Create an error response
   */
  static error(
    message: string,
    options?: {
      statusCode?: number;
      details?: any;
      code?: string;
      headers?: HeadersInit;
    }
  ): NextResponse {
    const response: ApiResponse = {
      success: false,
      error: message,
      metadata: {
        timestamp: new Date().toISOString(),
        code: options?.code,
        details: options?.details
      }
    };

    return NextResponse.json(response, {
      status: options?.statusCode || 500,
      headers: options?.headers
    });
  }

  /**
   * Create a paginated response
   */
  static paginated<T>(
    data: T[],
    pagination: {
      page: number;
      pageSize: number;
      total: number;
    },
    options?: {
      message?: string;
      metadata?: Record<string, any>;
      headers?: HeadersInit;
    }
  ): NextResponse {
    const hasNext = pagination.page * pagination.pageSize < pagination.total;
    
    const response: ApiResponse<T[]> = {
      success: true,
      data,
      message: options?.message,
      metadata: {
        timestamp: new Date().toISOString(),
        pagination: {
          ...pagination,
          hasNext
        },
        ...options?.metadata
      }
    };

    return NextResponse.json(response, {
      status: 200,
      headers: options?.headers
    });
  }

  /**
   * Create a no content response (204)
   */
  static noContent(options?: {
    headers?: HeadersInit;
  }): NextResponse {
    return new NextResponse(null, {
      status: 204,
      headers: options?.headers
    });
  }

  /**
   * Create an accepted response (202) for async operations
   */
  static accepted(
    data?: any,
    options?: {
      message?: string;
      location?: string;
      metadata?: Record<string, any>;
      headers?: HeadersInit;
    }
  ): NextResponse {
    const response: ApiResponse = {
      success: true,
      data,
      message: options?.message || 'Request accepted for processing',
      metadata: {
        timestamp: new Date().toISOString(),
        ...options?.metadata
      }
    };

    const headers = new Headers(options?.headers);
    if (options?.location) {
      headers.set('Location', options.location);
    }

    return NextResponse.json(response, {
      status: 202,
      headers
    });
  }

  /**
   * Create a redirect response
   */
  static redirect(
    url: string,
    options?: {
      permanent?: boolean;
      headers?: HeadersInit;
    }
  ): NextResponse {
    return NextResponse.redirect(url, {
      status: options?.permanent ? 308 : 307,
      headers: options?.headers
    });
  }

  /**
   * Create a file download response
   */
  static file(
    content: string | Buffer | Blob,
    filename: string,
    options?: {
      contentType?: string;
      headers?: HeadersInit;
    }
  ): NextResponse {
    const headers = new Headers(options?.headers);
    headers.set('Content-Disposition', `attachment; filename="${filename}"`);
    headers.set('Content-Type', options?.contentType || 'application/octet-stream');

    return new NextResponse(content, {
      status: 200,
      headers
    });
  }
}

// Convenience functions for common responses
export const successResponse = ResponseBuilder.success;
export const errorResponse = ResponseBuilder.error;
export const paginatedResponse = ResponseBuilder.paginated;
export const noContentResponse = ResponseBuilder.noContent;
export const acceptedResponse = ResponseBuilder.accepted;
export const fileResponse = ResponseBuilder.file;