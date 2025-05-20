// lib/xeroToken.ts
import fs from 'fs/promises';
import path from 'path';

const tokenPath = path.resolve('.xero-token.json');

export type XeroTokenData = {
    access_token: string;
    refresh_token: string;
    expires_at: number;      // Unix timestamp
    tenant_id: string;
};

export async function saveToken(token: XeroTokenData) {
    await fs.writeFile(tokenPath, JSON.stringify(token, null, 2));
}

export async function loadToken(): Promise<XeroTokenData | null> {
    try {
        const raw = await fs.readFile(tokenPath, 'utf-8');
        return JSON.parse(raw);
    } catch {
        return null;
    }
}
