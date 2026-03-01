import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@lmnr-ai/lmnr",
    "@anthropic-ai/sdk",
    "esbuild",
    "@esbuild/win32-x64",
    "@browserbasehq/stagehand",
    "@playwright/mcp",
  ],
  outputFileTracingIncludes: {
    "/api/game/start": [
      "./node_modules/@playwright/mcp/**/*",
      "./node_modules/playwright/**/*",
      "./node_modules/playwright-core/**/*",
      "./node_modules/@playwright/mcp/node_modules/playwright/**/*",
      "./node_modules/@playwright/mcp/node_modules/playwright-core/**/*",
    ],
  },
};

export default nextConfig;
