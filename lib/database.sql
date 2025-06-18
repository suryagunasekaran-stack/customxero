-- Test table for Supabase setup
CREATE TABLE IF NOT EXISTS test_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message TEXT NOT NULL,
  user_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE test_logs ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows anyone to read and insert (for testing)
-- In production, you'd want more restrictive policies
CREATE POLICY "Allow public read access on test_logs" ON test_logs
    FOR SELECT USING (true);

CREATE POLICY "Allow public insert access on test_logs" ON test_logs
    FOR INSERT WITH CHECK (true);

-- Optional: Create an index on created_at for better performance
CREATE INDEX IF NOT EXISTS test_logs_created_at_idx ON test_logs(created_at DESC); 