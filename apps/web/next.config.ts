import type { NextConfig } from "next";

const API_INTERNAL = process.env.API_INTERNAL_BASE || "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Proxy /api/* → backend FastAPI (server-side, hides API from public)
      { source: "/api/:path*", destination: `${API_INTERNAL}/:path*` },
    ];
  },
};

export default nextConfig;
