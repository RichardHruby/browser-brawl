import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@lmnr-ai/lmnr", "@anthropic-ai/sdk", "esbuild", "@esbuild/win32-x64", "@browserbasehq/stagehand"],
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
