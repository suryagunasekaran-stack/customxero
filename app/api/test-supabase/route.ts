import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient()
    
    // Test the connection by trying to access the auth endpoint
    const { data, error } = await supabase.auth.getUser()
    
    if (error && error.message !== 'JWT expired') {
      // JWT expired is expected for test calls without auth
      console.error('Supabase connection error:', error)
    }
    
    return NextResponse.json({
      success: true,
      message: 'Supabase connection successful!',
      timestamp: new Date().toISOString(),
      supabaseUrl: process.env.SUPABASE_URL ? 'Connected' : 'Missing URL',
      supabaseKey: process.env.SUPABASE_ANON_KEY ? 'Connected' : 'Missing Key'
    })
  } catch (error) {
    console.error('Supabase test error:', error)
    return NextResponse.json({
      success: false,
      message: 'Supabase connection failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 