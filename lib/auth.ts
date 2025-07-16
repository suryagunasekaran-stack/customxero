import NextAuth from "next-auth"
import type { NextAuthConfig } from "next-auth"
import type { 
  XeroJWT, 
  XeroSession, 
  UserInfoContext, 
  DecodedToken,
  TokenRefreshResponse,
  XeroTenant 
} from "@/types/auth.types"
import { withDistributedLockRetry } from "./redis/redisClient"

/**
 * Dynamically imports XeroTokenStore to avoid edge runtime issues
 * The Redis client is not compatible with edge runtime
 * @returns {Promise<typeof import('./redis/xeroTokenStore').XeroTokenStore>} The XeroTokenStore class
 */
const getXeroTokenStore = async () => {
  const { XeroTokenStore } = await import('./redis/xeroTokenStore');
  return XeroTokenStore;
};

export const authConfig: NextAuthConfig = {
  providers: [
    {
      id: "xero",
      name: "Xero",
      type: "oauth",
      issuer: "https://identity.xero.com",
      clientId: process.env.CLIENT_ID!,
      clientSecret: process.env.CLIENT_SECRET!,
      checks: ["pkce", "state"],
      authorization: {
        params: {
          scope: "openid profile email offline_access accounting.transactions projects",
        },
      },
      userinfo: {
        request: async (context: UserInfoContext) => {
          // Return the ID token claims instead of calling userinfo with proper error handling
          try {
            if (!context?.tokens?.id_token) {
              console.warn('[Auth] No ID token available');
              return {};
            }
            
            const idToken = context.tokens.id_token;
            if (typeof idToken !== 'string') {
              console.warn('[Auth] ID token is not a string');
              return {};
            }
            
            const tokenParts = idToken.split('.');
            if (tokenParts.length !== 3) {
              console.warn('[Auth] Invalid ID token format - expected 3 parts, got:', tokenParts.length);
              return {};
            }
            
            const payload = tokenParts[1];
            if (!payload) {
              console.warn('[Auth] No payload in ID token');
              return {};
            }
            
            const decoded = Buffer.from(payload, 'base64').toString();
            return JSON.parse(decoded) as DecodedToken;
          } catch (error) {
            console.error('[Auth] Error parsing ID token:', error);
            return {};
          }
        }
      },
      profile(profile: DecodedToken) {
        return {
          id: profile.sub,
          name: profile.name || `${profile.given_name} ${profile.family_name}`,
          email: profile.email || profile.preferred_username,
        }
      },
    },
  ],
  callbacks: {
    async jwt({ token, account }): Promise<XeroJWT> {
      if (account?.access_token) {
        token.access_token = account.access_token
        token.refresh_token = account.refresh_token
        token.expires_at = account.expires_at
        
        // Get tenantId from Xero connections
        try {
          const res = await fetch("https://api.xero.com/connections", {
            headers: {
              Authorization: `Bearer ${account.access_token}`,
              Accept: "application/json",
            },
          })
          if (res.ok) {
            const connections: XeroTenant[] = await res.json()
            token.tenants = connections
          }
        } catch (error) {
          console.error("Failed to fetch Xero connections:", error)
        }
      }
      
      // Return previous token if the access token has not expired yet
      // Use a 5 minute buffer to refresh tokens proactively
      const fiveMinutesInMs = 5 * 60 * 1000;
      if (token.expires_at && Date.now() < ((token.expires_at as number) * 1000 - fiveMinutesInMs)) {
        return token as XeroJWT
      }
      
      // If token already has an error, don't try to refresh again
      if (token.error) {
        return token as XeroJWT
      }
      
      // Access token has expired or will expire soon, try to update it
      // Use distributed lock to prevent concurrent refreshes
      try {
        const userId = token.email || token.sub || 'unknown';
        return await withDistributedLockRetry(
          `token-refresh:${userId}`,
          15, // 15 second lock TTL
          async () => refreshAccessToken(token as XeroJWT),
          1, // Only 1 retry
          2000 // 2 second delay
        );
      } catch (lockError) {
        console.error('[Auth] Failed to acquire refresh lock:', lockError);
        // If we can't get the lock, another process is refreshing
        // Return current token and let the next request try again
        return token as XeroJWT;
      }
    },
    async session({ session, token }): Promise<XeroSession> {
      const xeroToken = token as XeroJWT;
      const xeroSession = session as XeroSession;
      
      xeroSession.error = xeroToken.error;
      
      // Get tenant data from token
      xeroSession.tenants = xeroToken.tenants || [];
      
      // Store the token in cache for access by other parts of the app
      if (xeroToken.expires_at && xeroToken.access_token && xeroToken.refresh_token) {
        try {
          const TokenStore = await getXeroTokenStore();
          
          await TokenStore.updateToken(
            session.user?.email || '',
            xeroToken.access_token,
            xeroToken.refresh_token,
            xeroToken.expires_at,
            xeroToken.tenants || []
          );
        } catch (error) {
          console.error('[Auth] Failed to store token in cache:', error);
        }
      }
      
      // Try to get selected tenant from Redis (with error handling)
      try {
        if (session.user?.email && typeof session.user.email === 'string' && session.user.email.trim()) {
          const TokenStore = await getXeroTokenStore();
          const selectedTenant = await TokenStore.getSelectedTenant(session.user.email);
          if (selectedTenant) {
            session.tenantId = selectedTenant;
          }
        }
      } catch (error) {
        // Continue with token tenant if Redis fails
        console.warn('[Auth] Failed to get selected tenant:', error);
      }
      
      return xeroSession
    },
  },
  pages: {
    signIn: "/",
    error: "/auth/error",
  },
  session: {
    strategy: "jwt",
  },
  jwt: {
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
}

/**
 * Refreshes an expired Xero access token using the refresh token
 * @param {XeroJWT} token - The current token object containing refresh token
 * @returns {Promise<XeroJWT>} Updated token object with new access token or error state
 */
async function refreshAccessToken(token: XeroJWT): Promise<XeroJWT> {
  try {
    // Log refresh attempt for debugging
    console.log(`[Auth] Attempting to refresh token at ${new Date().toISOString()}`);
    
    if (!token.refresh_token) {
      console.error('[Auth] No refresh token available');
      // Return the token with an error flag instead of throwing
      return {
        ...token,
        error: 'NoRefreshToken'
      };
    }

    const response = await fetch("https://identity.xero.com/connect/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(
          `${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`
        ).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: token.refresh_token,
      }),
    })

    const refreshedTokens = await response.json()

    if (!response.ok) {
      console.error('[Auth] Token refresh failed:', {
        status: response.status,
        error: refreshedTokens.error || 'Unknown error',
        error_description: refreshedTokens.error_description || 'No description'
      });
      throw new Error(refreshedTokens.error || 'Token refresh failed')
    }

    console.log('[Auth] Token refreshed successfully');

    // Cast to TokenRefreshResponse after successful response
    const tokenResponse = refreshedTokens as TokenRefreshResponse;

    // Update token with new values
    const updatedToken: XeroJWT = {
      ...token,
      access_token: tokenResponse.access_token,
      expires_at: Math.floor(Date.now() / 1000) + tokenResponse.expires_in,
      refresh_token: tokenResponse.refresh_token ?? token.refresh_token,
      error: undefined // Clear any previous errors
    };

    // If we have a new refresh token, update tenants as well
    if (tokenResponse.refresh_token && tokenResponse.refresh_token !== token.refresh_token) {
      try {
        const res = await fetch("https://api.xero.com/connections", {
          headers: {
            Authorization: `Bearer ${tokenResponse.access_token}`,
            Accept: "application/json",
          },
        });
        if (res.ok) {
          const connections: XeroTenant[] = await res.json();
          updatedToken.tenants = connections;
        }
      } catch (error) {
        console.error("[Auth] Failed to update tenants after refresh:", error);
      }
    }

    return updatedToken;
  } catch (error) {
    console.error("[Auth] Error refreshing access token:", error);
    return {
      ...token,
      error: "RefreshAccessTokenError",
    }
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig)