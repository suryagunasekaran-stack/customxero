-- Simple verification script for audit logs table setup
-- Compatible with most PostgreSQL versions

-- 1. Check if the table exists
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs' AND table_schema = 'public')
        THEN '✅ Table audit_logs exists'
        ELSE '❌ Table audit_logs NOT found'
    END as table_status;

-- 2. Check essential columns
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'audit_logs' 
    AND table_schema = 'public'
    AND column_name IN ('id', 'user_id', 'action_group', 'action_type', 'status', 'created_at')
ORDER BY 
    CASE column_name 
        WHEN 'id' THEN 1
        WHEN 'user_id' THEN 2
        WHEN 'action_group' THEN 3
        WHEN 'action_type' THEN 4
        WHEN 'status' THEN 5
        WHEN 'created_at' THEN 6
    END;

-- 3. Check if RLS is enabled
SELECT 
    CASE 
        WHEN rowsecurity = true 
        THEN '✅ Row Level Security is enabled'
        ELSE '❌ Row Level Security is NOT enabled'
    END as rls_status
FROM pg_tables 
WHERE tablename = 'audit_logs' 
    AND schemaname = 'public';

-- 4. Check basic indexes exist
SELECT 
    COUNT(*) as index_count,
    CASE 
        WHEN COUNT(*) >= 5 
        THEN '✅ Expected indexes found'
        ELSE '⚠️  Some indexes might be missing'
    END as index_status
FROM pg_indexes 
WHERE tablename = 'audit_logs' 
    AND schemaname = 'public';

-- 5. Test table structure with a dry run
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'audit_logs' 
            AND column_name = 'details' 
            AND data_type = 'jsonb'
        )
        THEN '✅ JSONB details column exists'
        ELSE '❌ JSONB details column missing'
    END as jsonb_support;

-- 6. Show constraint checks
SELECT 
    constraint_name,
    constraint_type
FROM information_schema.table_constraints 
WHERE table_name = 'audit_logs' 
    AND table_schema = 'public'
    AND constraint_type IN ('CHECK', 'PRIMARY KEY');

-- 7. Final summary
SELECT 
    '🎉 Audit logs table verification complete!' as summary,
    NOW() as checked_at,
    version() as postgres_version;

-- 8. Show current record count
SELECT 
    COUNT(*) as total_audit_logs,
    MAX(created_at) as latest_log_time
FROM audit_logs; 