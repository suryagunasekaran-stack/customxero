# Pipedrive-Xero Validation Feature Implementation Plan

## 🎯 Objective

Implement a comprehensive validation service that compares Pipedrive deals against Xero quotes and projects, identifying mismatches, missing data, and data integrity issues across both systems. The service will provide read-only validation with detailed reporting suitable for UI display.

**Success Criteria:**
- Validate deal title formats including ED normalization
- Cross-reference Xero quotes with Pipedrive deals
- Verify project status alignment
- Generate actionable validation reports
- Support multi-tenant pipelines with proper mapping

**Prerequisites:**
- Valid Xero OAuth tokens
- Pipedrive API keys configured per tenant
- Redis cache for rate limiting
- Access to both tenant configurations

## 🏗 Architecture Impact

### Existing Patterns to Follow
- **Orchestration Pattern**: Extend `ProjectSyncOrchestrator` for complex workflows with SSE progress tracking
- **Middleware Composition**: Use `createProtectedRoute` for consistent authentication and error handling
- **Service Layer**: Delegate to existing services (`XeroProjectService`) rather than creating parallel implementations
- **Rate Limiting**: Use existing `SmartRateLimit` static methods
- **Validation Rules**: Extend existing `/lib/validation/` modules

### Architecture Decisions
- **Extend vs Replace**: Enhance existing validation rules instead of creating new service classes
- **Orchestration**: Use proven `ProjectSyncOrchestrator` pattern for step-based progress tracking
- **API Layer**: Thin controllers that delegate to service layer following established middleware patterns
- **Multi-tenant**: Use runtime tenant resolution via `ensureValidToken()` instead of hardcoded mappings

### Integration Points
- Existing `XeroProjectService` for project data access
- `SmartRateLimit` static methods for API throttling
- `logger` with structured logging patterns
- `ProjectSyncOrchestrator` for SSE streaming and progress tracking
- Existing validation rule patterns in `/lib/validation/`

## 📁 File-Level Changes

### `/Users/suryagunasekaran/workApplications/customxero/lib/validation/pipedriveValidationRules.ts`
**Purpose:** Extend existing validation pattern for Pipedrive-specific rules
**Changes:**
```typescript
// Follow existing validation pattern from dealValidationRules.ts
export interface PipedriveValidationContext extends ValidationContext {
  pipedriveDeals: Deal[]
  xeroQuotes: XeroQuote[]
  tenantConfig: TenantConfig
}

export function validatePipedriveDeals(context: PipedriveValidationContext): ValidationIssue[]
export function validateDealTitles(deals: Deal[]): TitleValidationResult[]
export function crossReferenceQuotes(context: PipedriveValidationContext): QuoteValidationResult[]
export function validateRequiredFields(deal: Deal, tenantConfig: TenantConfig): FieldValidation[]

// Title normalization utilities (static functions, not service class)
export function parseTitle(title: string): ParsedTitle
export function normalizeEDFormat(title: string): string
export function generateProjectKey(title: string): string // Use existing pattern from ProjectSyncOrchestrator
```

### `/Users/suryagunasekaran/workApplications/customxero/lib/orchestration/ValidationOrchestrator.ts`
**Purpose:** Extend existing ProjectSyncOrchestrator for validation workflows
**Changes:**
```typescript
export class ValidationOrchestrator extends ProjectSyncOrchestrator {
  constructor(
    private xeroService: XeroProjectService,
    config: Partial<OrchestrationConfig> = {}
  ) {
    super(config)
  }
  
  async executeValidationWorkflow(
    tenantId: string,
    pipedriveConfig: PipedriveConfig
  ): Promise<ValidationSession>
  
  private async fetchPipedriveDeals(config: PipedriveConfig): Promise<Deal[]>
  private async fetchDealDetails(dealIds: number[], config: PipedriveConfig): Promise<DetailedDeal[]>
  private async validateDealsStep(deals: Deal[]): Promise<ValidationResult>
  private async crossReferenceQuotesStep(deals: Deal[]): Promise<QuoteValidationResult>
  private async generateReportStep(results: ValidationResult[]): Promise<ValidationReport>
}
```

### `/Users/suryagunasekaran/workApplications/customxero/lib/utils/pipedriveHelpers.ts`
**Purpose:** Utility functions for Pipedrive API interactions (following existing helper pattern)
**Changes:**
```typescript
// Follow existing utility pattern - pure functions, no classes
export async function fetchPipedriveDealsWithPagination(
  apiKey: string,
  companyDomain: string,
  pipelineId: number,
  status: 'won' | 'lost' = 'won'
): Promise<Deal[]>

export async function fetchDealDetails(
  apiKey: string,
  companyDomain: string,
  dealId: number
): Promise<DetailedDeal | null>

export async function fetchOrganizationDetails(
  apiKey: string,
  companyDomain: string,
  orgId: number
): Promise<Organization>

export function buildPipedriveApiUrl(
  domain: string,
  endpoint: string,
  params?: Record<string, string>
): string
```

### `/Users/suryagunasekaran/workApplications/customxero/lib/types/validation.ts`
**Purpose:** TypeScript interfaces for validation
**Changes:**
```typescript
export interface ValidationResult {
  tenantId: string
  timestamp: Date
  deals: ValidatedDeal[]
  quotes: ValidatedQuote[]
  projects: ValidatedProject[]
  summary: ValidationSummary
}

export interface ValidatedDeal {
  id: number
  title: string
  normalizedTitle: string
  pipelineId: number
  value: number
  currency: string
  xeroQuoteId?: string
  xeroProjectId?: string
  validationIssues: ValidationIssue[]
  customFields: Record<string, any>
}

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info'
  code: string
  message: string
  field?: string
  suggestedFix?: string
}

export interface TenantConfig {
  tenantId: string
  pipedriveApiKey: string
  pipelineMapping: Record<string, number[]>
  customFieldKeys: CustomFieldMapping
}
```

### `/Users/suryagunasekaran/workApplications/customxero/lib/utils/tenantConfig.ts`
**Purpose:** Runtime tenant configuration resolution (following existing pattern)
**Changes:**
```typescript
// Follow existing pattern from validate-stream/route.ts
export interface PipedriveConfig {
  apiKey: string
  companyDomain: string
  pipelineIds: number[]
  customFieldKeys: CustomFieldMapping
  enabled: boolean
}

export async function resolvePipedriveConfig(tenantId: string): Promise<PipedriveConfig | null> {
  // Use runtime resolution similar to existing TENANT_PIPEDRIVE_CONFIG pattern
  // but make it dynamic rather than hardcoded
  const configs = {
    'ea67107e-c352-40a9-a8b8-24d81ae3fc85': {
      apiKey: process.env.PIPEDRIVE_KEY_TENANT1,
      companyDomain: 'tenant1domain',
      pipelineIds: [2],
      customFieldKeys: {
        xeroQuoteId: '0e9dc89b14fb67546540fd3e11a7fe06653d708f',
        invoiceId: 'c599cab3902b6c84c1f9e2689f308a4369fffe7d',
        vesselName: 'bef5a8a5866aec2d7f4db2a5d8964ab04a4dc93d'
      },
      enabled: true
    },
    '6dd39ea4-e6a6-4993-a37a-21482ccf8d22': {
      apiKey: process.env.PIPEDRIVE_KEY,
      companyDomain: 'bseni',
      pipelineIds: [2, 3], // Multiple pipelines for this tenant
      customFieldKeys: {
        xeroQuoteId: '1f21104ccb95f5a4773ef52cd0c2cc1c78203f69',
        invoiceId: '8c5c696440f023067a49103a15b60ff6ae6e3243',
        vesselName: 'ecb34e26525067dd1a426c0c59909a8797a85e54'
      },
      enabled: true
    }
  }
  
  return configs[tenantId] || null
}
```

### `/Users/suryagunasekaran/workApplications/customxero/app/api/validation/pipedrive/route.ts`
**Purpose:** API endpoint for validation with SSE streaming (following established middleware pattern)
**Changes:**
```typescript
import { createProtectedRoute } from '@/lib/api/middleware'
import { ValidationOrchestrator } from '@/lib/orchestration/ValidationOrchestrator'
import { XeroProjectService } from '@/lib/xeroProjectService'
import { resolvePipedriveConfig } from '@/lib/utils/tenantConfig'
import { logger } from '@/lib/logger'

export const GET = createProtectedRoute(async (req, session) => {
  const encoder = new TextEncoder()
  
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const sendProgress = (data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        }
        
        // Use session from middleware instead of manual tenant resolution
        const tenantId = session.tenantId
        logger.info({ tenantId }, 'Starting Pipedrive validation')
        
        // Resolve tenant configuration
        const pipedriveConfig = await resolvePipedriveConfig(tenantId)
        if (!pipedriveConfig || !pipedriveConfig.enabled) {
          sendProgress({ 
            type: 'error', 
            message: 'Pipedrive integration not enabled for this tenant' 
          })
          controller.close()
          return
        }
        
        // Use existing service instances
        const xeroService = new XeroProjectService()
        const orchestrator = new ValidationOrchestrator(xeroService)
        orchestrator.setProgressCallback((step) => sendProgress({ type: 'progress', step }))
        
        // Execute validation workflow
        const validationSession = orchestrator.initializeSession(tenantId, 'Pipedrive Validation')
        const result = await orchestrator.executeValidationWorkflow(tenantId, pipedriveConfig)
        
        sendProgress({ type: 'complete', data: result })
        controller.close()
        
      } catch (error) {
        logger.error({ error: error.message }, 'Validation workflow failed')
        sendProgress({ type: 'error', message: error.message })
        controller.close()
      }
    }
  })
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  })
})
```


## ✅ Implementation Checklist (Revised)

- [ ] **Step 1**: Extend existing validation rules in `lib/validation/pipedriveValidationRules.ts`
  - Follow existing `dealValidationRules.ts` pattern
  - Add title parsing and normalization functions
  - Implement cross-reference validation logic
  - Define validation context interfaces

- [ ] **Step 2**: Create Pipedrive utility functions in `lib/utils/pipedriveHelpers.ts`
  - Implement paginated deal fetching with proper error handling
  - Add organization detail fetching
  - Create batch processing for deal details
  - Follow existing utility function patterns (pure functions, no classes)

- [ ] **Step 3**: Create tenant configuration resolver in `lib/utils/tenantConfig.ts`
  - Implement runtime tenant configuration resolution
  - Follow existing pattern from validate-stream/route.ts
  - Support multiple pipelines per tenant
  - Handle disabled tenants gracefully

- [ ] **Step 4**: Extend ProjectSyncOrchestrator in `lib/orchestration/ValidationOrchestrator.ts`
  - Inherit from existing `ProjectSyncOrchestrator`
  - Add validation-specific workflow steps
  - Leverage existing SSE progress tracking
  - Use existing error handling patterns

- [ ] **Step 5**: Implement API endpoint in `app/api/validation/pipedrive/route.ts`
  - Use `createProtectedRoute` middleware pattern
  - Delegate to `ValidationOrchestrator` for business logic
  - Follow existing SSE streaming implementation
  - Use session management from middleware

- [ ] **Step 6**: Integrate with existing services
  - Use existing `XeroProjectService` for Xero API calls
  - Leverage `SmartRateLimit` static methods for rate limiting
  - Use existing `logger` patterns throughout
  - Follow established error handling conventions

- [ ] **Step 7**: Define TypeScript interfaces in `lib/types/validation.ts`
  - Extend existing validation interfaces
  - Define Pipedrive-specific types
  - Ensure compatibility with existing patterns
  - Add comprehensive JSDoc comments

- [ ] **Step 8**: Testing and validation
  - Test with existing tenant configurations
  - Verify rate limiting compliance
  - Validate error handling scenarios
  - Ensure proper logging and monitoring

## ⚠️ Considerations (Updated with Architectural Compliance)

### Performance
- **Pagination Strategy**: Use cursor-based pagination for Pipedrive, page-based for Xero (following existing patterns)
- **Batch Processing**: Use existing batch processing patterns from `ProjectSyncOrchestrator`
- **Rate Limiting**: Use `SmartRateLimit.waitIfNeeded()` static methods consistently
- **Caching**: Leverage existing Redis infrastructure for tenant configurations

### Error Handling
- **Middleware Integration**: Use `withErrorHandler` for consistent error responses
- **Graceful Degradation**: Follow existing patterns from `ProjectSyncOrchestrator`
- **Logging**: Use existing `logger` with structured logging format
- **Session Management**: Leverage existing session handling from middleware

### Security
- **Authentication**: Use `createProtectedRoute` for consistent tenant validation
- **Data Sanitization**: Follow existing patterns for API response handling
- **Read-only Operations**: Maintain existing read-only validation approach
- **Sensitive Data**: Use existing logging patterns that mask sensitive information

### Architectural Compliance
- **Service Boundaries**: Respect existing service layer separation
- **No New Infrastructure**: Use existing Redis, logging, and rate limiting
- **Pattern Consistency**: Follow established orchestration and validation patterns
- **Dependency Management**: Delegate to existing services rather than duplicating functionality

### Logging Format (Following Existing Patterns)
```json
{
  "level": "info",
  "timestamp": "2025-08-03T10:00:00Z",
  "component": "ValidationOrchestrator",
  "sessionId": "validation_1722672000000",
  "tenantId": "ea67107e-c352-40a9-a8b8-24d81ae3fc85",
  "action": "validateDeals",
  "dealsProcessed": 50,
  "result": "success",
  "issues": 2
}
```

### Progress Events (Following ProjectSyncOrchestrator Pattern)
```typescript
// Use existing step-based progress from ProjectSyncOrchestrator
{ type: 'progress', step: { id: 'fetch_deals', status: 'running', progress: 50 } }

// Issue tracking within step results
{ type: 'progress', step: { id: 'validate_deals', status: 'completed', result: { issues: 5 } } }

// Final completion
{ type: 'complete', data: { session: validationSession, summary: results } }
```

## 📊 Validation Rules

### Title Validation
1. **Standard Format**: `PROJECTCODE-VESSELNAME`
   - Project code: alphanumeric, typically 2-3 letters + 3-6 digits
   - Vessel name: any characters after separator

2. **ED Format**: `ED[digits]-[middle]-[vessel]`
   - Normalize by removing middle section
   - Result: `ED[digits]-[vessel]`

3. **Invalid Formats**:
   - Missing separator
   - No vessel name
   - Invalid project code pattern

### Quote Validation
1. Check quote exists in Xero
2. Verify quote status (Accepted for won deals, Declined for lost)
3. Compare quote total with deal value
4. Validate quote customer matches deal organization
5. Check quote items match deal products

### Project Validation
1. Verify project exists for won deals
2. Check project status is "In Progress"
3. Match project code with deal title
4. Validate project value alignment

### Custom Field Validation
Per tenant requirements from CUSTOMFIELDS.md:
- Required fields must be populated
- Field formats must be valid
- Cross-reference related entities

## 🚀 Deployment Notes (Updated)

1. **Environment Variables** (following existing patterns):
   - `PIPEDRIVE_KEY` - Primary Pipedrive API key (BSENI tenant)
   - `PIPEDRIVE_KEY_TENANT1` - API key for additional tenant
   - Existing Redis and Xero OAuth configurations

2. **API Endpoint**:
   - `/api/validation/pipedrive` - No tenant parameter needed (uses session)
   - Follows existing authentication middleware pattern

3. **Performance Expectations**:
   - ~30-60 seconds for 200 deals (consistent with existing sync operations)
   - Progress updates follow existing step-based pattern
   - Leverages existing rate limiting for optimal throughput

4. **Resource Requirements**:
   - Memory: Consistent with existing `ProjectSyncOrchestrator` operations
   - CPU: I/O bound, similar to existing sync workflows
   - Network: Uses established rate limiting patterns

5. **Integration Points**:
   - Uses existing session management and tenant resolution
   - Leverages established Redis infrastructure
   - Follows existing error handling and logging patterns

This revised implementation maintains architectural consistency while providing the comprehensive validation functionality. The approach ensures maintainability and follows established patterns that the development team is already familiar with.