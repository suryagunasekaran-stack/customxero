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
    // Store the token in Redis, setting an expiry that matches the token's actual expiry
    // This helps Redis automatically clean up expired tokens.
    // expires_at is a timestamp, so calculate seconds from now.
    const secondsUntilExpiry = Math.max(0, Math.floor((tokenData.expires_at - Date.now()) / 1000));
    await redis.set(XERO_TOKEN_KEY, JSON.stringify(tokenData), 'EX', secondsUntilExpiry);
    console.log('Token saved to Redis');
  } catch (error) {
    console.error('Failed to save token to Redis:', error);
    throw new Error('Failed to save token');
  }
}

export async function loadToken(): Promise<XeroTokenData | null> {
  try {
    const tokenString = await redis.get(XERO_TOKEN_KEY);
    if (tokenString) {
      const token: XeroTokenData = JSON.parse(tokenString);
      console.log('Token loaded from Redis');
      return token;
    }
    console.log('No token found in Redis');
    return null;
  } catch (error) {
    console.error('Failed to load token from Redis:', error);
    // For other errors, you might want to throw or handle differently
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
