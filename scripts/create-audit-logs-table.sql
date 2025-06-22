-- Audit Logs Table for tracking user actions
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- User information
    user_id VARCHAR(255) NOT NULL,
    user_name VARCHAR(255),
    tenant_id VARCHAR(255) NOT NULL,
    tenant_name VARCHAR(255),
    
    -- Action information
    action_group VARCHAR(50) NOT NULL, -- 'TIMESHEET_PROCESSING' or 'PROJECT_SYNC'
    action_type VARCHAR(100) NOT NULL, -- Specific action like 'TIMESHEET_UPLOAD', 'PROJECT_UPDATE', etc.
    
    -- Status and details
    status VARCHAR(20) NOT NULL CHECK (status IN ('SUCCESS', 'FAILURE', 'IN_PROGRESS')),
    
    -- Detailed information stored as JSON
    details JSONB,
    error_message TEXT,
    
    -- Metadata
    execution_time_ms INTEGER,
    ip_address INET,
    user_agent TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Indexes for performance
    CONSTRAINT audit_logs_action_group_check CHECK (action_group IN ('TIMESHEET_PROCESSING', 'PROJECT_SYNC'))
);

-- Create indexes for better query performance
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_action_group ON audit_logs(action_group);
CREATE INDEX idx_audit_logs_action_type ON audit_logs(action_type);
CREATE INDEX idx_audit_logs_status ON audit_logs(status);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Composite index for common queries
CREATE INDEX idx_audit_logs_user_action_time ON audit_logs(user_id, action_group, created_at DESC);
CREATE INDEX idx_audit_logs_tenant_action_time ON audit_logs(tenant_id, action_group, created_at DESC);

-- Enable Row Level Security
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy to allow authenticated users to view logs (you can make this more restrictive later)
CREATE POLICY "Authenticated users can view audit logs" ON audit_logs
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- Policy for service role (full access for API operations)
CREATE POLICY "Service role has full access" ON audit_logs
    FOR ALL
    USING (auth.role() = 'service_role');

-- Policy to allow service role to insert logs
CREATE POLICY "Service role can insert logs" ON audit_logs
    FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

-- Additional policy for anon role (for API routes that might use anon key)
CREATE POLICY "Allow anon role to insert audit logs" ON audit_logs
    FOR INSERT
    WITH CHECK (true);

-- Allow anon role to read logs (you can restrict this later if needed)
CREATE POLICY "Allow anon role to view audit logs" ON audit_logs
    FOR SELECT
    USING (true); 