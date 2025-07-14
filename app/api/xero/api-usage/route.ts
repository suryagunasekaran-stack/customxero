import { NextResponse } from 'next/server';
import { getXeroApiUsage } from '@/lib/xeroApiTracker';
import { ensureValidToken } from '@/lib/ensureXeroToken';
import { createAuthResponse } from '@/lib/authErrorHandler';

export async function GET() {
  try {
    // Get the current effective tenant ID
    const { effective_tenant_id } = await ensureValidToken();
    const usage = await getXeroApiUsage(effective_tenant_id);
    
    if (!usage) {
      // Return default usage data if none exists
      const now = new Date();
      const resetTime = new Date();
      resetTime.setUTCHours(24, 0, 0, 0);
      
      return NextResponse.json({
        dailyLimit: 5000,
        usedToday: 0,
        remainingToday: 5000,
        minuteLimit: 60,
        usedThisMinute: 0,
        remainingThisMinute: 60,
        lastUpdated: now.toISOString(),
        resetTime: resetTime.toISOString()
      });
    }
    
    return NextResponse.json(usage);
  } catch (error) {
    console.error('[Xero API Usage Route] Error fetching usage:', error);
    
    // Check if this is an auth error
    const authResponse = createAuthResponse(error);
    if (authResponse) {
      return NextResponse.json(authResponse, { status: 401 });
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch API usage data' },
      { status: 500 }
    );
  }
} 