import path from "node:path";
import type { NextConfig } from "next";

// frontend_client is its own git repo; npm workspaces hoist installs to the
// folder above. Tell Turbopack where the real project root is, or it ignores
// the workspace root package.json and can't resolve hoisted deps.
// next.config.ts is compiled to CJS by Next, so __dirname is available.
const workspaceRoot = path.resolve(__dirname, "..");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    root: workspaceRoot,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
