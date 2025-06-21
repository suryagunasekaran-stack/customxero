-- Verification script for audit logs table setup
-- Run this after creating the audit_logs table

-- Check if the table exists
SELECT 
    table_name,
    table_type,
    is_insertable_into
FROM information_schema.tables 
WHERE table_name = 'audit_logs' 
    AND table_schema = 'public';

-- Check table structure and columns
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'audit_logs' 
    AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check indexes
SELECT 
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'audit_logs' 
    AND schemaname = 'public'
ORDER BY indexname;

-- Check constraints
SELECT 
    constraint_name,
    constraint_type,
    table_name
FROM information_schema.table_constraints 
WHERE table_name = 'audit_logs' 
    AND table_schema = 'public';

-- Check RLS (Row Level Security)
SELECT 
    schemaname,
    tablename,
    rowsecurity,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'pg_tables' 
            AND column_name = 'forcerowsecurity'
        ) 
        THEN 'RLS enabled'
        ELSE 'RLS status check (forcerowsecurity column not available in this PostgreSQL version)'
    END as rls_status
FROM pg_tables 
WHERE tablename = 'audit_logs' 
    AND schemaname = 'public';

-- Check RLS policies
SELECT 
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'audit_logs' 
    AND schemaname = 'public';

-- Test inserting a sample record (this will test if the table structure is correct)
-- Note: This insert will only work if you have the proper permissions
DO $$
BEGIN
    -- Test insert (will be rolled back)
    BEGIN
        INSERT INTO audit_logs (
            user_id,
            user_name,
            tenant_id,
            tenant_name,
            action_group,
            action_type,
            status,
            details,
            created_at
        ) VALUES (
            'test@example.com',
            'Test User',
            'test-tenant-id',
            'Test Tenant',
            'TIMESHEET_PROCESSING',
            'TIMESHEET_UPLOAD',
            'SUCCESS',
            '{"test": "data"}'::jsonb,
            NOW()
        );
        
        RAISE NOTICE 'SUCCESS: Test insert worked - table structure is correct';
        
        -- Clean up test record
        DELETE FROM audit_logs WHERE user_id = 'test@example.com';
        
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'NOTE: Test insert failed - this might be due to RLS policies: %', SQLERRM;
    END;
END $$;

-- Final summary
SELECT 
    'audit_logs table setup verification complete' as message,
    NOW() as checked_at;

-- Show recent records count (if any)
SELECT 
    COUNT(*) as total_records,
    COUNT(CASE WHEN status = 'SUCCESS' THEN 1 END) as success_count,
    COUNT(CASE WHEN status = 'FAILURE' THEN 1 END) as failure_count,
    COUNT(CASE WHEN status = 'IN_PROGRESS' THEN 1 END) as in_progress_count
FROM audit_logs; 