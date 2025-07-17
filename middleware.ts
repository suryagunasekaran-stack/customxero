import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Clone the request headers
  const requestHeaders = new Headers(request.headers);

  // Add custom headers for file upload routes
  if (request.nextUrl.pathname.startsWith('/api/xero/process-timesheet') ||
      request.nextUrl.pathname.startsWith('/api/blob/upload')) {
    requestHeaders.set('x-max-body-size', '10485760'); // 10MB in bytes
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: '/api/:path*',
};