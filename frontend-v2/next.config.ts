import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: 'export',
  // Rewrites are not supported in static export mode.
  // When served by the backend at port 8080, relative API calls will work naturally.
};

export default nextConfig;
