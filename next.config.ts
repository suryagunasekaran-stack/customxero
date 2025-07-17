import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    // Allow larger payloads for file uploads
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // Increase API body size limit
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
    responseLimit: '10mb',
  },
};

export default nextConfig;
