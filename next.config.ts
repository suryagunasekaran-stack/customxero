import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    // Allow larger payloads for file uploads
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
