import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone',
  async rewrites() {
    // Use environment variable or default to localhost:8080 for local development
    const apiTarget = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
    
    return [
      {
        source: '/api/:path*',
        destination: `${apiTarget}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
