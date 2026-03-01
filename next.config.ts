import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@lmnr-ai/lmnr", "@anthropic-ai/sdk", "esbuild", "@esbuild/win32-x64", "@browserbasehq/stagehand", "@playwright/mcp"],
};

export default nextConfig;
