import { JWT } from "next-auth/jwt"
import { Session } from "next-auth"

declare module "next-auth" {
  interface Session {
    accessToken: string
    refreshToken: string
    expiresAt: number
    tenantId?: string
    tenants?: any[]
    error?: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string
    refreshToken?: string
    expiresAt?: number
    tenantId?: string
    tenants?: any[]
    error?: string
  }
} 