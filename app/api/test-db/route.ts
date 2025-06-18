import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient()
    
    // Test reading from the test_logs table
    const { data, error } = await supabase
      .from('test_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5)
    
    if (error) {
      console.error('Database read error:', error)
      return NextResponse.json({
        success: false,
        message: 'Database read failed',
        error: error.message
      }, { status: 500 })
    }
    
    return NextResponse.json({
      success: true,
      message: 'Database connection successful!',
      data: data || [],
      count: data?.length || 0
    })
  } catch (error) {
    console.error('Database test error:', error)
    return NextResponse.json({
      success: false,
      message: 'Database test failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient()
    const body = await request.json()
    
    // Test inserting into the test_logs table
    const { data, error } = await supabase
      .from('test_logs')
      .insert({
        message: body.message || 'Test message from API',
        user_email: body.user_email || 'test@example.com'
      })
      .select()
    
    if (error) {
      console.error('Database insert error:', error)
      return NextResponse.json({
        success: false,
        message: 'Database insert failed',
        error: error.message
      }, { status: 500 })
    }
    
    return NextResponse.json({
      success: true,
      message: 'Database insert successful!',
      data: data
    })
  } catch (error) {
    console.error('Database insert error:', error)
    return NextResponse.json({
      success: false,
      message: 'Database insert failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 