# Audit Logs Setup Guide

## Overview

The audit logging system tracks all important user actions and system operations in your application. It provides detailed tracking for:

1. **Timesheet Processing Group**:
   - TIMESHEET_UPLOAD - When files are uploaded
   - TIMESHEET_PROCESS - Processing of timesheet data
   - PROJECT_UPDATE - Updates to Xero projects

2. **Project Sync Group**:
   - PROJECT_SYNC - Comparison between Pipedrive and Xero
   - PROJECT_SYNC_COMPLETE - Completion of sync analysis

## Database Setup

### 1. Create the Audit Logs Table in Supabase

Run the SQL script located at `scripts/create-audit-logs-table.sql` in your Supabase SQL editor:

```sql
-- Copy and paste the contents of scripts/create-audit-logs-table.sql
```

### 2. Environment Variables

Add the following to your `.env.local` file if not already present:

```
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Row Level Security (Optional)

The table has RLS enabled by default. You can modify the policies based on your requirements:

- Current policy allows users to view their own logs
- Service role has full access

## Features

### Audit Log Viewer

Access the audit logs at `/organisation/logs` with the following features:

- **Real-time filtering** by action group, status, and date range
- **Detailed view** of each log entry with JSON data
- **Clean, minimal UI** matching the existing design
- **Performance optimized** with proper indexing

### Logged Information

Each audit log entry captures:

- User information (email, name)
- Tenant information
- Action type and group
- Success/failure status
- Execution time
- Detailed JSON data about the operation
- Error messages (if any)
- IP address and user agent

## Usage

### Viewing Logs

1. Navigate to `/organisation/logs`
2. Use filters to narrow down results:
   - **Action Group**: Timesheet Processing or Project Sync
   - **Status**: Success, Failure, or In Progress
   - **Date Range**: Custom date/time range
3. Click on any log entry to view detailed information

### Understanding Log Statuses

- **SUCCESS**: Operation completed successfully
- **FAILURE**: Operation failed with errors
- **IN_PROGRESS**: Operation is currently running

## Development

### Adding New Actions

To add new actions to track:

1. Update the `ActionType` enum in `lib/auditLogger.ts`
2. Add the action to the appropriate group in `getActionGroup()` method
3. Use the AuditLogger in your API routes:

```typescript
const auditLogger = new AuditLogger(session, tenantId, tenantName);

// Log a simple action
await auditLogger.logSuccess('YOUR_ACTION', { data: 'details' }, request);

// Log a long-running action
const logId = await auditLogger.startAction('YOUR_ACTION', { data: 'details' }, request);
// ... do work ...
await auditLogger.completeAction(logId, 'SUCCESS', { results: 'data' });
```

### Performance Considerations

- Logs are indexed by user_id, tenant_id, action_group, and created_at
- The viewer loads a maximum of 500 recent logs by default
- Consider implementing pagination for large datasets
- Archive old logs periodically if needed

## Troubleshooting

### Common Issues

1. **"Cannot find module '@supabase/supabase-js'"**
   - Run `npm install @supabase/supabase-js`

2. **"No audit logs found"**
   - Check if the table was created successfully
   - Verify RLS policies allow access
   - Ensure actions are being logged in API routes

3. **Performance issues**
   - Check if indexes were created
   - Consider reducing the number of logs fetched
   - Implement server-side pagination 