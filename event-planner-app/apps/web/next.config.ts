import type { NextConfig } from "next";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { dependencies } = require("./package.json") as { dependencies: Record<string, string> };

/**
 * Internal workspace packages ship TypeScript source rather than built JavaScript, so Next has to
 * compile them itself.
 *
 * Derived from `dependencies` rather than hand-listed. The hand-written version had drifted to
 * three of eleven, and the failure that produces is the worst kind: a package that is only
 * imported on one route builds fine locally and fails in production, months after the dependency
 * was added.
 */
const workspacePackages = Object.keys(dependencies).filter((name) =>
  name.startsWith("@event-toolkit/"),
);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: workspacePackages,
};

export default nextConfig;
