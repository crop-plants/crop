import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // MapLibre GL and the Prisma engine are server-unfriendly; keep them external.
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;
