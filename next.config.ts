import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Skip type checking during build - run separately with `bun run type-check`
    ignoreBuildErrors: true,
  },
  eslint: {
    // Skip linting during build - run separately with `bun run lint`
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
