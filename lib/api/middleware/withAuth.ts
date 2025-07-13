import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { ensureValidToken } from '@/lib/ensureXeroToken';

export interface AuthContext {
  session: any; // TODO: Add proper session type
  accessToken: string;
  tenantId: string;
  tenantName: string;
  availableTenants: Array<{
    tenantId: string;
    tenantName: string;
    tenantType: string;
  }>;
}

export type AuthenticatedHandler = (
  request: NextRequest,
  context: AuthContext
) => Promise<NextResponse>;

/**
 * Middleware to handle authentication for API routes
 * Ensures user is authenticated and has valid Xero token
 */
export function withAuth(handler: AuthenticatedHandler) {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      // Check session
      const session = await auth();
      
      if (!session) {
        return NextResponse.json(
          { error: 'Not authenticated' },
          { status: 401 }
        );
      }

      // Get valid Xero token
      const tokenResult = await ensureValidToken();
      
      if (!tokenResult.access_token || !tokenResult.effective_tenant_id) {
        return NextResponse.json(
          { error: 'Invalid or expired Xero token' },
          { status: 401 }
        );
      }

      const { access_token, effective_tenant_id, available_tenants } = tokenResult;
      
      // Find selected tenant
      const selectedTenant = available_tenants?.find(
        t => t.tenantId === effective_tenant_id
      );

      if (!selectedTenant) {
        return NextResponse.json(
          { error: 'No valid tenant selected' },
          { status: 400 }
        );
      }

      // Create auth context
      const context: AuthContext = {
        session,
        accessToken: access_token,
        tenantId: effective_tenant_id,
        tenantName: selectedTenant.tenantName || 'Unknown',
        availableTenants: available_tenants || []
      };

      // Call the handler with auth context
      return await handler(request, context);
      
    } catch (error) {
      console.error('[Auth Middleware] Error:', error);
      
      // Check for specific error types
      if (error instanceof Error) {
        if (error.message.includes('token')) {
          return NextResponse.json(
            { error: 'Token refresh failed. Please re-authenticate.' },
            { status: 401 }
          );
        }
      }
      
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      );
    }
  };
}

// Type guard to check if request has auth context
export function hasAuthContext(
  request: NextRequest
): request is NextRequest & { auth: AuthContext } {
  return 'auth' in request && request.auth !== undefined;
}