import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://cxqamciqlaazofrwxpsc.supabase.co'
const supabaseKey = process.env.SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

// For server-side operations (API routes)
export const createServerClient = () => {
  return createClient(supabaseUrl, supabaseKey)
} 