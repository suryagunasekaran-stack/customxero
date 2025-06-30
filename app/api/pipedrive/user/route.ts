import { NextResponse } from 'next/server';
import { ensureValidToken } from '@/lib/ensureXeroToken';

// Tenant-specific Pipedrive configuration
const TENANT_PIPEDRIVE_CONFIG = {
  '6dd39ea4-e6a6-4993-a37a-21482ccf8d22': {
    apiKey: process.env.PIPEDRIVE_KEY,
    enabled: true,
    description: 'Tenant 1'
  },
  'ea67107e-c352-40a9-a8b8-24d81ae3fc85': {
    apiKey: process.env.PIPEDRIVE_KEY_2,
    enabled: true,
    description: 'Tenant 2'
  },
  'ab4b2a02-e700-4fe8-a32d-5419d4195e1b': {
    apiKey: null,
    enabled: false,
    description: 'Tenant 3 (Pipedrive disabled)'
  }
};

/**
 * GET /api/pipedrive/user - Fetches current user information from Pipedrive API
 * Retrieves user details including company name
 * Uses tenant-specific API keys
 * @returns {Promise<NextResponse>} JSON response with user data or error
 */
export async function GET() {
  try {
    // Get the current tenant information
    const { effective_tenant_id } = await ensureValidToken();
    
    // Get tenant-specific Pipedrive configuration
    const tenantConfig = TENANT_PIPEDRIVE_CONFIG[effective_tenant_id as keyof typeof TENANT_PIPEDRIVE_CONFIG];
    
    if (!tenantConfig) {
      return NextResponse.json(
        { message: 'Pipedrive integration not configured for this tenant.' },
        { status: 403 }
      );
    }

    if (!tenantConfig.enabled) {
      return NextResponse.json(
        { message: 'Pipedrive integration is disabled for this organization.' },
        { status: 403 }
      );
    }

    const apiKey = tenantConfig.apiKey;

    if (!apiKey) {
      return NextResponse.json(
        { message: 'Pipedrive API key is not configured for this tenant.' },
        { status: 500 }
      );
    }

    // Fetch user information
    const userApiUrl = `https://api.pipedrive.com/v1/users/me?api_token=${apiKey}`;
    const response = await fetch(userApiUrl, { 
      headers: { 'Accept': 'application/json' } 
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`API Error fetching Pipedrive user: ${response.status} ${response.statusText}`, errorBody);
      return NextResponse.json(
        { message: 'Error fetching Pipedrive user information', error: errorBody },
        { status: response.status }
      );
    }

    const userData = await response.json();
    
    if (!userData.success) {
      return NextResponse.json(
        { message: 'Pipedrive API returned unsuccessful response', error: userData },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true,
      data: {
        companyName: userData.data.company_name,
        companyId: userData.data.company_id,
        userName: userData.data.name,
        email: userData.data.email,
        tenantId: effective_tenant_id,
        tenantDescription: tenantConfig.description
      }
    });

  } catch (error) {
    console.error('API Error in Pipedrive user route:', error);
    return NextResponse.json(
      { message: 'Internal server error', error: (error as Error).message },
      { status: 500 }
    );
  }
} 