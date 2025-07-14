import { JWT } from "next-auth/jwt";
import { Session, User } from "next-auth";

/**
 * Xero tenant information
 */
export interface XeroTenant {
  tenantId: string;
  tenantName: string;
  tenantType: string;
  createdDateUtc: string;
  updatedDateUtc: string;
}

/**
 * OAuth tokens from Xero
 */
export interface XeroTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  id_token?: string;
}

/**
 * Extended JWT token with Xero-specific fields
 */
export interface XeroJWT extends JWT {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  error?: string;
  tenants?: XeroTenant[];
}

/**
 * Extended session with Xero tenants
 */
export interface XeroSession extends Session {
  tenants?: XeroTenant[];
  error?: string;
}

/**
 * User info context for OAuth provider
 */
export interface UserInfoContext {
  tokens: {
    access_token?: string;
    id_token?: string;
    refresh_token?: string;
    expires_at?: number;
  };
  provider: {
    id: string;
    name: string;
  };
}

/**
 * Token refresh response from Xero
 */
export interface TokenRefreshResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  id_token?: string;
}

/**
 * Decoded JWT claims
 */
export interface DecodedToken {
  sub?: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
  xero_userid?: string;
  iss?: string;
  aud?: string;
  exp?: number;
  iat?: number;
  nbf?: number;
}