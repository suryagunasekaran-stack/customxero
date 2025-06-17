import NextAuth from "next-auth"
import type { NextAuthConfig } from "next-auth"

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
        request: async (context: any) => {
          // Return the ID token claims instead of calling userinfo
          return context.tokens.id_token ? JSON.parse(Buffer.from(context.tokens.id_token.split('.')[1], 'base64').toString()) : {};
        }
      },
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name || `${profile.given_name} ${profile.family_name}`,
          email: profile.email || profile.preferred_username,
        }
      },
    },
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account?.access_token) {
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
        token.expiresAt = account.expires_at
        
        // Get tenantId from Xero connections
        try {
          const res = await fetch("https://api.xero.com/connections", {
            headers: {
              Authorization: `Bearer ${account.access_token}`,
              Accept: "application/json",
            },
          })
          if (res.ok) {
            const connections = await res.json()
            token.tenants = connections
            // Set default tenant to first one (user can change later)
            token.tenantId = connections[0]?.tenantId
          }
        } catch (error) {
          console.error("Failed to fetch Xero connections:", error)
        }
      }
      
      // Return previous token if the access token has not expired yet
      if (Date.now() < (token.expiresAt as number) * 1000) {
        return token
      }
      
      // Access token has expired, try to update it
      return refreshAccessToken(token)
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string
      session.refreshToken = token.refreshToken as string
      session.expiresAt = token.expiresAt as number
      session.tenantId = token.tenantId as string
      session.tenants = token.tenants as any[]
      session.error = token.error as string | undefined
      return session
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
    // Disable issuer validation to fix Xero OAuth
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
}

async function refreshAccessToken(token: any) {
  try {
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
        refresh_token: token.refreshToken,
      }),
    })

    const refreshedTokens = await response.json()

    if (!response.ok) {
      throw refreshedTokens
    }

    return {
      ...token,
      accessToken: refreshedTokens.access_token,
      expiresAt: Date.now() / 1000 + refreshedTokens.expires_in,
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
    }
  } catch (error) {
    console.error("Error refreshing access token", error)
    return {
      ...token,
      error: "RefreshAccessTokenError",
    }
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig) 