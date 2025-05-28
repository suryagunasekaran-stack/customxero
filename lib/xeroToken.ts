// lib/xeroToken.ts
import Redis from 'ioredis';

// Initialize Redis client. Replace with your Redis connection string if not running locally on default port.
// Make sure your Redis server is running.
const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

const XERO_TOKEN_KEY = 'xero_token'; // Key for storing the token in Redis

export interface XeroTokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Timestamp (Date.now() + expires_in * 1000)
  tenant_id: string;
  scope: string;
  token_type: string;
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
      token_type: tokenData.token_type || '' // Provide default if undefined
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

// Optional: Function to delete token (e.g., on explicit logout)
export async function deleteToken(): Promise<void> {
  try {
    await redis.del(XERO_TOKEN_KEY);
    console.log('Token deleted from Redis');
  } catch (error) {
    console.error('Failed to delete token from Redis:', error);
    // Handle error as needed
  }
}
