# Vercel Deployment Checklist

## Required Environment Variables

You MUST set these environment variables in your Vercel project settings:

### 1. **AUTH_SECRET** (CRITICAL)
```bash
# Generate a random secret:
openssl rand -base64 32
```
- This is required for NextAuth to encrypt JWT tokens
- Without this, you'll get "Configuration" error
- Must be at least 32 characters long

### 2. **CLIENT_ID**
- Your Xero OAuth2 application Client ID
- Get from: https://developer.xero.com/myapps

### 3. **CLIENT_SECRET**
- Your Xero OAuth2 application Client Secret
- Get from: https://developer.xero.com/myapps

### 4. **REDIS_URL**
- Your Redis connection URL
- Format: `redis://username:password@host:port`
- Or use Vercel KV: `redis://default:YOUR_TOKEN@YOUR_ENDPOINT.kv.vercel-storage.com`

### 5. **NEXTAUTH_URL** (Optional but recommended)
- Set to your production URL: `https://your-app.vercel.app`
- NextAuth will try to detect it automatically, but explicit is better

## Vercel Setup Steps

1. **Set Environment Variables in Vercel Dashboard:**
   ```
   Go to: Your Project → Settings → Environment Variables
   ```

2. **Add each variable:**
   - Name: `AUTH_SECRET`
   - Value: (your generated secret)
   - Environment: ✓ Production, ✓ Preview, ✓ Development

3. **Verify Xero OAuth Settings:**
   - Go to https://developer.xero.com/myapps
   - Add your Vercel URL to redirect URIs:
     - `https://your-app.vercel.app/api/auth/callback/xero`
     - `https://your-app-*.vercel.app/api/auth/callback/xero` (for preview deployments)

4. **Deploy:**
   ```bash
   vercel --prod
   ```

## Common Issues and Solutions

### "Configuration" Error
- **Cause**: Missing `AUTH_SECRET` environment variable
- **Fix**: Add `AUTH_SECRET` in Vercel dashboard

### "ECONNREFUSED" or Redis Errors
- **Cause**: Invalid or missing `REDIS_URL`
- **Fix**: Verify Redis URL is correct and accessible

### OAuth Callback Error
- **Cause**: Redirect URI not configured in Xero
- **Fix**: Add Vercel URLs to Xero app redirect URIs

### Token Refresh Failures
- **Cause**: Clock drift or network issues
- **Fix**: The app now has retry logic and distributed locks

## Testing Your Deployment

1. **Check Environment Variables:**
   ```bash
   vercel env pull
   ```

2. **Test Redis Connection:**
   Visit: `https://your-app.vercel.app/api/test/redis`

3. **Monitor Logs:**
   ```bash
   vercel logs --follow
   ```

## Production Best Practices

1. **Use Production Redis:**
   - Don't use free Redis tiers for production
   - Consider Vercel KV or Redis Cloud

2. **Monitor Rate Limits:**
   - Check `/api/xero/api-usage` endpoint
   - Set up alerts for high usage

3. **Enable Logging:**
   - Use Vercel's log drain feature
   - Monitor authentication errors

4. **Security:**
   - Rotate `AUTH_SECRET` periodically
   - Use strong passwords for Redis
   - Enable Redis SSL/TLS if available

## Quick Debug Commands

```bash
# Check if site is up
curl -I https://your-app.vercel.app

# Test auth endpoint
curl https://your-app.vercel.app/api/auth/providers

# Check Redis (after auth)
curl https://your-app.vercel.app/api/test/redis
```

## Environment Variable Template

Create a `.env.production` file (DO NOT COMMIT):

```env
AUTH_SECRET=your-generated-secret-here
CLIENT_ID=your-xero-client-id
CLIENT_SECRET=your-xero-client-secret
REDIS_URL=redis://default:password@endpoint.com:6379
NEXTAUTH_URL=https://your-app.vercel.app
```

Then in Vercel, copy these values to the Environment Variables section.