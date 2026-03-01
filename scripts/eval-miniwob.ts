#!/usr/bin/env tsx
/**
 * MiniWob++ benchmark evaluation for fine-tuned vs vanilla Qwen2.5-3B.
 *
 * Runs a curated set of MiniWob++ browser tasks using the same Playwright MCP
 * tool-calling interface the model was trained on. Compares pass rates between
 * fine-tuned and vanilla model endpoints.
 *
 * Prerequisites:
 *   git clone https://github.com/Farama-Foundation/miniwob-plusplus.git (outside this repo)
 *   npm install
 *   npx playwright install chromium
 *
 * Usage:
 *   npx tsx scripts/eval-miniwob.ts --finetuned-url <URL> --miniwob-dir ../miniwob-plusplus/miniwob/html
 *   npx tsx scripts/eval-miniwob.ts --finetuned-url <URL> --vanilla-url <URL> --episodes 3 --output data/miniwob_results.json
 */

import { chromium, type Page } from 'playwright-core';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { readFileSync, existsSync, writeFileSync, mkdirSync, renameSync } from 'fs';
import { resolve, join, dirname, extname } from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  buildSystemPrompt,
  type AnthropicToolDef,
} from '../src/lib/training-converter';
import { MINIWOB_TASKS, type MiniwobTask } from './miniwob-tasks';

// ── CLI args ───────────────────────────────────────────────────────

const args = process.argv.slice(2);

function flag(name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function hasFlag(name: string): boolean {
  return args.includes(name);
}

const FINETUNED_URL = flag('--finetuned-url');
const VANILLA_URL = flag('--vanilla-url');
const FINETUNED_API_KEY = flag('--finetuned-api-key');
const VANILLA_API_KEY = flag('--vanilla-api-key');
const FINETUNED_MODEL = flag('--finetuned-model');
const VANILLA_MODEL = flag('--vanilla-model');
const SONNET = hasFlag('--sonnet');
const ANTHROPIC_API_KEY = flag('--anthropic-api-key') || process.env.ANTHROPIC_API_KEY;
const MINIWOB_DIR = flag('--miniwob-dir');
const TASK_FILTER = flag('--tasks');
const EPISODES = parseInt(flag('--episodes') || '3', 10);
const MAX_STEPS_OVERRIDE = flag('--max-steps') ? parseInt(flag('--max-steps')!, 10) : undefined;
const SERVER_PORT = parseInt(flag('--port') || '8765', 10);
const CDP_PORT = parseInt(flag('--cdp-port') || '9222', 10);
const HEADLESS = hasFlag('--headless');
const OUTPUT_FILE = flag('--output');
const FINETUNED_ONLY = hasFlag('--finetuned-only');
const VANILLA_ONLY = hasFlag('--vanilla-only');
const SONNET_ONLY = hasFlag('--sonnet-only');
const RECORD = hasFlag('--record');
const RECORD_DIR = flag('--record-dir') || 'data/recordings';

// ── Validation ────────────────────────────────────────────────────

if (!FINETUNED_URL && !VANILLA_URL && !SONNET) {
  console.error('Error: provide at least one of --finetuned-url, --vanilla-url, or --sonnet');
  process.exit(1);
}

if (SONNET && !ANTHROPIC_API_KEY) {
  console.error('Error: --sonnet requires ANTHROPIC_API_KEY env var or --anthropic-api-key flag');
  process.exit(1);
}

if (!MINIWOB_DIR) {
  console.error('Error: --miniwob-dir is required (path to miniwob-plusplus/miniwob/html/)');
  process.exit(1);
}

const miniwobRoot = resolve(MINIWOB_DIR);
if (!existsSync(join(miniwobRoot, 'miniwob'))) {
  console.error(`Error: ${miniwobRoot}/miniwob/ not found. --miniwob-dir should point to the html/ directory.`);
  process.exit(1);
}

// Filter tasks
const selectedTasks = TASK_FILTER
  ? MINIWOB_TASKS.filter(t => TASK_FILTER!.split(',').includes(t.id))
  : MINIWOB_TASKS;

if (selectedTasks.length === 0) {
  console.error('Error: no matching tasks found');
  process.exit(1);
}

// ── Types ─────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

interface ParsedToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

interface EpisodeResult {
  taskId: string;
  episode: number;
  model: string;
  reward: number;
  passed: boolean;
  steps: number;
  toolCalls: number;
  durationMs: number;
  completionReason: 'wob_done' | 'task_complete' | 'max_steps' | 'error';
  error?: string;
}

// ── Static HTTP server for MiniWob++ HTML ─────────────────────────

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

function startStaticServer(rootDir: string, port: number): Promise<ReturnType<typeof createServer>> {
  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const urlPath = decodeURIComponent(req.url || '/');
      const filePath = join(rootDir, urlPath);

      try {
        if (!existsSync(filePath)) {
          res.writeHead(404);
          res.end('Not Found');
          return;
        }
        const data = readFileSync(filePath);
        const ext = extname(filePath);
        const mime = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime });
        res.end(data);
      } catch {
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    });

    server.listen(port, () => {
      console.log(`[server] MiniWob++ files served at http://localhost:${port}/`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

// ── Tool call parsing (matches training format) ───────────────────

const TOOL_CALL_REGEX = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;

function parseToolCalls(text: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(TOOL_CALL_REGEX.source, TOOL_CALL_REGEX.flags);
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      calls.push({
        name: parsed.name,
        arguments: parsed.arguments || parsed.args || {},
      });
    } catch {
      console.warn('[parse] Failed to parse tool call JSON:', match[1].slice(0, 100));
    }
  }
  return calls;
}

function formatToolResponse(toolName: string, content: string): string {
  return `<tool_response>\n{"name": "${toolName}", "content": ${JSON.stringify(content)}}\n</tool_response>`;
}

// ── Model calling ─────────────────────────────────────────────────

/**
 * Call an OpenAI-compatible chat completions endpoint.
 * Supports both /v1/chat/completions (standard) and custom endpoints
 * like Modal's /chat (which also returns {choices:[{message:{content}}]}).
 * The URL is used as-is — no path manipulation.
 */
async function callModel(
  endpointUrl: string,
  messages: ChatMessage[],
  options: { maxTokens?: number; temperature?: number; apiKey?: string; model?: string } = {},
): Promise<string> {
  const { maxTokens = 1024, temperature = 0.0, apiKey, model } = options;

  const body: Record<string, unknown> = {
    messages,
    max_tokens: maxTokens,
    temperature,
  };
  if (model) body.model = model;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const res = await fetch(endpointUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Model call failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  return data.choices[0]?.message?.content ?? '';
}

// ── Claude Sonnet support (Anthropic native tool_use) ─────────────

import Anthropic from '@anthropic-ai/sdk';

interface SonnetToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/**
 * Run a single agent step using Claude Sonnet with native tool_use.
 * Returns the assistant text response (reasoning + any TASK COMPLETE),
 * plus an array of tool calls to execute.
 */
async function callSonnet(
  anthropicClient: Anthropic,
  messages: Array<{ role: 'user' | 'assistant'; content: string | Anthropic.ContentBlock[] }>,
  tools: SonnetToolDef[],
  systemPrompt: string,
): Promise<{
  textContent: string;
  toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  stopReason: string;
}> {
  const response = await anthropicClient.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: systemPrompt,
    tools: tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Tool['input_schema'],
    })),
    messages: messages as Anthropic.MessageParam[],
  });

  const textParts: string[] = [];
  const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

  for (const block of response.content) {
    if (block.type === 'text') {
      textParts.push(block.text);
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      });
    }
  }

  return {
    textContent: textParts.join('\n'),
    toolCalls,
    stopReason: response.stop_reason ?? 'end_turn',
  };
}

// ── MCP client management ─────────────────────────────────────────

async function createMcpClient(cdpEndpoint: string): Promise<{ client: Client; transport: StdioClientTransport }> {
  const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const transport = new StdioClientTransport({
    command: npxCommand,
    args: [
      '@playwright/mcp@latest',
      '--cdp-endpoint', cdpEndpoint,
    ],
  });

  const client = new Client({ name: 'miniwob-eval', version: '1.0.0' });
  await client.connect(transport);
  return { client, transport };
}

async function closeMcpClient(client: Client, transport: StdioClientTransport): Promise<void> {
  try { await client.close(); } catch { /* ignore */ }
  try { await transport.close(); } catch { /* ignore */ }
}

// ── Episode runner ────────────────────────────────────────────────

async function runEpisode(params: {
  page: Page;
  endpointUrl: string;
  modelLabel: string;
  task: MiniwobTask;
  episode: number;
  cdpEndpoint: string;
  apiKey?: string;
  modelId?: string;
}): Promise<EpisodeResult> {
  const { page, endpointUrl, modelLabel, task, episode, cdpEndpoint, apiKey, modelId } = params;
  const maxSteps = MAX_STEPS_OVERRIDE ?? task.maxSteps;
  const startTime = Date.now();
  let stepNumber = 0;
  let toolCallCount = 0;
  let completionReason: EpisodeResult['completionReason'] = 'max_steps';

  try {
    // 1. Navigate to task
    await page.goto(`http://localhost:${SERVER_PORT}/miniwob/${task.id}.html`, {
      waitUntil: 'load',
      timeout: 15000,
    });
    await page.waitForTimeout(500);

    // 2. Extend timeout and start episode
    await page.evaluate(() => {
      (window as unknown as { core: { EPISODE_MAX_TIME: number } }).core.EPISODE_MAX_TIME = 120000;
    });
    await page.evaluate(() => {
      (window as unknown as { core: { startEpisodeReal: () => void } }).core.startEpisodeReal();
    });
    await page.waitForTimeout(500); // Let genProblem() run

    // 3. Read task instruction
    const utterance = await page.evaluate(() => {
      return (window as unknown as { core: { getUtterance: () => string } }).core.getUtterance();
    });

    if (!utterance) {
      return {
        taskId: task.id, episode, model: modelLabel,
        reward: -1, passed: false, steps: 0, toolCalls: 0,
        durationMs: Date.now() - startTime,
        completionReason: 'error', error: 'No utterance found',
      };
    }

    console.log(`  [${modelLabel}] ${task.id} ep${episode} — "${utterance}"`);

    // 4. Spawn Playwright MCP connected to the same browser
    const { client: mcpClient, transport } = await createMcpClient(cdpEndpoint);

    try {
      // 5. Discover tools and build system prompt
      const { tools: mcpToolList } = await mcpClient.listTools();
      const toolDefs: AnthropicToolDef[] = mcpToolList.map(t => ({
        name: t.name,
        description: t.description ?? '',
        input_schema: t.inputSchema as Record<string, unknown>,
      }));

      const systemPrompt = buildSystemPrompt(toolDefs);

      // 6. Build initial conversation
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: utterance },
      ];

      // 7. Agent loop
      while (stepNumber < maxSteps) {
        const responseText = await callModel(endpointUrl, messages, { apiKey, model: modelId });
        messages.push({ role: 'assistant', content: responseText });

        const toolCalls = parseToolCalls(responseText);

        // No tool calls — check if model says task complete
        if (toolCalls.length === 0) {
          if (responseText.toLowerCase().includes('task complete')) {
            completionReason = 'task_complete';
          }
          break;
        }

        // Execute tool calls
        const toolResponseParts: string[] = [];
        for (const tc of toolCalls) {
          toolCallCount++;
          stepNumber++;
          if (stepNumber > maxSteps) break;

          let resultText = '';
          try {
            const result = await mcpClient.callTool({
              name: tc.name,
              arguments: tc.arguments,
            });
            resultText = (result.content as Array<{ type: string; text?: string }>)
              ?.map(c => c.text ?? '').join('\n') ?? 'OK';
            resultText = resultText.slice(0, 10000);
          } catch (err) {
            resultText = `Error: ${err instanceof Error ? err.message : String(err)}`;
          }
          toolResponseParts.push(formatToolResponse(tc.name, resultText));
        }

        messages.push({ role: 'tool', content: toolResponseParts.join('\n\n') });

        // Check if MiniWob++ task auto-completed (its validator fired via endEpisode)
        // Reading a global via CDP is safe alongside an active MCP connection.
        try {
          const wobDone = await page.evaluate(() =>
            (window as unknown as { WOB_DONE_GLOBAL: boolean }).WOB_DONE_GLOBAL
          );
          if (wobDone) {
            completionReason = 'wob_done';
            break;
          }
        } catch {
          // If page.evaluate fails (e.g., page navigated away), continue the loop
        }
      }

      // Close MCP before reading reward
      await closeMcpClient(mcpClient, transport);

      // 8. Read reward from MiniWob++ globals
      const wobState = await page.evaluate(() => {
        const w = window as unknown as {
          WOB_DONE_GLOBAL: boolean;
          WOB_RAW_REWARD_GLOBAL: number;
          WOB_REWARD_REASON: string | null;
        };
        return {
          done: w.WOB_DONE_GLOBAL,
          rawReward: w.WOB_RAW_REWARD_GLOBAL,
          reason: w.WOB_REWARD_REASON,
        };
      });

      const reward = typeof wobState.rawReward === 'number' ? wobState.rawReward : -1;
      if (wobState.done && completionReason === 'max_steps') {
        completionReason = 'wob_done';
      }

      const passed = reward > 0;
      const symbol = passed ? 'PASS' : 'FAIL';
      console.log(`  [${modelLabel}] ${task.id} ep${episode} — ${symbol} (reward=${reward.toFixed(2)}, steps=${stepNumber}, ${completionReason})`);

      return {
        taskId: task.id, episode, model: modelLabel,
        reward, passed, steps: stepNumber, toolCalls: toolCallCount,
        durationMs: Date.now() - startTime, completionReason,
      };
    } catch (err) {
      await closeMcpClient(mcpClient, transport);
      throw err;
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`  [${modelLabel}] ${task.id} ep${episode} — ERROR: ${errorMsg}`);
    return {
      taskId: task.id, episode, model: modelLabel,
      reward: -1, passed: false, steps: stepNumber, toolCalls: toolCallCount,
      durationMs: Date.now() - startTime,
      completionReason: 'error', error: errorMsg,
    };
  }
}

// ── Sonnet episode runner ─────────────────────────────────────────

async function runSonnetEpisode(params: {
  page: Page;
  anthropicClient: Anthropic;
  task: MiniwobTask;
  episode: number;
  cdpEndpoint: string;
}): Promise<EpisodeResult> {
  const { page, anthropicClient, task, episode, cdpEndpoint } = params;
  const modelLabel = 'sonnet';
  const maxSteps = MAX_STEPS_OVERRIDE ?? task.maxSteps;
  const startTime = Date.now();
  let stepNumber = 0;
  let toolCallCount = 0;
  let completionReason: EpisodeResult['completionReason'] = 'max_steps';

  try {
    // 1. Navigate to task
    await page.goto(`http://localhost:${SERVER_PORT}/miniwob/${task.id}.html`, {
      waitUntil: 'load',
      timeout: 15000,
    });
    await page.waitForTimeout(500);

    // 2. Extend timeout and start episode
    await page.evaluate(() => {
      (window as unknown as { core: { EPISODE_MAX_TIME: number } }).core.EPISODE_MAX_TIME = 120000;
    });
    await page.evaluate(() => {
      (window as unknown as { core: { startEpisodeReal: () => void } }).core.startEpisodeReal();
    });
    await page.waitForTimeout(500);

    // 3. Read task instruction
    const utterance = await page.evaluate(() => {
      return (window as unknown as { core: { getUtterance: () => string } }).core.getUtterance();
    });

    if (!utterance) {
      return {
        taskId: task.id, episode, model: modelLabel,
        reward: -1, passed: false, steps: 0, toolCalls: 0,
        durationMs: Date.now() - startTime,
        completionReason: 'error', error: 'No utterance found',
      };
    }

    console.log(`  [${modelLabel}] ${task.id} ep${episode} — "${utterance}"`);

    // 4. Spawn Playwright MCP
    const { client: mcpClient, transport } = await createMcpClient(cdpEndpoint);

    try {
      // 5. Discover tools
      const { tools: mcpToolList } = await mcpClient.listTools();
      const toolDefs: SonnetToolDef[] = mcpToolList.map(t => ({
        name: t.name,
        description: t.description ?? '',
        input_schema: t.inputSchema as Record<string, unknown>,
      }));

      const systemPrompt = `You are a browser automation agent. Complete web tasks using the browser tools available to you.

# Instructions
- Use browser_snapshot to understand the current page state before acting.
- Use browser_navigate to go to URLs.
- Use browser_click to click elements (use the ref from snapshots).
- Use browser_type to type text into fields.
- When done, respond with "TASK COMPLETE" and describe what you accomplished.
- If you get stuck, try alternative approaches before giving up.
- Be methodical: snapshot first, then act.`;

      // 6. Build Anthropic messages (Sonnet uses native tool_use, not <tool_call> XML)
      const messages: Array<{ role: 'user' | 'assistant'; content: string | Anthropic.ContentBlock[] }> = [
        { role: 'user', content: utterance },
      ];

      // 7. Agent loop
      while (stepNumber < maxSteps) {
        const response = await callSonnet(anthropicClient, messages, toolDefs, systemPrompt);

        // No tool calls — check for task complete or end_turn
        if (response.toolCalls.length === 0) {
          messages.push({ role: 'assistant', content: response.textContent });
          if (response.textContent.toLowerCase().includes('task complete')) {
            completionReason = 'task_complete';
          }
          break;
        }

        // Build assistant content blocks — use response.content directly from API
        // to avoid type mismatches with SDK's ContentBlock (which includes extra fields)
        const assistantContent: Anthropic.ContentBlockParam[] = [];
        if (response.textContent) {
          assistantContent.push({ type: 'text', text: response.textContent });
        }
        for (const tc of response.toolCalls) {
          assistantContent.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.input,
          });
        }
        messages.push({ role: 'assistant', content: assistantContent as unknown as Anthropic.ContentBlock[] });

        // Execute tool calls and build tool_result blocks
        const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];
        for (const tc of response.toolCalls) {
          toolCallCount++;
          stepNumber++;
          if (stepNumber > maxSteps) break;

          let resultText = '';
          try {
            const result = await mcpClient.callTool({
              name: tc.name,
              arguments: tc.input,
            });
            resultText = (result.content as Array<{ type: string; text?: string }>)
              ?.map(c => c.text ?? '').join('\n') ?? 'OK';
            resultText = resultText.slice(0, 10000);
          } catch (err) {
            resultText = `Error: ${err instanceof Error ? err.message : String(err)}`;
          }

          toolResultBlocks.push({
            type: 'tool_result',
            tool_use_id: tc.id,
            content: resultText,
          });
        }

        messages.push({ role: 'user', content: toolResultBlocks as unknown as string });

        // Check if MiniWob++ task auto-completed
        try {
          const wobDone = await page.evaluate(() =>
            (window as unknown as { WOB_DONE_GLOBAL: boolean }).WOB_DONE_GLOBAL
          );
          if (wobDone) {
            completionReason = 'wob_done';
            break;
          }
        } catch {
          // continue
        }
      }

      await closeMcpClient(mcpClient, transport);

      // 8. Read reward
      const wobState = await page.evaluate(() => {
        const w = window as unknown as {
          WOB_DONE_GLOBAL: boolean;
          WOB_RAW_REWARD_GLOBAL: number;
          WOB_REWARD_REASON: string | null;
        };
        return {
          done: w.WOB_DONE_GLOBAL,
          rawReward: w.WOB_RAW_REWARD_GLOBAL,
          reason: w.WOB_REWARD_REASON,
        };
      });

      const reward = typeof wobState.rawReward === 'number' ? wobState.rawReward : -1;
      if (wobState.done && completionReason === 'max_steps') {
        completionReason = 'wob_done';
      }

      const passed = reward > 0;
      const symbol = passed ? 'PASS' : 'FAIL';
      console.log(`  [${modelLabel}] ${task.id} ep${episode} — ${symbol} (reward=${reward.toFixed(2)}, steps=${stepNumber}, ${completionReason})`);

      return {
        taskId: task.id, episode, model: modelLabel,
        reward, passed, steps: stepNumber, toolCalls: toolCallCount,
        durationMs: Date.now() - startTime, completionReason,
      };
    } catch (err) {
      await closeMcpClient(mcpClient, transport);
      throw err;
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`  [${modelLabel}] ${task.id} ep${episode} — ERROR: ${errorMsg}`);
    return {
      taskId: task.id, episode, model: modelLabel,
      reward: -1, passed: false, steps: stepNumber, toolCalls: toolCallCount,
      durationMs: Date.now() - startTime,
      completionReason: 'error', error: errorMsg,
    };
  }
}

// ── Metrics computation ───────────────────────────────────────────

interface TaskMetrics {
  taskId: string;
  passes: number;
  total: number;
  passRate: number;
  avgReward: number;
  avgSteps: number;
}

interface ModelMetrics {
  model: string;
  overall: { passes: number; total: number; passRate: number; avgReward: number };
  byTask: TaskMetrics[];
  byCategory: Record<string, { passes: number; total: number; passRate: number }>;
  byDifficulty: Record<string, { passes: number; total: number; passRate: number }>;
}

function computeMetrics(results: EpisodeResult[], modelLabel: string, tasks: MiniwobTask[]): ModelMetrics {
  const byTask: TaskMetrics[] = [];

  for (const task of tasks) {
    const episodes = results.filter(r => r.taskId === task.id);
    const passes = episodes.filter(r => r.passed).length;
    byTask.push({
      taskId: task.id,
      passes,
      total: episodes.length,
      passRate: episodes.length > 0 ? passes / episodes.length : 0,
      avgReward: episodes.length > 0 ? episodes.reduce((s, r) => s + r.reward, 0) / episodes.length : 0,
      avgSteps: episodes.length > 0 ? episodes.reduce((s, r) => s + r.steps, 0) / episodes.length : 0,
    });
  }

  const totalPasses = results.filter(r => r.passed).length;

  // By category
  const byCategory: Record<string, { passes: number; total: number; passRate: number }> = {};
  for (const cat of ['click', 'type', 'form', 'multi-step', 'navigation'] as const) {
    const taskIds = tasks.filter(t => t.category === cat).map(t => t.id);
    const catResults = results.filter(r => taskIds.includes(r.taskId));
    const catPasses = catResults.filter(r => r.passed).length;
    byCategory[cat] = {
      passes: catPasses,
      total: catResults.length,
      passRate: catResults.length > 0 ? catPasses / catResults.length : 0,
    };
  }

  // By difficulty
  const byDifficulty: Record<string, { passes: number; total: number; passRate: number }> = {};
  for (const diff of ['easy', 'medium', 'hard'] as const) {
    const taskIds = tasks.filter(t => t.difficulty === diff).map(t => t.id);
    const diffResults = results.filter(r => taskIds.includes(r.taskId));
    const diffPasses = diffResults.filter(r => r.passed).length;
    byDifficulty[diff] = {
      passes: diffPasses,
      total: diffResults.length,
      passRate: diffResults.length > 0 ? diffPasses / diffResults.length : 0,
    };
  }

  return {
    model: modelLabel,
    overall: {
      passes: totalPasses,
      total: results.length,
      passRate: results.length > 0 ? totalPasses / results.length : 0,
      avgReward: results.length > 0 ? results.reduce((s, r) => s + r.reward, 0) / results.length : 0,
    },
    byTask,
    byCategory,
    byDifficulty,
  };
}

// ── Output formatting ─────────────────────────────────────────────

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function printResults(ftMetrics: ModelMetrics | null, vanillaMetrics: ModelMetrics | null, tasks: MiniwobTask[]): void {
  const sep = '═'.repeat(70);
  const thin = '─'.repeat(70);

  console.log(`\n${sep}`);
  console.log('              MINIWOB++ EVALUATION RESULTS');
  console.log(sep);

  if (ftMetrics && vanillaMetrics) {
    // Side-by-side comparison
    console.log(`\n${'Task'.padEnd(28)} | ${'Fine-tuned'.padEnd(12)} | ${'Vanilla'.padEnd(12)} | Delta`);
    console.log(thin);

    for (const task of tasks) {
      const ft = ftMetrics.byTask.find(t => t.taskId === task.id);
      const vn = vanillaMetrics.byTask.find(t => t.taskId === task.id);
      if (!ft || !vn) continue;

      const ftStr = `${ft.passes}/${ft.total} (${pct(ft.passRate)})`;
      const vnStr = `${vn.passes}/${vn.total} (${pct(vn.passRate)})`;
      const delta = ft.passRate - vn.passRate;
      const deltaStr = delta > 0 ? `+${pct(delta)}` : delta < 0 ? pct(delta) : '  0%';

      console.log(`${task.id.padEnd(28)} | ${ftStr.padEnd(12)} | ${vnStr.padEnd(12)} | ${deltaStr}`);
    }

    console.log(thin);
    const ftOvr = `${ftMetrics.overall.passes}/${ftMetrics.overall.total} (${pct(ftMetrics.overall.passRate)})`;
    const vnOvr = `${vanillaMetrics.overall.passes}/${vanillaMetrics.overall.total} (${pct(vanillaMetrics.overall.passRate)})`;
    const ovrDelta = ftMetrics.overall.passRate - vanillaMetrics.overall.passRate;
    const ovrDeltaStr = ovrDelta > 0 ? `+${pct(ovrDelta)}` : pct(ovrDelta);
    console.log(`${'OVERALL'.padEnd(28)} | ${ftOvr.padEnd(12)} | ${vnOvr.padEnd(12)} | ${ovrDeltaStr}`);

    // By category
    console.log(`\nBy Category:`);
    for (const cat of Object.keys(ftMetrics.byCategory)) {
      const fc = ftMetrics.byCategory[cat];
      const vc = vanillaMetrics.byCategory[cat];
      const d = fc.passRate - vc.passRate;
      const ds = d > 0 ? `+${pct(d)}` : pct(d);
      console.log(`  ${cat.padEnd(14)} ${pct(fc.passRate).padStart(4)} vs ${pct(vc.passRate).padStart(4)}  (${ds})`);
    }

    // By difficulty
    console.log(`\nBy Difficulty:`);
    for (const diff of Object.keys(ftMetrics.byDifficulty)) {
      const fd = ftMetrics.byDifficulty[diff];
      const vd = vanillaMetrics.byDifficulty[diff];
      const d = fd.passRate - vd.passRate;
      const ds = d > 0 ? `+${pct(d)}` : pct(d);
      console.log(`  ${diff.padEnd(14)} ${pct(fd.passRate).padStart(4)} vs ${pct(vd.passRate).padStart(4)}  (${ds})`);
    }
  } else {
    // Single model
    const m = ftMetrics || vanillaMetrics!;
    console.log(`\nModel: ${m.model}`);
    console.log(`\n${'Task'.padEnd(28)} | ${'Result'.padEnd(12)} | Avg Steps`);
    console.log(thin);

    for (const tm of m.byTask) {
      const result = `${tm.passes}/${tm.total} (${pct(tm.passRate)})`;
      console.log(`${tm.taskId.padEnd(28)} | ${result.padEnd(12)} | ${tm.avgSteps.toFixed(1)}`);
    }

    console.log(thin);
    console.log(`${'OVERALL'.padEnd(28)} | ${m.overall.passes}/${m.overall.total} (${pct(m.overall.passRate)})`);

    console.log(`\nBy Category:`);
    for (const [cat, data] of Object.entries(m.byCategory)) {
      console.log(`  ${cat.padEnd(14)} ${pct(data.passRate).padStart(4)} (${data.passes}/${data.total})`);
    }
  }

  console.log('');
}

function printMultiModelResults(metrics: ModelMetrics[], tasks: MiniwobTask[]): void {
  const sep = '═'.repeat(80);
  const thin = '─'.repeat(80);

  console.log(`\n${sep}`);
  console.log('              MINIWOB++ EVALUATION RESULTS (3-way)');
  console.log(sep);

  // Header
  const header = 'Task'.padEnd(24) + ' | ' + metrics.map(m => m.model.padEnd(14)).join(' | ');
  console.log(`\n${header}`);
  console.log(thin);

  for (const task of tasks) {
    const cols = metrics.map(m => {
      const tm = m.byTask.find(t => t.taskId === task.id);
      return tm ? `${tm.passes}/${tm.total} (${pct(tm.passRate)})`.padEnd(14) : '—'.padEnd(14);
    });
    console.log(`${task.id.padEnd(24)} | ${cols.join(' | ')}`);
  }

  console.log(thin);
  const overallCols = metrics.map(m => {
    return `${m.overall.passes}/${m.overall.total} (${pct(m.overall.passRate)})`.padEnd(14);
  });
  console.log(`${'OVERALL'.padEnd(24)} | ${overallCols.join(' | ')}`);

  console.log(`\nBy Category:`);
  for (const cat of ['click', 'type', 'form', 'multi-step', 'navigation']) {
    const cols = metrics.map(m => {
      const c = m.byCategory[cat];
      return c ? pct(c.passRate).padStart(4) : '  —';
    });
    console.log(`  ${cat.padEnd(14)} ${cols.join('  ')}`);
  }

  console.log(`\nBy Difficulty:`);
  for (const diff of ['easy', 'medium', 'hard']) {
    const cols = metrics.map(m => {
      const d = m.byDifficulty[diff];
      return d ? pct(d.passRate).padStart(4) : '  —';
    });
    console.log(`  ${diff.padEnd(14)} ${cols.join('  ')}`);
  }

  console.log('');
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log('[eval] MiniWob++ Benchmark Evaluation');
  console.log(`[eval] Tasks: ${selectedTasks.length}, Episodes per task: ${EPISODES}`);
  console.log(`[eval] MiniWob++ dir: ${miniwobRoot}`);

  // 1. Start static file server
  const server = await startStaticServer(miniwobRoot, SERVER_PORT);

  // 2. Launch browser with explicit remote debugging port for Playwright MCP
  console.log(`[eval] Launching Chromium (headless=${HEADLESS}, CDP port=${CDP_PORT})...`);
  const browser = await chromium.launch({
    headless: HEADLESS,
    args: [
      `--remote-debugging-port=${CDP_PORT}`,
      '--disable-web-security',
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  const cdpUrl = `http://localhost:${CDP_PORT}`;

  if (RECORD) {
    mkdirSync(RECORD_DIR, { recursive: true });
    console.log(`[eval] Recording enabled — videos saved to ${resolve(RECORD_DIR)}`);
  }

  console.log(`[eval] Browser ready, CDP at ${cdpUrl}`);

  // 3. Build model endpoints list
  const endpoints: Array<{ url: string; label: string; apiKey?: string; modelId?: string }> = [];
  if (FINETUNED_URL && !VANILLA_ONLY && !SONNET_ONLY) {
    endpoints.push({ url: FINETUNED_URL, label: 'finetuned', apiKey: FINETUNED_API_KEY, modelId: FINETUNED_MODEL });
  }
  if (VANILLA_URL && !FINETUNED_ONLY && !SONNET_ONLY) {
    endpoints.push({ url: VANILLA_URL, label: 'vanilla', apiKey: VANILLA_API_KEY, modelId: VANILLA_MODEL });
  }

  // 4. Run evaluation
  // Each episode gets its own browser context so Playwright can record per-episode videos.
  const allResults: Record<string, EpisodeResult[]> = {};

  // Helper to create context and run an episode
  async function runWithContext(
    label: string,
    task: MiniwobTask,
    ep: number,
    runner: (page: Page) => Promise<EpisodeResult>,
  ): Promise<EpisodeResult> {
    const contextOptions: Parameters<typeof browser.newContext>[0] = {
      viewport: { width: 500, height: 420 },
    };
    if (RECORD) {
      contextOptions.recordVideo = {
        dir: join(RECORD_DIR, label),
        size: { width: 500, height: 420 },
      };
    }
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    const result = await runner(page);

    await page.close();
    if (RECORD) {
      const video = page.video();
      if (video) {
        const videoPath = await video.path();
        const newName = join(RECORD_DIR, label, `${task.id}_ep${ep}.webm`);
        try {
          renameSync(videoPath, newName);
          console.log(`  [record] Saved ${newName}`);
        } catch {
          console.log(`  [record] Video at ${videoPath}`);
        }
      }
    }
    await context.close();
    return result;
  }

  // Run OpenAI-compatible endpoints (finetuned, vanilla)
  for (const endpoint of endpoints) {
    console.log(`\n[eval] === Running ${endpoint.label} (${endpoint.url}) ===`);
    const results: EpisodeResult[] = [];

    for (const task of selectedTasks) {
      for (let ep = 1; ep <= EPISODES; ep++) {
        const result = await runWithContext(endpoint.label, task, ep, (page) =>
          runEpisode({
            page,
            endpointUrl: endpoint.url,
            modelLabel: endpoint.label,
            task,
            episode: ep,
            cdpEndpoint: cdpUrl,
            apiKey: endpoint.apiKey,
            modelId: endpoint.modelId,
          }),
        );
        results.push(result);
      }
    }

    allResults[endpoint.label] = results;
  }

  // Run Sonnet (native Anthropic API)
  if (SONNET && !FINETUNED_ONLY && !VANILLA_ONLY) {
    console.log(`\n[eval] === Running sonnet (Claude Sonnet 4) ===`);
    const anthropicClient = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const results: EpisodeResult[] = [];

    for (const task of selectedTasks) {
      for (let ep = 1; ep <= EPISODES; ep++) {
        const result = await runWithContext('sonnet', task, ep, (page) =>
          runSonnetEpisode({
            page,
            anthropicClient,
            task,
            episode: ep,
            cdpEndpoint: cdpUrl,
          }),
        );
        results.push(result);
      }
    }

    allResults['sonnet'] = results;
  }

  // 5. Compute and display metrics
  const ftResults = allResults['finetuned'];
  const vnResults = allResults['vanilla'];
  const sonnetResults = allResults['sonnet'];

  const ftMetrics = ftResults ? computeMetrics(ftResults, 'finetuned', selectedTasks) : null;
  const vnMetrics = vnResults ? computeMetrics(vnResults, 'vanilla', selectedTasks) : null;
  const sonnetMetrics = sonnetResults ? computeMetrics(sonnetResults, 'sonnet', selectedTasks) : null;

  // Print pairwise comparisons if we have multiple models
  const allMetrics = [ftMetrics, vnMetrics, sonnetMetrics].filter(Boolean) as ModelMetrics[];
  if (allMetrics.length === 2) {
    printResults(allMetrics[0], allMetrics[1], selectedTasks);
  } else if (allMetrics.length === 1) {
    printResults(allMetrics[0], null, selectedTasks);
  } else if (allMetrics.length === 3) {
    // Print all three — use a multi-model table
    printMultiModelResults(allMetrics, selectedTasks);
  }

  // 6. Save results JSON
  if (OUTPUT_FILE) {
    const dir = dirname(OUTPUT_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const output = {
      timestamp: new Date().toISOString(),
      config: {
        tasks: selectedTasks.map(t => t.id),
        episodes: EPISODES,
        maxStepsOverride: MAX_STEPS_OVERRIDE,
        headless: HEADLESS,
      },
      finetuned: ftResults ? { results: ftResults, metrics: ftMetrics } : null,
      vanilla: vnResults ? { results: vnResults, metrics: vnMetrics } : null,
      sonnet: sonnetResults ? { results: sonnetResults, metrics: sonnetMetrics } : null,
    };

    writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`[eval] Results saved to ${OUTPUT_FILE}`);
  }

  // 7. Cleanup
  await browser.close();
  server.close();

  console.log('[eval] Done.');
}

main().catch(err => {
  console.error('[eval] Fatal error:', err);
  process.exit(1);
});
