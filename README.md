# CustomXero - Integration Platform

A Next.js application providing seamless integration between **Xero** (accounting) and **Pipedrive** (CRM) for project management, synchronization, and comprehensive reporting.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- Redis server
- Xero Developer Account
- Pipedrive Account with API access
- Supabase Account

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd customxero
```

2. **Install dependencies**
```bash
npm install
```

3. **Environment setup**
```bash
cp env.example .env.local
```

4. **Configure environment variables** (see [Environment Configuration](#environment-configuration))

5. **Start development server**
```bash
npm run dev
```

## 📋 Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [API Routes](#-api-routes)
- [Components](#-components)
- [Authentication](#-authentication)
- [Core Libraries](#-core-libraries)
- [Environment Configuration](#-environment-configuration)
- [Deployment](#-deployment)

## ✨ Features

### Core Functionality
- **OAuth Authentication** with Xero using NextAuth.js
- **Multi-tenant Support** with seamless tenant switching
- **Project Synchronization** between Xero and Pipedrive
- **Professional Report Generation** (Excel, CSV, Text formats)
- **Real-time API Usage Tracking** with intelligent rate limiting
- **Redis-powered Caching** for optimal performance
- **Timesheet Processing** and project task management

### Technical Features
- **Smart Rate Limiting** with adaptive delays
- **Automatic Token Refresh** for uninterrupted sessions
- **Progressive Web App** capabilities
- **Responsive Design** with Tailwind CSS
- **Error Boundaries** with comprehensive error handling
- **TypeScript** for enhanced development experience

## 🏗️ Architecture

### Project Structure
```
customxero/
├── app/                      # Next.js App Router
│   ├── api/                 # API Routes
│   │   ├── auth/           # Authentication endpoints
│   │   ├── xero/           # Xero API integration
│   │   ├── pipedrive/      # Pipedrive API integration
│   │   ├── compare/        # Data comparison endpoints
│   │   └── tenants/        # Tenant management
│   ├── organisation/       # Main application pages
│   │   ├── xero/          # Xero-specific pages
│   │   └── pipedrive/     # Pipedrive-specific pages
│   └── tenant-selection/   # Tenant selection interface
├── components/              # React Components
│   ├── xero/               # Xero-specific components
│   ├── TenantSwitcher.tsx  # Multi-tenant switcher
│   ├── ProgressBar.tsx     # Progress indicators
│   └── ConfirmationDialog.tsx # User confirmations
├── contexts/               # React Contexts
│   ├── LogContext.tsx      # Application logging
│   └── XeroApiUsageContext.tsx # API usage tracking
├── hooks/                  # Custom React Hooks
│   └── useSyncProject.ts   # Project synchronization logic
├── lib/                    # Core Libraries
│   ├── auth.ts            # NextAuth configuration
│   ├── xeroTokenManager.ts # Xero token management
│   ├── xeroProjectService.ts # Xero project data handling
│   ├── xeroApiTracker.ts  # API usage tracking
│   ├── smartRateLimit.ts  # Intelligent rate limiting
│   ├── reportGenerator.ts # Professional report generation
│   ├── ensureXeroToken.tsx # Token validation
│   └── supabase.ts        # Database client
└── types/                  # TypeScript definitions
```

### Technology Stack
- **Framework**: Next.js 15.3.2 with App Router
- **Authentication**: NextAuth.js 5.0.0-beta.28
- **Database**: Supabase PostgreSQL
- **Cache/Session**: Redis with ioredis
- **UI**: Tailwind CSS + Headless UI
- **File Processing**: XLSX, File-saver
- **Language**: TypeScript + React 19

## 🔌 API Routes

### Authentication
- `GET/POST /api/auth/[...nextauth]` - NextAuth.js handlers for OAuth flow

### Tenant Management
- `GET /api/tenants` - Get available Xero tenants
- `POST /api/tenants` - Switch selected tenant

### Xero Integration
- `GET /api/xero/projects` - Fetch Xero projects with caching
- `GET /api/xero/api-usage` - Get current API usage statistics
- `POST /api/xero/clear-cache` - Clear cached project data
- `GET /api/xero/cache-status` - Check cache status
- `POST /api/xero/process-and-update-timesheet` - Process timesheets
- `POST /api/xero/create-monthly-snapshot` - Generate monthly reports

### Pipedrive Integration
- `GET /api/pipedrive/projects` - Fetch Pipedrive deals (projects)

### Data Comparison
- `POST /api/compare/projects` - Compare projects between systems

### Example API Usage

```javascript
// Fetch Xero projects with cache refresh
const response = await fetch('/api/xero/projects', {
  headers: { 'X-Force-Refresh': 'true' }
});
const { projects, metadata } = await response.json();

// Compare projects between systems
const comparison = await fetch('/api/compare/projects', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ pipedriveProjects, xeroProjects })
});
```

## 🧩 Components

### Core UI Components

#### `TenantSwitcher`
Multi-tenant dropdown component with real-time switching capabilities.

```jsx
<TenantSwitcher />
```

**Features:**
- Only displays when multiple tenants available
- Real-time tenant switching with loading states
- Event broadcasting for cache invalidation
- Responsive design with tenant type indicators

#### `SyncProjectCard`
Main project synchronization interface with comprehensive workflow management.

```jsx
<SyncProjectCard disabled={false} />
```

**Features:**
- Step-by-step project analysis workflow
- Visual progress indicators and result summaries
- Professional report generation integration
- Real-time status updates

### Xero-Specific Components

#### Component Index (`components/xero/index.ts`)
```jsx
export {
  SyncProjectCard,
  ManhourBillingCard,
  TimesheetProcessingCard,
  CachedProjectsViewer,
  ProjectMatchingAnalyzer,
  ReportDownloadOptions
} from './';
```

Each component follows consistent patterns:
- **Props Interface**: TypeScript interfaces for all props
- **Loading States**: Visual feedback during operations
- **Error Handling**: Comprehensive error boundaries
- **Accessibility**: ARIA labels and keyboard navigation

## 🔐 Authentication

### OAuth Flow with Xero

The application uses NextAuth.js for seamless Xero integration:

1. **User Authentication**: OAuth 2.0 with PKCE
2. **Token Management**: Automatic refresh handling
3. **Tenant Resolution**: Multi-tenant support
4. **Session Persistence**: Redis-backed sessions

### Configuration (`lib/auth.ts`)

```typescript
export const authConfig: NextAuthConfig = {
  providers: [{
    id: "xero",
    name: "Xero",
    type: "oauth",
    authorization: {
      params: {
        scope: "openid profile email offline_access accounting.transactions projects"
      }
    }
  }],
  callbacks: {
    jwt: ({ token, account }) => { /* Token handling */ },
    session: ({ session, token }) => { /* Session enrichment */ }
  }
}
```

### Protected Routes

The middleware protects key routes:
```typescript
export const config = {
  matcher: [
    "/organisation/:path*",
    "/api/tenants/:path*", 
    "/api/xero/:path*",
    "/api/pipedrive/:path*"
  ]
}
```

## 📚 Core Libraries

### `XeroTokenManager` - Tenant & Token Management

Singleton class managing Xero tenant data with Redis persistence:

```typescript
// Get user's tenants
const tenants = await xeroTokenManager.getUserTenants(userId);

// Save selected tenant
await xeroTokenManager.saveSelectedTenant(userId, tenantId);

// Smart tenant fetching with API fallback
const tenants = await xeroTokenManager.getOrFetchTenants(session);
```

**Features:**
- Redis-first with in-memory fallback
- Automatic error recovery
- 7-day TTL for tenant data
- Input validation and sanitization

### `XeroProjectService` - Project Data Management

Handles Xero project data with intelligent caching:

```typescript
// Get cached project data (10-minute cache)
const projectData = await XeroProjectService.getProjectData();

// Force refresh from API
const freshData = await XeroProjectService.getProjectData(true);

// Clear cache for tenant
XeroProjectService.clearCache(tenantId);
```

**Features:**
- 10-minute intelligent caching
- Automatic pagination handling
- Project code extraction
- Rate limiting integration

### `SmartRateLimit` - Intelligent API Throttling

Adaptive rate limiting based on remaining API calls:

```typescript
// Wait if needed before API call
await SmartRateLimit.waitIfNeeded();

// Update limits from API response headers
SmartRateLimit.updateFromHeaders(responseHeaders);

// Get current status
const status = SmartRateLimit.getStatus();
```

**Rate Limiting Strategy:**
- **Daily Limit**: 5,000 requests
- **Minute Limit**: 60 requests
- **Adaptive Delays**: 100ms base, increases as limits approached
- **Safety Buffer**: 10-call conservative margin

### `ProfessionalReportGenerator` - Multi-format Reports

Generates professional reports in multiple formats:

```typescript
await ProfessionalReportGenerator.generateProjectComparisonReport(
  comparisonData,
  reportMetadata,
  'xlsx' // or 'csv', 'txt'
);
```

**Report Features:**
- **Excel**: Multi-sheet with professional styling
- **CSV**: UTF-8 encoded for universal compatibility
- **Text**: ASCII-formatted with visual enhancements
- **Metadata**: Comprehensive report information

## 🎣 Hooks

### `useSyncProject` - Project Synchronization

Comprehensive hook managing the entire project sync workflow:

```typescript
const {
  isSyncing,
  isAnalyzing,
  comparisonData,
  showDownloadOptions,
  reportMetadata,
  handleAnalyzeProjects,
  handleDownloadReport
} = useSyncProject();
```

**Workflow:**
1. **Data Fetching**: Parallel retrieval from both systems
2. **Comparison**: Intelligent project matching
3. **Report Generation**: Professional report metadata creation
4. **Download Management**: Multi-format export handling

## 🌍 Environment Configuration

### Required Variables

Create `.env.local` with the following:

```bash
# NextAuth Configuration
NEXTAUTH_SECRET=your_secret_key_minimum_32_characters
NEXTAUTH_URL=http://localhost:3000

# Xero API Credentials (from Xero Developer Portal)
CLIENT_ID=your_xero_client_id
CLIENT_SECRET=your_xero_client_secret

# Pipedrive API Key (from Pipedrive Settings)
PIPEDRIVE_KEY=your_pipedrive_api_key

# Supabase Configuration (from Supabase Dashboard)
SUPABASE_ANON_KEY=your_supabase_anonymous_key

# Redis Configuration
REDIS_URL=redis://127.0.0.1:6379
# Or for production: redis://username:password@host:port
```

### External Service Setup

#### Xero Developer Setup
1. Create account at [Xero Developer Portal](https://developer.xero.com/)
2. Create new app with OAuth 2.0
3. Set redirect URI: `http://localhost:3000/api/auth/callback/xero`
4. Add required scopes: `openid profile email offline_access accounting.transactions projects`

#### Pipedrive Setup  
1. Get API key from Pipedrive Settings → API
2. Ensure account has access to Deals and Pipeline data

#### Supabase Setup
1. Create project at [Supabase](https://supabase.com/)
2. Get anonymous key from Settings → API

## 🚀 Deployment

### Build for Production

```bash
npm run build
npm start
```

### Platform Deployment

#### Vercel (Recommended)
1. **Connect Repository**: Link GitHub repo to Vercel
2. **Environment Variables**: Add all required variables in Vercel dashboard
3. **Build Settings**: 
   - Build Command: `npm run build`
   - Output Directory: `.next`
4. **Deploy**: Automatic deployment on git push

#### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t customxero .
docker run -p 3000:3000 --env-file .env customxero
```

### Production Considerations

- **Redis**: Use managed service (Redis Cloud, AWS ElastiCache)
- **SSL**: Ensure HTTPS for OAuth callbacks
- **Monitoring**: Implement health checks and logging
- **Scaling**: Consider horizontal scaling for high load
- **Backup**: Regular database and Redis backups

## 📊 Monitoring & Maintenance

### Health Checks
Monitor these key metrics:
- API response times and error rates
- Redis connection status
- Authentication success rates
- Rate limit consumption patterns

### Performance Optimization
- **Caching**: Adjust TTL values based on usage patterns
- **API Batching**: Group similar requests when possible
- **Bundle Analysis**: Monitor client-side bundle sizes
- **Database Queries**: Optimize Supabase query performance

### Troubleshooting

#### Common Issues

**Authentication Failures**
- Verify Xero app credentials and redirect URIs
- Check NEXTAUTH_SECRET is set and sufficiently long
- Ensure NEXTAUTH_URL matches deployment URL

**API Rate Limiting**
- Monitor usage patterns in `/api/xero/api-usage`
- Adjust SmartRateLimit parameters if needed
- Consider implementing request queuing for high-volume scenarios

**Redis Connection Issues**
- Verify REDIS_URL format and accessibility
- Check for network restrictions in production
- Implement Redis failover strategies

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/new-feature`
5. Submit pull request

### Development Guidelines
- Follow TypeScript strict mode
- Add comprehensive error handling
- Include unit tests for new features
- Update documentation for API changes
- Use semantic commit messages

## 📝 License

This project is licensed under the MIT License - see LICENSE file for details.

## 🆘 Support

For support and questions:
1. Check existing GitHub issues
2. Review API documentation links
3. Contact system administrator
4. Refer to external service documentation (Xero, Pipedrive)

---

**Version**: 2.0.0  
**Last Updated**: $(date)  
**Built with**: Next.js, TypeScript, and ❤️ 