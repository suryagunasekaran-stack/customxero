/**
 * API middleware for protected routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withRedisFallback } from '@/lib/redis';

export interface RouteContext {
  tenantId: string;
  session: any;
}

/**
 * Creates a protected route handler that requires authentication and tenant context
 */
export function createProtectedRoute(
  handler: (req: NextRequest, context: RouteContext) => Promise<Response>
) {
  return async (req: NextRequest) => {
    try {
      // Check authentication
      const session = await auth();
      if (!session || !session.user) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        );
      }

      // Try to get tenant ID from Redis, fallback to session if Redis fails
      let tenantId: string | null = null;
      
      // Try Redis first for the current selected tenant
      // Use email as userId to match XeroTokenStore pattern
      const userId = session.user.email || session.user.id;
      if (userId) {
        // Use XeroTokenStore method directly to ensure consistency
        try {
          const { XeroTokenStore } = await import('@/lib/redis/xeroTokenStore');
          
          // Try to get selected tenant with retry logic for serverless Redis issues
          tenantId = await XeroTokenStore.getSelectedTenant(userId);
          console.log(`[Middleware] Selected tenant for ${userId}: ${tenantId || 'not found (attempt 1)'}`);
          
          // If not found, retry once after a short delay (Redis replication lag)
          if (!tenantId) {
            console.log(`[Middleware] Retrying tenant lookup for ${userId}...`);
            await new Promise(resolve => setTimeout(resolve, 100));
            tenantId = await XeroTokenStore.getSelectedTenant(userId);
            console.log(`[Middleware] Retry result for ${userId}: ${tenantId || 'not found (attempt 2)'}`);
          }
        } catch (error) {
          console.error('[Middleware] Error getting selected tenant:', error);
        }
      }

      // If no tenant in Redis, try to get from session or XeroTokenStore
      if (!tenantId && userId) {
        // Try to get tenants from XeroTokenStore
        try {
          const { XeroTokenStore } = await import('@/lib/redis/xeroTokenStore');
          const storedTenants = await XeroTokenStore.getUserTenants(userId);
          
          if (storedTenants && storedTenants.length > 0) {
            // Check for any tenant marked as selected or use first one
            const selectedTenant = (session as any)?.selectedTenantId || (session as any)?.currentTenantId;
            if (selectedTenant) {
              tenantId = selectedTenant;
              console.log(`[Middleware] Using selected tenant from session: ${tenantId}`);
            } else {
              // Use first tenant as default
              tenantId = storedTenants[0].tenantId;
              console.log(`[Middleware] Using first tenant as default: ${tenantId}`);
              // Save it as selected for next time
              await XeroTokenStore.saveSelectedTenant(userId, tenantId);
            }
          } else if ((session as any).xeroTenants && (session as any).xeroTenants.length > 0) {
            // Fallback to session tenants
            tenantId = (session as any).xeroTenants[0].tenantId;
            console.log(`[Middleware] Using first tenant from session: ${tenantId}`);
          }
        } catch (error) {
          console.error('[Middleware] Error getting tenants from store:', error);
        }
      }

      if (!tenantId) {
        console.error('[Middleware] No tenant ID found', {
          hasSession: !!session,
          hasUser: !!session?.user,
          userId: session?.user?.id,
          hasXeroTenants: !!(session as any)?.xeroTenants,
          tenantsCount: (session as any)?.xeroTenants?.length || 0
        });
        return NextResponse.json(
          { success: false, error: 'No Xero tenant selected. Please select a tenant from the tenant selector.' },
          { status: 400 }
        );
      }

      // Create context
      const context: RouteContext = {
        tenantId,
        session
      };

      // Call the handler
      return handler(req, context);

    } catch (error) {
      console.error('Protected route error:', error);
      return NextResponse.json(
        { 
          success: false, 
          error: error instanceof Error ? error.message : 'Internal server error' 
        },
        { status: 500 }
      );
    }
  };
}

/**
 * Creates a public route handler (no authentication required)
 */
export function createPublicRoute(
  handler: (req: NextRequest) => Promise<Response>
) {
  return async (req: NextRequest) => {
    try {
      return handler(req);
    } catch (error) {
      console.error('Public route error:', error);
      return NextResponse.json(
        { 
          success: false, 
          error: error instanceof Error ? error.message : 'Internal server error' 
        },
        { status: 500 }
      );
    }
  };
}