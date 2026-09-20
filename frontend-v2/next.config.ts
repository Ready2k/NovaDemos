import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: 'export',
  turbopack: {
    // This app has its own lockfile inside a multi-package repository.
    // Pin the project root so Turbopack does not infer the parent directory.
    root: __dirname,
  },
  // Rewrites are not supported in static export mode.
  // When served by the backend at port 8080, relative API calls will work naturally.
};

export default nextConfig;
