# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CustomXero is a Next.js 15.3.2 integration platform that connects Xero (accounting) and Pipedrive (CRM) systems. It provides advanced data synchronization, timesheet processing, and project management capabilities.

## Development Commands

```bash
# Development
npm run dev          # Start development server with Turbopack (no deprecation warnings)

# Production
npm run build        # Build for production
npm run start        # Start production server

# Code Quality
npm run lint         # Run ESLint with Next.js configuration
```

## Architecture & Patterns

### Service Layer Architecture
The codebase follows a service-oriented architecture with clear separation of concerns:
- **Services** (`/lib/services/`) - Business logic isolated from UI
- **API Routes** (`/app/api/`) - Thin controllers delegating to services
- **Middleware** (`/lib/middleware/`) - Composable authentication and error handling

### Key Architectural Decisions

1. **Orchestration Pattern**: `ProjectSyncOrchestrator` manages complex multi-step workflows with real-time progress tracking via Server-Sent Events (SSE).

2. **Smart Rate Limiting**: The `SmartRateLimit` class implements adaptive throttling with:
   - 5,000 daily request limit
   - 60 requests per minute limit
   - Progressive delay increases as limits approach
   - Safety buffers to prevent hitting hard limits

3. **Multi-Tenant Architecture**: 
   - Redis-backed tenant switching
   - Automatic token refresh with distributed locking
   - Tenant-specific Pipedrive API keys (some tenants have Pipedrive disabled)

4. **Token Management**: `XeroTokenStore` (not singleton) handles OAuth tokens with:
   - Redis-based distributed locking for refresh operations
   - Automatic refresh on 401 errors
   - Serverless-compatible design for Vercel deployment

5. **Middleware Composition**: Use `createProtectedRoute` and `createPublicRoute` for consistent API patterns:
   ```typescript
   export const POST = createProtectedRoute(async (req, session) => {
     // Implementation
   });
   ```

### Data Storage Strategy
- **Supabase PostgreSQL**: Primary data store for projects, timesheets, contacts
- **MongoDB**: Document storage for flexible data structures
- **Redis**: Caching, session management, distributed locking, rate limiting

### Error Handling Pattern
All services follow error-first design with graceful degradation:
```typescript
try {
  // Operation
} catch (error) {
  logger.error('Descriptive message', { error, context });
  // Graceful fallback
}
```

### Logging Standards
Use Pino logger (not console.log):
```typescript
import { logger } from '@/lib/logger';
logger.info('Operation completed', { metadata });
```

## Important Implementation Notes

1. **File Uploads**: Special middleware handles up to 10MB file uploads with proper cleanup.

2. **TypeScript Strict Mode**: All code must pass strict TypeScript checks.

3. **No Test Framework**: Currently no Jest/Vitest setup. When adding tests, establish testing infrastructure first.

4. **API Response Pattern**: Always return consistent response structure:
   ```typescript
   return NextResponse.json({ 
     success: true/false, 
     data?: any,
     error?: string 
   });
   ```

5. **Xero API Integration**: Always use `XeroService` class methods, never call Xero APIs directly.

6. **Pipedrive Integration**: Check if tenant has Pipedrive enabled before making API calls.

7. **Redis Keys**: Follow naming convention: `xero:${tenantId}:${purpose}` for Redis keys.

## Code Style Guidelines

- Use async/await over Promise chains
- Implement proper TypeScript types (avoid `any`)
- Follow existing file naming conventions (kebab-case for files, PascalCase for components)
- Keep API routes thin - delegate logic to services
- Use early returns to reduce nesting
- Maintain existing import order and structure