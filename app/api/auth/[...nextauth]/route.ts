import { handlers } from "@/lib/auth"
import { NextRequest } from "next/server"

const { GET: authGET, POST: authPOST } = handlers

export async function GET(request: NextRequest) {
  const response = await authGET(request)
  
  // Add CORS headers for production
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Access-Control-Allow-Origin', process.env.NEXTAUTH_URL || 'https://customxero.vercel.app')
    response.headers.set('Access-Control-Allow-Credentials', 'true')
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  }
  
  return response
}

export async function POST(request: NextRequest) {
  const response = await authPOST(request)
  
  // Add CORS headers for production
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Access-Control-Allow-Origin', process.env.NEXTAUTH_URL || 'https://customxero.vercel.app')
    response.headers.set('Access-Control-Allow-Credentials', 'true')
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  }
  
  return response
}

// Handle preflight requests
export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': process.env.NEXTAUTH_URL || 'https://customxero.vercel.app',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
} 