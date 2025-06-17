export { auth as middleware } from "@/lib/auth"

export const config = {
  matcher: [
    "/organisation/:path*",
    "/api/tenants/:path*", 
    "/api/xero/:path*",
    "/api/pipedrive/:path*",
    "/api/projects-inprogress/:path*"
  ]
} 