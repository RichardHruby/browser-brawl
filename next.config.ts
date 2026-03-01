import type { NextConfig } from "next";
import path from "path";

// Worktree is 3 levels deep (.claude/worktrees/byom-finetuned/).
// Without this, Next.js/Turbopack picks up C:\Users\khelt\yarn.lock as workspace
// root and fails to resolve node_modules from the browser-brawl root.
const repoRoot = path.resolve(__dirname, "../../..");

const nextConfig: NextConfig = {
  serverExternalPackages: ["@lmnr-ai/lmnr", "@anthropic-ai/sdk", "esbuild", "@esbuild/win32-x64", "@browserbasehq/stagehand"],
  turbopack: {
    root: repoRoot,
  },
};

export default nextConfig;
