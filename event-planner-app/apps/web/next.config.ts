import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Internal workspace packages ship TypeScript source, so Next compiles them itself.
  transpilePackages: ["@event-toolkit/schema", "@event-toolkit/local-store", "@event-toolkit/ui"],
};

export default nextConfig;
