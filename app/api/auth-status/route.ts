// app/api/auth-status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

/**
 * GET /api/auth-status - Get current authentication status and token info
 * Useful for debugging token refresh issues
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session) {
      return NextResponse.json({
        authenticated: false,
        message: 'No active session'
      });
    }
    
    const now = Date.now() / 1000;
    const expiresAt = session.expiresAt || 0;
    const timeUntilExpiry = expiresAt - now;
    
    return NextResponse.json({
      authenticated: true,
      user: session.user?.email,
      hasAccessToken: !!session.accessToken,
      hasRefreshToken: !!session.refreshToken,
      tokenExpiresAt: session.expiresAt ? new Date(session.expiresAt * 1000).toISOString() : null,
      tokenExpiresIn: {
        seconds: Math.floor(timeUntilExpiry),
        minutes: Math.floor(timeUntilExpiry / 60),
        human: timeUntilExpiry > 0 
          ? `${Math.floor(timeUntilExpiry / 60)} minutes ${Math.floor(timeUntilExpiry % 60)} seconds`
          : 'Expired'
      },
      isExpired: timeUntilExpiry <= 0,
      willExpireSoon: timeUntilExpiry > 0 && timeUntilExpiry <= 300, // 5 minute buffer
      error: session.error,
      tenantId: session.tenantId,
      tenantsCount: session.tenants?.length || 0
    });
  } catch (error) {
    return NextResponse.json({
      authenticated: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}