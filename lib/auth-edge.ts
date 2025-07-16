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

// Edge-compatible auth configuration without Redis imports
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
              console.warn('[Auth] Invalid ID token format');
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
      const fiveMinutesInMs = 5 * 60 * 1000;
      if (token.expires_at && Date.now() < ((token.expires_at as number) * 1000 - fiveMinutesInMs)) {
        return token as XeroJWT
      }
      
      // If token already has an error, don't try to refresh again
      if (token.error) {
        return token as XeroJWT
      }
      
      // Access token has expired, try to refresh it
      return refreshAccessToken(token as XeroJWT)
    },
    async session({ session, token }): Promise<XeroSession> {
      const xeroToken = token as XeroJWT;
      const xeroSession = session as XeroSession;
      
      xeroSession.error = xeroToken.error;
      xeroSession.tenants = xeroToken.tenants || [];
      if (xeroToken.access_token) {
        xeroSession.accessToken = xeroToken.access_token;
      }
      xeroSession.tenantId = xeroToken.tenants?.[0]?.tenantId;
      
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
  trustHost: true,
}

async function refreshAccessToken(token: XeroJWT): Promise<XeroJWT> {
  try {
    console.log(`[Auth] Attempting to refresh token at ${new Date().toISOString()}`);
    
    if (!token.refresh_token) {
      console.error('[Auth] No refresh token available');
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
      console.error('[Auth] Token refresh failed:', refreshedTokens);
      throw new Error(refreshedTokens.error || 'Token refresh failed')
    }

    console.log('[Auth] Token refreshed successfully');

    const tokenResponse = refreshedTokens as TokenRefreshResponse;

    const updatedToken: XeroJWT = {
      ...token,
      access_token: tokenResponse.access_token,
      expires_at: Math.floor(Date.now() / 1000) + tokenResponse.expires_in,
      refresh_token: tokenResponse.refresh_token ?? token.refresh_token,
      error: undefined
    };

    // Update tenants if we have a new refresh token
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