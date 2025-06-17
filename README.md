# Xero Multi-User Integration App

A Next.js application for admin users to access extended Xero functionality with multi-user support, proper OAuth authentication, and tenant management.

## Features

- 🔐 **Multi-User Authentication**: Full support for multiple users with NextAuth.js
- 🏢 **Multi-Tenant Support**: Handle multiple Xero organizations per user
- 🔄 **Automatic Token Refresh**: Seamless token management with automatic refresh
- 💾 **Redis Session Storage**: Scalable session management for production
- 🎨 **Modern UI**: Beautiful interface with Tailwind CSS and Headless UI
- 📊 **API Usage Tracking**: Monitor Xero API usage per organization

## Prerequisites

- Node.js 18+ 
- Redis server (local or remote)
- Xero developer account and OAuth 2.0 app

## Setup Instructions

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd xerofrontend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Copy the example environment file:
   ```bash
   cp env.example .env.local
   ```
   
   Update `.env.local` with your credentials:
   ```env
   # Xero OAuth Credentials
   CLIENT_ID=your_xero_client_id
   CLIENT_SECRET=your_xero_client_secret
   
   # NextAuth Configuration  
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=your_nextauth_secret_here # Generate with: openssl rand -base64 32
   
   # Redis Configuration
   REDIS_URL=redis://127.0.0.1:6379
   
   # OAuth Redirect URI (must match Xero app settings)
   REDIRECT_URI=http://localhost:3000/api/auth/callback/xero
   ```

4. **Configure Xero App**
   
   In your Xero app settings:
   - Set the redirect URI to: `http://localhost:3000/api/auth/callback/xero`
   - For production, use: `https://yourdomain.com/api/auth/callback/xero`

5. **Start Redis**
   ```bash
   # If using Docker
   docker run -d -p 6379:6379 redis
   
   # Or install locally
   # Ubuntu/Debian: sudo apt-get install redis-server
   # macOS: brew install redis
   ```

6. **Run the development server**
   ```bash
   npm run dev
   ```

7. **Access the app**
   
   Open [http://localhost:3000](http://localhost:3000) and click "Login with Xero"

## Architecture

### Authentication Flow

1. User clicks "Login with Xero" on the home page
2. NextAuth redirects to Xero OAuth authorization
3. User authorizes the app in Xero
4. Callback receives authorization code
5. Token exchange happens automatically
6. User info and available tenants are fetched
7. Session is created with user-specific Redis keys
8. User is redirected to the organization dashboard

### Session Management

- Sessions are managed by NextAuth with JWT strategy
- Xero tokens are stored in Redis with user-specific keys
- Each user's data is isolated: `user:{email}:xero:{data_type}`
- Automatic token refresh before expiration

### Key Components

- `lib/auth.ts` - NextAuth configuration with custom Xero provider
- `lib/xeroTokenManager.ts` - User-specific token and tenant management
- `lib/ensureXeroToken.tsx` - Token validation and refresh logic
- `middleware.ts` - Route protection for authenticated areas

## Production Deployment

### Environment Variables for Production

```env
# Use your production URLs
NEXTAUTH_URL=https://yourdomain.com
REDIS_URL=redis://your-redis-host:6379

# Ensure CLIENT_ID and CLIENT_SECRET are securely stored
# Use a strong NEXTAUTH_SECRET
```

### Redis Configuration

For production, consider:
- Redis Sentinel for high availability
- Redis Cluster for horizontal scaling
- Proper authentication and SSL/TLS
- Connection pooling

### Security Considerations

- Always use HTTPS in production
- Keep your CLIENT_SECRET secure
- Implement rate limiting
- Monitor for suspicious activity
- Regular security audits

## Troubleshooting

### "Failed to save tenants to Redis"
- Check Redis connection: `redis-cli ping`
- Verify REDIS_URL is correct
- Check Redis server logs

### Authentication Issues
- Verify Xero app redirect URI matches exactly
- Check CLIENT_ID and CLIENT_SECRET
- Ensure NEXTAUTH_SECRET is set

### Token Refresh Failures
- Check if refresh token is valid
- Verify client credentials
- User may need to re-authenticate

## Development

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

### Learn More

To learn more about the technologies used:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API
- [NextAuth.js Documentation](https://next-auth.js.org) - authentication for Next.js
- [Xero API Documentation](https://developer.xero.com/documentation) - Xero API reference
- [Redis Documentation](https://redis.io/documentation) - Redis database

## License

[Your License]
