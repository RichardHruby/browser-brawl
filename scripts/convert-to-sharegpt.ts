/**
 * Convert raw training data (Anthropic format) to ShareGPT format
 * compatible with Qwen2.5-VL fine-tuning via Axolotl.
 *
 * Transforms:
 *   - Anthropic tool_use blocks → <tool_call> XML tags
 *   - Anthropic tool_result blocks → <tool_response> XML tags
 *   - Anthropic tool definitions → <tools> XML in system prompt
 *
 * Usage:
 *   npx tsx scripts/convert-to-sharegpt.ts -i data/raw.jsonl -o data/train.jsonl
 *   npx tsx scripts/extract-training-data.ts --game X | npx tsx scripts/convert-to-sharegpt.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// Re-export conversion functions and types for test compatibility
export {
  convertToolDefs,
  buildSystemPrompt,
  convertAssistantMessage,
  convertToolResults,
  convertTrajectory,
  type AnthropicToolDef,
  type RawTrajectory,
  type ShareGPTTrainingExample,
} from '../src/lib/training-converter';

import {
  convertTrajectory,
  type RawTrajectory,
  type ShareGPTTrainingExample,
} from '../src/lib/training-converter';

// ── CLI args ───────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

const INPUT_FILE = flag('-i') || flag('--input');
const OUTPUT_FILE = flag('-o') || flag('--output');
const MIN_STEPS = parseInt(flag('--min-steps') || '3', 10);

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  let input: string;

  if (INPUT_FILE) {
    input = fs.readFileSync(INPUT_FILE, 'utf-8');
    console.error(`[convert] Reading from ${INPUT_FILE}`);
  } else {
    // Read from stdin
    const rl = readline.createInterface({ input: process.stdin });
    const lines: string[] = [];
    for await (const line of rl) {
      lines.push(line);
    }
    input = lines.join('\n');
    console.error(`[convert] Reading from stdin`);
  }

  const lines = input.trim().split('\n').filter(Boolean);
  console.error(`[convert] Processing ${lines.length} trajectories...`);

  const results: ShareGPTTrainingExample[] = [];
  let skipped = 0;

  for (const line of lines) {
    const raw: RawTrajectory = JSON.parse(line);
    const converted = convertTrajectory(raw, MIN_STEPS);
    if (converted) {
      results.push(converted);
    } else {
      skipped++;
    }
  }

  // Output
  const output = results.map((r) => JSON.stringify(r)).join('\n');

  if (OUTPUT_FILE) {
    const dir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, output + '\n');
    console.error(`[convert] Wrote ${results.length} examples to ${OUTPUT_FILE}`);
  } else {
    process.stdout.write(output + '\n');
  }

  // Summary
  console.error(`[convert] Done.`);
  console.error(`  Converted: ${results.length}`);
  console.error(`  Skipped: ${skipped}`);
  if (results.length > 0) {
    const avgMsgs = Math.round(
      results.reduce((s, r) => s + r.conversations.length, 0) /
        results.length,
    );
    const avgToolCalls = Math.round(
      results.reduce((s, r) => s + r.metadata.numToolCalls, 0) /
        results.length,
    );
    console.error(`  Avg messages per example: ${avgMsgs}`);
    console.error(`  Avg tool calls per example: ${avgToolCalls}`);
  }
}

// Only run when executed directly (not imported for testing)
const isDirectRun =
  process.argv[1]?.endsWith('convert-to-sharegpt.ts') ||
  process.argv[1]?.endsWith('convert-to-sharegpt.js');
if (isDirectRun) {
  main().catch((e) => {
    console.error('[convert] Fatal error:', e);
    process.exit(1);
  });
}
