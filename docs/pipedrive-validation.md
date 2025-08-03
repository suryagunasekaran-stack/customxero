# Pipedrive-Xero Validation Feature

## Overview

The Pipedrive-Xero validation feature provides comprehensive data integrity checking between Pipedrive deals and Xero quotes/projects. It validates deal titles, cross-references data between systems, and identifies mismatches or missing information.

## Features

- **Deal Title Validation**: Checks deal titles for proper format (ProjectCode-VesselName)
- **ED Format Normalization**: Handles special ED format titles (ED12345-middle-vessel → ED12345-vessel)
- **Quote Cross-Reference**: Matches Pipedrive deals with Xero quotes using custom field IDs
- **Project Matching**: Compares deal titles with Xero project names using normalized keys
- **Multi-Pipeline Support**: Validates deals across multiple pipelines per tenant
- **Real-time Progress**: Server-Sent Events (SSE) for streaming validation progress
- **Issue Categorization**: Errors, warnings, and info-level issues with suggested fixes

## Configuration

### Environment Variables

```bash
# Tenant 1 (ea67107e-c352-40a9-a8b8-24d81ae3fc85)
PIPEDRIVE_KEY_2=your_api_key_here

# Tenant 2 - BSENI (6dd39ea4-e6a6-4993-a37a-21482ccf8d22)
PIPEDRIVE_KEY=your_api_key_here
```

### Tenant Configuration

Tenant configurations are defined in `/lib/utils/tenantConfig.ts` with:
- Pipeline IDs to validate
- Custom field mappings (from CUSTOMFIELDS.md)
- API domains

## API Endpoint

`GET /api/xero/validate-deals`

Protected endpoint that requires authentication. Returns Server-Sent Events stream with:
- Progress updates for each validation step
- Validation results including issues found
- Summary statistics

## UI Component

The validation UI is integrated into the Xero Integration Dashboard at `/organisation/xero`:

- **Validate Button**: Starts the validation process
- **Progress Display**: Shows current step with progress bar
- **Results Summary**: Displays counts of deals, quotes, projects
- **Issues List**: Categorized issues with severity indicators
- **Details View**: Expandable list of specific validation issues

## Validation Rules

### Title Format Validation
- Standard: `PROJECTCODE-VESSELNAME` (e.g., MES241058-LondonVoyager)
- ED Format: `ED[digits]-[middle]-[vessel]` → normalized to `ED[digits]-[vessel]`
- Invalid: Missing separator, no vessel name, invalid project code

### Quote Validation
- Checks if Xero Quote ID exists in custom field
- Verifies quote exists in Xero
- Validates quote status (ACCEPTED for won deals)
- Compares deal value with quote total

### Project Validation
- Matches project names using normalized keys
- Checks project status (INPROGRESS expected)
- Identifies unmatched projects in both systems

## Architecture

### Service Layer
- `ValidationOrchestrator`: Extends ProjectSyncOrchestrator for workflow management
- `pipedriveHelpers`: Utility functions for Pipedrive API interactions
- `pipedriveValidationRules`: Validation logic and title normalization

### Middleware
- Uses `createProtectedRoute` for authentication
- Integrates with existing Xero token management

### Rate Limiting
- Uses `SmartRateLimit.waitIfNeeded()` for API throttling
- Respects Pipedrive and Xero API limits

## Usage

1. Navigate to `/organisation/xero`
2. Click "Validate Pipedrive Deals" button
3. Monitor progress through real-time updates
4. Review validation results and issues
5. Click "Show Details" to see specific issues
6. Use suggested fixes to resolve issues

## Troubleshooting

### Common Issues

1. **"Pipedrive integration not enabled"**
   - Ensure environment variables are set
   - Check tenant configuration in tenantConfig.ts

2. **"No matches found"**
   - Review project naming conventions
   - Check title normalization logic
   - Verify custom field mappings

3. **API Rate Limits**
   - Validation automatically throttles requests
   - Large datasets may take 30-60 seconds

## Development

### Adding New Validation Rules

1. Add rule to `/lib/validation/pipedriveValidationRules.ts`
2. Update ValidationIssue types if needed
3. Include in validation workflow in ValidationOrchestrator

### Adding New Tenants

1. Add configuration to `/lib/utils/tenantConfig.ts`
2. Set environment variable for API key
3. Map custom fields from CUSTOMFIELDS.md

## Performance

- ~200 deals: 30-60 seconds
- Progress updates every step
- Automatic rate limiting prevents API errors
- Results cached in session for review