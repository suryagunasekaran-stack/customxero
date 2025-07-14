# Project Sync Architecture

## Overview

The Project Sync feature has been redesigned with a modern orchestration architecture that separates business logic from UI components and provides real-time progress tracking.

## Architecture Components

### 1. Orchestration Service (`ProjectSyncOrchestrator`)

The core service that handles all business logic for project synchronization:

- **Manages sync workflow steps** - Fetching data, normalizing, matching, comparing values
- **Provides real-time progress updates** - Each step reports its status and progress
- **Handles error scenarios** - Graceful handling of API failures and disabled integrations
- **Generates comprehensive summaries** - Detailed analysis with recommendations

#### Key Features:
- Step-based workflow execution
- Progress callbacks for real-time UI updates
- Configurable value comparison tolerance
- Support for multiple company/tenant scenarios

### 2. Type Definitions (`orchestration/types.ts`)

Comprehensive TypeScript interfaces for:
- `SyncSession` - Complete sync operation state
- `SyncStep` - Individual workflow step tracking
- `SyncSummary` - Analysis results and recommendations
- `ProjectMatch` - Matched project pairs with value comparison
- `ValueDiscrepancy` - Financial difference tracking

### 3. UI Components

#### SyncProjectCardV2
Modern UI component with:
- **Dynamic checklist** showing real-time progress
- **Expandable step details** with timing and error information
- **Visual summary cards** displaying match statistics
- **Value discrepancy alerts** highlighting financial differences
- **Integrated report downloads** in multiple formats

### 4. Enhanced Hook (`useSyncProjectV2`)

React hook that:
- Manages orchestrator lifecycle
- Provides reactive state updates
- Handles report generation
- Offers cancellation support

## Usage Example

```typescript
import SyncProjectCardV2 from '@/components/xero/SyncProjectCardV2';

// Simple usage - component handles everything internally
<SyncProjectCardV2 disabled={false} />

// Advanced usage with custom configuration
import { useSyncProjectV2 } from '@/hooks/useSyncProjectV2';

const { 
  syncSession, 
  isAnalyzing, 
  handleAnalyzeProjects,
  summary 
} = useSyncProjectV2({
  config: {
    valueTolerancePercentage: 10, // 10% tolerance
    enableValueComparison: true,
  },
  onStepUpdate: (step) => {
    console.log('Step updated:', step);
  }
});
```

## Workflow Steps

1. **Fetch Pipedrive Won Deals**
   - Retrieves won deals from work in progress pipeline
   - Handles disabled integration scenarios

2. **Fetch Xero Projects**
   - Gets in-progress projects from selected tenant
   - Includes financial data and estimates

3. **Normalize Data**
   - Standardizes formats for comparison
   - Extracts project codes and keys

4. **Match Projects**
   - Uses intelligent key matching (ED codes + vessel names)
   - Identifies unmatched projects in both systems

5. **Compare Project Values**
   - Analyzes financial discrepancies
   - Configurable tolerance threshold

6. **Generate Summary**
   - Creates comprehensive analysis
   - Provides actionable recommendations

## Key Improvements

1. **Separation of Concerns**
   - Business logic isolated in orchestrator
   - UI components focus on presentation
   - Testable and maintainable architecture

2. **Real-time Feedback**
   - Users see progress as it happens
   - Clear error messages and recovery options
   - No more waiting without feedback

3. **Enhanced Analysis**
   - Value comparison with tolerance
   - Detailed recommendations
   - Support for disabled integrations

4. **Better UX**
   - Modern, clean interface
   - Expandable details on demand
   - Visual progress indicators

## Future Extensions

The orchestration architecture makes it easy to add:

1. **Multiple Company Support**
   - Add company selection to workflow
   - Compare across different Xero tenants
   - Consolidated multi-company reports

2. **Advanced Matching Rules**
   - Custom project key patterns
   - Fuzzy matching options
   - Manual match override

3. **Automated Actions**
   - Create missing projects
   - Update project values
   - Send notifications

4. **Historical Tracking**
   - Store sync sessions
   - Track changes over time
   - Trend analysis

## Migration Guide

To migrate from the old SyncProjectCard to the new version:

1. Replace import:
   ```typescript
   // Old
   import { SyncProjectCard } from '@/components/xero';
   
   // New
   import SyncProjectCardV2 from '@/components/xero/SyncProjectCardV2';
   ```

2. Update component usage:
   ```typescript
   // Old
   <SyncProjectCard disabled={isSyncing} />
   
   // New
   <SyncProjectCardV2 disabled={false} />
   ```

3. The new component is self-contained and doesn't require external state management.

## Testing

The orchestration service can be tested independently:

```typescript
const orchestrator = new ProjectSyncOrchestrator({
  valueTolerancePercentage: 5
});

const session = orchestrator.initializeSession('tenant123', 'Test Company');
const result = await orchestrator.executeSyncWorkflow(
  mockFetchPipedrive,
  mockFetchXero
);
```