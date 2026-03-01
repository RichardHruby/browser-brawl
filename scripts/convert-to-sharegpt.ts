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

// ── Types ──────────────────────────────────────────────────────────

export interface AnthropicToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface AnthropicToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock;

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

export interface RawTrajectory {
  gameId: string;
  task: {
    description: string;
    startUrl?: string;
    difficulty: string;
  };
  winner: string;
  winReason: string;
  durationMs: number;
  messages: AnthropicMessage[];
  toolDefinitions: AnthropicToolDef[];
  steps: {
    stepNumber: number;
    toolName?: string;
    screenshotBeforeId?: string;
    screenshotUrl?: string;
  }[];
  defenderActions: {
    actionNumber: number;
    disruptionId: string;
    disruptionName: string;
    description: string;
  }[];
}

interface ShareGPTMessage {
  from: 'system' | 'human' | 'gpt' | 'tool';
  value: string;
}

interface ShareGPTTrainingExample {
  conversations: ShareGPTMessage[];
  metadata: {
    gameId: string;
    task: string;
    difficulty: string;
    winner: string;
    winReason: string;
    durationMs: number;
    numSteps: number;
    numToolCalls: number;
    hadDisruptions: boolean;
    source: string;
  };
}

// ── Conversion logic (exported for testing) ───────────────────────

/**
 * Convert Anthropic tool definitions to Qwen2.5 <tools> format.
 * Qwen expects OpenAI-style function definitions.
 */
export function convertToolDefs(tools: AnthropicToolDef[]): string {
  const openaiTools = tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
  return JSON.stringify(openaiTools);
}

/**
 * Build the system prompt with tool definitions in Qwen2.5 format.
 */
export function buildSystemPrompt(tools: AnthropicToolDef[]): string {
  const toolsJson = convertToolDefs(tools);
  return `You are a browser automation agent. Complete web tasks using the browser tools available to you.

# Tools

You may call one or more functions to assist with the user query.

You are provided with function signatures within <tools></tools> XML tags:
<tools>
${toolsJson}
</tools>

For each function call, return a json object with function name and arguments within <tool_call></tool_call> XML tags:
<tool_call>
{"name": "<function-name>", "arguments": <args-json-object>}
</tool_call>

# Instructions

- Use browser_snapshot to understand the current page state before acting.
- Use browser_navigate to go to URLs.
- Use browser_click to click elements (use the ref from snapshots).
- Use browser_type to type text into fields.
- When done, respond with "TASK COMPLETE" and describe what you accomplished.
- If you get stuck, try alternative approaches before giving up.
- Be methodical: snapshot first, then act.`;
}

/**
 * Convert a single Anthropic assistant message (with text + tool_use blocks)
 * to Qwen2.5 format with <tool_call> tags.
 */
export function convertAssistantMessage(
  content: AnthropicContentBlock[],
): string {
  const parts: string[] = [];

  for (const block of content) {
    if (block.type === 'text') {
      const text = (block as AnthropicTextBlock).text.trim();
      if (text) parts.push(text);
    } else if (block.type === 'tool_use') {
      const tu = block as AnthropicToolUseBlock;
      parts.push(
        `<tool_call>\n{"name": "${tu.name}", "arguments": ${JSON.stringify(tu.input)}}\n</tool_call>`,
      );
    }
  }

  return parts.join('\n');
}

/**
 * Convert Anthropic tool_result blocks to Qwen2.5 <tool_response> format.
 */
export function convertToolResults(
  content: AnthropicContentBlock[],
  messages: AnthropicMessage[],
  messageIndex: number,
): string {
  const parts: string[] = [];

  for (const block of content) {
    if (block.type === 'tool_result') {
      const tr = block as AnthropicToolResultBlock;
      // Find the corresponding tool_use to get the tool name
      const toolName = findToolName(tr.tool_use_id, messages, messageIndex);
      const responseContent = tr.is_error
        ? `Error: ${tr.content}`
        : tr.content;
      parts.push(
        `<tool_response>\n{"name": "${toolName}", "content": ${JSON.stringify(responseContent)}}\n</tool_response>`,
      );
    }
  }

  return parts.join('\n');
}

/**
 * Find the tool name for a given tool_use_id by searching backward through messages.
 */
function findToolName(
  toolUseId: string,
  messages: AnthropicMessage[],
  beforeIndex: number,
): string {
  for (let i = beforeIndex - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (
          block.type === 'tool_use' &&
          (block as AnthropicToolUseBlock).id === toolUseId
        ) {
          return (block as AnthropicToolUseBlock).name;
        }
      }
    }
  }
  return 'unknown_tool';
}

/**
 * Convert a full Anthropic conversation to ShareGPT format.
 */
export function convertTrajectory(
  raw: RawTrajectory,
): ShareGPTTrainingExample | null {
  const { messages, toolDefinitions } = raw;

  if (!messages || messages.length < 2) {
    console.error(
      `[convert] SKIP ${raw.gameId} — too few messages (${messages?.length || 0})`,
    );
    return null;
  }

  const conversations: ShareGPTMessage[] = [];

  // System prompt with tool definitions
  conversations.push({
    from: 'system',
    value: buildSystemPrompt(toolDefinitions),
  });

  let numToolCalls = 0;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        // First user message — extract just the task from the system prompt
        // The original prompt includes instructions; we simplify for training
        const taskMatch = msg.content.match(/TASK:\s*(.+?)(?:\n\nIMPORTANT:|$)/s);
        const taskText = taskMatch ? taskMatch[1].trim() : msg.content;
        conversations.push({ from: 'human', value: taskText });
      } else if (Array.isArray(msg.content)) {
        // Tool results
        const hasToolResults = msg.content.some(
          (b: AnthropicContentBlock) => b.type === 'tool_result',
        );
        if (hasToolResults) {
          const converted = convertToolResults(
            msg.content,
            messages,
            i,
          );
          conversations.push({ from: 'tool', value: converted });
        }
      }
    } else if (msg.role === 'assistant') {
      if (Array.isArray(msg.content)) {
        const toolUses = msg.content.filter(
          (b: AnthropicContentBlock) => b.type === 'tool_use',
        );
        numToolCalls += toolUses.length;
        const converted = convertAssistantMessage(msg.content);
        conversations.push({ from: 'gpt', value: converted });
      } else if (typeof msg.content === 'string') {
        conversations.push({ from: 'gpt', value: msg.content });
      }
    }
  }

  // Quality filter: minimum steps
  if (numToolCalls < MIN_STEPS) {
    console.error(
      `[convert] SKIP ${raw.gameId} — only ${numToolCalls} tool calls (min ${MIN_STEPS})`,
    );
    return null;
  }

  // Validate alternation: after system, should alternate human/gpt
  // (Allow consecutive same-role messages — they happen with multi-tool-call turns)

  return {
    conversations,
    metadata: {
      gameId: raw.gameId,
      task: raw.task.description,
      difficulty: raw.task.difficulty,
      winner: raw.winner,
      winReason: raw.winReason,
      durationMs: raw.durationMs,
      numSteps: raw.steps.length,
      numToolCalls,
      hadDisruptions: raw.defenderActions.length > 0,
      source: 'browser-brawl',
    },
  };
}

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
    const converted = convertTrajectory(raw);
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
