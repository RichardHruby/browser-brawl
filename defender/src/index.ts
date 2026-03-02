import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runDefender } from "./defender-agent.js";

// Load .env.local from project root, overriding any shell env
const envPath = resolve(import.meta.dirname, "../../.env.local");
try {
  const envFile = readFileSync(envPath, "utf-8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    process.env[key] = value;
  }
} catch {
  // .env.local is optional — fall back to shell env
}

const [url, defenderGoal] = process.argv.slice(2);

if (!url || !defenderGoal) {
  console.error(
    'Usage: node --import tsx/esm defender/src/index.ts "<url>" "<defender-goal>"\n' +
      'Example: node --import tsx/esm defender/src/index.ts "https://example.com" "block clicks on the buy button"'
  );
  process.exit(1);
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error(
    "Error: ANTHROPIC_API_KEY environment variable is not set.\n" +
      "Set it with: export ANTHROPIC_API_KEY=sk-ant-..."
  );
  process.exit(1);
}

console.log(`[defender] Starting against: ${url}`);
console.log(`[defender] Goal: ${defenderGoal}`);

try {
  await runDefender(url, defenderGoal, apiKey);
} catch (err) {
  console.error("[defender] Fatal error:", err);
  process.exit(1);
}
