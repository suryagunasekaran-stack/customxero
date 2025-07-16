import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Middleware runs in Edge Runtime - cannot use Node.js-only features like Redis
export async function middleware(request: NextRequest) {
  // Get the pathname
  const pathname = request.nextUrl.pathname;
  
  // For API routes, check authentication
  if (pathname.startsWith('/api/')) {
    const token = await getToken({ 
      req: request,
      secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
    });
    
    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }
    
    // Check for token errors
    if (token.error === 'RefreshAccessTokenError' || token.error === 'NoRefreshToken') {
      return NextResponse.json(
        { error: 'Token expired', message: 'Please re-authenticate' },
        { status: 401 }
      );
    }
    
    return NextResponse.next();
  }
  
  // For page routes, redirect to login if not authenticated
  const token = await getToken({ 
    req: request,
    secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  });
  
  if (!token) {
    // Redirect to login page with callback URL
    const url = new URL('/', request.url);
    url.searchParams.set('callbackUrl', request.url);
    return NextResponse.redirect(url);
  }
  
  // Check for token errors that require re-authentication
  if (token.error === 'RefreshAccessTokenError' || token.error === 'NoRefreshToken') {
    // Clear the session and redirect to login
    const response = NextResponse.redirect(new URL('/', request.url));
    // Clear both possible cookie names
    response.cookies.delete('next-auth.session-token');
    response.cookies.delete('__Secure-next-auth.session-token');
    response.cookies.delete('next-auth.callback-url');
    response.cookies.delete('__Secure-next-auth.callback-url');
    return response;
  }
  
  // Allow the request to continue
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/organisation/:path*",
    "/api/tenants/:path*", 
    "/api/xero/:path*",
    "/api/pipedrive/:path*",
    "/api/projects-inprogress/:path*"
  ]
}