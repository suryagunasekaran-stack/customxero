import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

/**
 * GET /api/connect
 * Initiates Xero OAuth flow when user needs to reconnect or fetch tenants
 * This is called when:
 * 1. User has no tenants available
 * 2. User needs to refresh their Xero connection
 * 3. Token has expired and needs re-authentication
 */
export async function GET(request: NextRequest) {
  try {
    // Check if user is authenticated
    const session = await auth();
    
    // Get the base URL from environment or request
    const baseUrl = process.env.NEXTAUTH_URL || 
                   `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    
    // Construct the sign-in URL with Xero provider
    const signInUrl = new URL('/api/auth/signin/xero', baseUrl);
    
    // Add callback URL to redirect after successful authentication
    signInUrl.searchParams.set('callbackUrl', '/organisation/xero');
    
    // If user is already authenticated but needs to reconnect
    if (session?.user) {
      console.log('[Connect API] User authenticated but reconnecting:', session.user.email);
      // You might want to clear existing tokens here
      // await XeroTokenStore.clearUserTokens(session.user.email);
    }
    
    // Redirect to Xero OAuth sign-in
    return NextResponse.redirect(signInUrl.toString());
    
  } catch (error) {
    console.error('[Connect API] Error:', error);
    
    // On error, redirect to error page
    const errorUrl = new URL('/auth/error', request.nextUrl.origin);
    errorUrl.searchParams.set('error', 'OAuthSignin');
    
    return NextResponse.redirect(errorUrl.toString());
  }
}

/**
 * POST /api/connect
 * Alternative method to initiate connection via API call
 */
export async function POST(request: NextRequest) {
  try {
    const baseUrl = process.env.NEXTAUTH_URL || 
                   `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    
    // Return the sign-in URL for client-side redirect
    const signInUrl = new URL('/api/auth/signin/xero', baseUrl);
    signInUrl.searchParams.set('callbackUrl', '/organisation/xero');
    
    return NextResponse.json({
      success: true,
      redirectUrl: signInUrl.toString()
    });
    
  } catch (error) {
    console.error('[Connect API] POST Error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to initiate Xero connection'
    }, { status: 500 });
  }
}