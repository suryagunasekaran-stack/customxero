import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  
  // Skip middleware for auth routes and static files
  if (
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/_next') ||
    pathname.includes('.') // static files
  ) {
    return NextResponse.next();
  }
  
  // Check if this is a protected route
  const isProtectedRoute = 
    pathname.startsWith('/organisation') ||
    pathname.startsWith('/api/tenants') ||
    pathname.startsWith('/api/xero') ||
    pathname.startsWith('/api/pipedrive') ||
    pathname.startsWith('/api/projects-inprogress');
  
  if (!isProtectedRoute) {
    return NextResponse.next();
  }
  
  try {
    // Try to get the token
    const token = await getToken({ 
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    
    // Also check for session cookies as fallback
    const sessionCookie = 
      request.cookies.get('next-auth.session-token') || 
      request.cookies.get('__Secure-next-auth.session-token');
    
    // Debug logging for /organisation/xero
    if (pathname === '/organisation/xero') {
      console.log('[Middleware] Debug info:');
      console.log('- Token exists:', !!token);
      console.log('- Session cookie exists:', !!sessionCookie);
      console.log('- All cookies:', request.cookies.getAll().map(c => ({ name: c.name, value: c.value ? 'exists' : 'empty' })));
      console.log('- URL:', request.url);
    }
    
    // Allow access if either token or session cookie exists
    if (token || sessionCookie) {
      // Check for token errors if token exists
      if (token && (token.error === 'RefreshAccessTokenError' || token.error === 'NoRefreshToken')) {
        const response = NextResponse.redirect(new URL('/', request.url));
        response.cookies.delete('next-auth.session-token');
        response.cookies.delete('__Secure-next-auth.session-token');
        return response;
      }
      
      return NextResponse.next();
    }
    
    // No authentication found, redirect to login
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    } else {
      const url = new URL('/', request.url);
      url.searchParams.set('callbackUrl', request.url);
      return NextResponse.redirect(url, { status: 307 });
    }
  } catch (error) {
    console.error('[Middleware] Error:', error);
    // If there's an error, check for session cookie as last resort
    const sessionCookie = 
      request.cookies.get('next-auth.session-token') || 
      request.cookies.get('__Secure-next-auth.session-token');
    
    if (sessionCookie) {
      return NextResponse.next();
    }
    
    // Redirect to login on error
    const url = new URL('/', request.url);
    url.searchParams.set('callbackUrl', request.url);
    return NextResponse.redirect(url, { status: 307 });
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ]
}