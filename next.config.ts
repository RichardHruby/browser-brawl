import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@lmnr-ai/lmnr",
    "@anthropic-ai/sdk",
    "esbuild",
    "@esbuild/win32-x64",
    "@browserbasehq/stagehand",
    "@playwright/mcp",
    "@google/genai",
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
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
