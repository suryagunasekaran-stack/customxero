// lib/xeroToken.ts
import Redis from 'ioredis';

// Initialize Redis client. Replace with your Redis connection string if not running locally on default port.
// Make sure your Redis server is running.
const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

const XERO_TOKEN_KEY = 'xero_token'; // Key for storing the token in Redis
const XERO_TENANTS_KEY = 'xero_tenants'; // Key for storing available tenants
const XERO_SELECTED_TENANT_KEY = 'xero_selected_tenant'; // Key for storing selected tenant

export interface XeroTenant {
  tenantId: string;
  tenantName: string;
  tenantType: string;
  createdDateUtc: string;
  updatedDateUtc: string;
}

export interface XeroTokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Timestamp (Date.now() + expires_in * 1000)
  tenant_id: string; // Keep for backward compatibility, but use selected tenant
  scope: string;
  token_type: string;
  available_tenants?: XeroTenant[]; // Store all available tenants
}

export async function saveToken(tokenData: XeroTokenData): Promise<void> {
  try {
    // Ensure all fields are present, especially for logging
    const dataToSave: XeroTokenData = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: tokenData.expires_at,
      tenant_id: tokenData.tenant_id,
      scope: tokenData.scope || '', // Provide default if undefined
      token_type: tokenData.token_type || '', // Provide default if undefined
      available_tenants: tokenData.available_tenants || []
    };

    const secondsUntilExpiry = Math.max(0, Math.floor((dataToSave.expires_at - Date.now()) / 1000));
    
    console.log('[saveToken] Attempting to save token to Redis.');
    console.log('[saveToken] Key:', XERO_TOKEN_KEY);
    console.log('[saveToken] Expires in seconds (calculated):', secondsUntilExpiry);
    console.log('[saveToken] Token data being saved (JSON):', JSON.stringify(dataToSave));

    if (secondsUntilExpiry <= 0) {
        console.warn('[saveToken] Calculated expiry is zero or negative. Token might expire immediately or not be set with TTL if Redis does not support 0 for indefinite.');
    }
    if (!dataToSave.access_token || !dataToSave.refresh_token || !dataToSave.tenant_id) {
        console.error('[saveToken] Critical token data missing before save:', { hasAccessToken: !!dataToSave.access_token, hasRefreshToken: !!dataToSave.refresh_token, hasTenantId: !!dataToSave.tenant_id });
        throw new Error('Critical token data missing before save');
    }

    await redis.set(XERO_TOKEN_KEY, JSON.stringify(dataToSave), 'EX', secondsUntilExpiry);
    console.log('[saveToken] Token successfully saved to Redis.');
  } catch (error) {
    console.error('[saveToken] Failed to save token to Redis:', error);
    throw new Error('Failed to save token to Redis'); // Re-throw to indicate failure
  }
}

export async function loadToken(): Promise<XeroTokenData | null> {
  console.log('[loadToken] Attempting to load token from Redis. Key:', XERO_TOKEN_KEY);
  try {
    const tokenString = await redis.get(XERO_TOKEN_KEY);
    if (tokenString) {
      console.log('[loadToken] Token string found in Redis:', tokenString);
      const token: XeroTokenData = JSON.parse(tokenString);
      // Validate essential fields after loading
      if (!token.access_token || !token.refresh_token || !token.tenant_id) {
        console.error('[loadToken] Loaded token is missing critical data:', token);
        // Optionally, delete the corrupted token from Redis
        // await redis.del(XERO_TOKEN_KEY);
        // console.log('[loadToken] Deleted corrupted token from Redis.');
        return null; 
      }
      console.log('[loadToken] Token successfully loaded and parsed from Redis:', token);
      return token;
    }
    console.log('[loadToken] No token string found in Redis for key:', XERO_TOKEN_KEY);
    return null;
  } catch (error) {
    console.error('[loadToken] Failed to load or parse token from Redis:', error);
    return null;
  }
}

// Save available tenants
export async function saveTenants(tenants: XeroTenant[]): Promise<void> {
  try {
    await redis.set(XERO_TENANTS_KEY, JSON.stringify(tenants));
    console.log('[saveTenants] Available tenants saved to Redis:', tenants);
  } catch (error) {
    console.error('[saveTenants] Failed to save tenants to Redis:', error);
    throw new Error('Failed to save tenants to Redis');
  }
}

// Load available tenants
export async function loadTenants(): Promise<XeroTenant[] | null> {
  try {
    const tenantsString = await redis.get(XERO_TENANTS_KEY);
    if (tenantsString) {
      const tenants: XeroTenant[] = JSON.parse(tenantsString);
      console.log('[loadTenants] Tenants loaded from Redis:', tenants);
      return tenants;
    }
    console.log('[loadTenants] No tenants found in Redis');
    return null;
  } catch (error) {
    console.error('[loadTenants] Failed to load tenants from Redis:', error);
    return null;
  }
}

// Save selected tenant ID
export async function saveSelectedTenant(tenantId: string): Promise<void> {
  try {
    await redis.set(XERO_SELECTED_TENANT_KEY, tenantId);
    console.log('[saveSelectedTenant] Selected tenant saved to Redis:', tenantId);
  } catch (error) {
    console.error('[saveSelectedTenant] Failed to save selected tenant to Redis:', error);
    throw new Error('Failed to save selected tenant to Redis');
  }
}

// Load selected tenant ID
export async function loadSelectedTenant(): Promise<string | null> {
  try {
    const tenantId = await redis.get(XERO_SELECTED_TENANT_KEY);
    if (tenantId) {
      console.log('[loadSelectedTenant] Selected tenant loaded from Redis:', tenantId);
      return tenantId;
    }
    console.log('[loadSelectedTenant] No selected tenant found in Redis');
    return null;
  } catch (error) {
    console.error('[loadSelectedTenant] Failed to load selected tenant from Redis:', error);
    return null;
  }
}

// Get the effective tenant ID (selected tenant or fallback to token tenant_id)
export async function getEffectiveTenantId(): Promise<string | null> {
  const selectedTenant = await loadSelectedTenant();
  if (selectedTenant) {
    return selectedTenant;
  }
  
  const token = await loadToken();
  return token?.tenant_id || null;
}

// Optional: Function to delete token (e.g., on explicit logout)
export async function deleteToken(): Promise<void> {
  try {
    await redis.del(XERO_TOKEN_KEY);
    await redis.del(XERO_TENANTS_KEY);
    await redis.del(XERO_SELECTED_TENANT_KEY);
    console.log('Token and tenant data deleted from Redis');
  } catch (error) {
    console.error('Failed to delete token from Redis:', error);
    // Handle error as needed
  }
}
