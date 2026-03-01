/**
 * Fine-tuned model attacker — uses the Qwen2.5-3B model served on Modal.
 *
 * Key differences from attacker-playwright.ts:
 *   - Calls FINETUNED_MODEL_URL (Modal vLLM endpoint) instead of Claude API
 *   - System prompt uses <tools> XML format (matches training data)
 *   - Parses <tool_call> XML from model text (not Anthropic tool_use blocks)
 *   - Formats tool results as <tool_response> XML
 *
 * Set FINETUNED_MODEL_URL in .env.local after deploying:
 *   modal deploy scripts/modal_serve.py --name <experiment-name>
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { getSession, createGate } from './game-session-store';
import { emitEvent } from './sse-emitter';
import { endGame } from './defender-agent';
import { nanoid } from 'nanoid';
import { recordAttackerStep, recordConversation, captureAndUploadScreenshot } from './data-collector';
import { snapshotDOM } from './browserbase';
import type { AttackerStepPayload, TurnChangePayload } from '@/types/events';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

interface ToolDef {
  name: string;
  description: string;
  inputSchema: unknown;
}

// ── System prompt (matches training data format from convert-to-sharegpt.ts) ──

function buildSystemPrompt(tools: ToolDef[]): string {
  const openaiTools = tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));

  return `You are a browser automation agent. Complete web tasks using the browser tools available to you.

# Tools

You may call one or more functions to assist with the user query.

You are provided with function signatures within <tools></tools> XML tags:
<tools>
${JSON.stringify(openaiTools)}
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

// ── Model call ─────────────────────────────────────────────────────────────────

async function callFinetunedModel(
  messages: ChatMessage[],
  signal: AbortSignal,
): Promise<string> {
  const url = process.env.FINETUNED_MODEL_URL;
  if (!url) {
    throw new Error(
      'FINETUNED_MODEL_URL is not set in .env.local. ' +
      'Deploy the model first: modal deploy scripts/modal_serve.py --name <experiment>',
    );
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, max_tokens: 1024, temperature: 0.0 }),
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Model endpoint returned ${res.status}: ${body}`);
  }

  const data = await res.json() as {
    choices?: Array<{ message: { content: string } }>;
    error?: string;
  };

  if (data.error) throw new Error(`Model error: ${data.error}`);
  return data.choices?.[0]?.message?.content ?? '';
}

// ── Tool call parsing ──────────────────────────────────────────────────────────

interface ParsedToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

function parseToolCalls(text: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];
  const pattern = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.name && typeof parsed.name === 'string') {
        calls.push({
          name: parsed.name,
          arguments: parsed.arguments ?? parsed.args ?? {},
        });
      }
    } catch {
      console.warn(`[finetuned] Failed to parse tool_call JSON: ${match[1].slice(0, 100)}`);
    }
  }

  return calls;
}

function formatToolResponse(toolName: string, content: string): string {
  return `<tool_response>\n{"name": "${toolName}", "content": ${JSON.stringify(content)}}\n</tool_response>`;
}

function stripToolCalls(text: string): string {
  return text.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();
}

// ── Attacker loop ─────────────────────────────────────────────────────────────

export async function runAttackerLoop(gameId: string, signal: AbortSignal): Promise<void> {
  const session = getSession(gameId);
  if (!session) return;

  // Spawn Playwright MCP connected to the remote browser
  const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const transport = new StdioClientTransport({
    command: npxCommand,
    args: ['@playwright/mcp@latest', '--cdp-endpoint', session.cdpUrl],
  });

  const mcpClient = new Client({ name: 'browser-brawl-finetuned', version: '1.0.0' });
  await mcpClient.connect(transport);

  const onAbort = () => {
    mcpClient.close().catch(() => {});
    transport.close().catch(() => {});
  };
  signal.addEventListener('abort', onAbort, { once: true });

  try {
    // Discover tools from Playwright MCP
    const { tools: mcpToolList } = await mcpClient.listTools();
    const tools: ToolDef[] = mcpToolList.map(t => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: t.inputSchema,
    }));

    const taskPrompt = session.task.startUrl
      ? `Navigate to ${session.task.startUrl} and then: ${session.task.description}`
      : session.task.description;

    // Build conversation — system + initial user task
    const messages: ChatMessage[] = [
      { role: 'system', content: buildSystemPrompt(tools) },
      { role: 'user', content: taskPrompt },
    ];

    let stepNumber = 0;
    let toolStepCount = 0;
    const MAX_STEPS = 50;

    while (!signal.aborted && toolStepCount < MAX_STEPS) {
      const s = getSession(gameId);
      if (!s || s.phase !== 'arena') break;

      s.attackerStatus = 'thinking';
      emitEvent(gameId, 'status_update', {
        attackerStatus: 'thinking',
        defenderStatus: s.defenderStatus,
      });

      const [preScreenshotId, domSnap] = await Promise.all([
        captureAndUploadScreenshot(session.cdpUrl).catch(() => null),
        snapshotDOM(session.cdpUrl).catch(() => null),
      ]);

      // Call the fine-tuned model
      console.log(`[finetuned] Step ${stepNumber + 1} — calling model...`);
      const responseText = await callFinetunedModel(messages, signal);
      console.log(`[finetuned] Response: ${responseText.slice(0, 200)}`);

      // Add assistant response to conversation
      messages.push({ role: 'assistant', content: responseText });

      // Persist full conversation for comparison/debugging
      recordConversation({
        gameId,
        stepNumber: stepNumber + 1,
        messages: JSON.stringify(messages),
        toolDefinitions: JSON.stringify(tools),
      });

      // Parse tool calls from the response
      const toolCalls = parseToolCalls(responseText);
      const reasoningText = stripToolCalls(responseText);

      if (reasoningText && toolCalls.length > 0) {
        stepNumber++;
        const thinkDesc = reasoningText.slice(0, 300);
        s.attackerSteps.push({
          id: nanoid(8),
          step: stepNumber,
          description: thinkDesc,
          timestamp: new Date().toISOString(),
          agentStatus: 'thinking',
        });
        emitEvent<AttackerStepPayload>(gameId, 'attacker_step', {
          step: stepNumber,
          description: thinkDesc,
          agentStatus: 'thinking',
          isComplete: false,
        });
      }

      if (toolCalls.length === 0) {
        // No tool calls — model is done or gave a final answer
        stepNumber++;
        const isComplete = responseText.toLowerCase().includes('task complete');
        console.log(`[finetuned] Final response (complete=${isComplete}): ${responseText.slice(0, 150)}`);

        emitEvent<AttackerStepPayload>(gameId, 'attacker_step', {
          step: stepNumber,
          description: responseText.slice(0, 200),
          agentStatus: isComplete ? 'complete' : 'acting',
          isComplete,
        });

        recordAttackerStep({
          gameId,
          stepNumber,
          description: responseText.slice(0, 200),
          agentStatus: isComplete ? 'complete' : 'acting',
          timestamp: new Date().toISOString(),
          domSnapshot: domSnap ?? undefined,
          screenshotBeforeId: preScreenshotId ?? undefined,
        });

        if (isComplete) {
          s.attackerStatus = 'complete';
          s.attackerSteps.push({
            id: nanoid(8),
            step: stepNumber,
            description: responseText.slice(0, 200),
            timestamp: new Date().toISOString(),
            agentStatus: 'complete',
          });
          endGame(gameId, 'attacker', 'task_complete');
        }
        break;
      }

      // Execute tool calls via Playwright MCP
      s.attackerStatus = 'acting';
      emitEvent(gameId, 'status_update', {
        attackerStatus: 'acting',
        defenderStatus: s.defenderStatus,
      });

      const toolResponseParts: string[] = [];

      for (const toolCall of toolCalls) {
        if (signal.aborted || toolStepCount >= MAX_STEPS) break;

        toolStepCount++;
        stepNumber++;

        const description = `${toolCall.name}(${summarizeArgs(toolCall.arguments)})`;
        console.log(`[finetuned] Tool: ${description}`);

        s.attackerSteps.push({
          id: nanoid(8),
          step: stepNumber,
          description,
          timestamp: new Date().toISOString(),
          agentStatus: 'acting',
        });
        emitEvent<AttackerStepPayload>(gameId, 'attacker_step', {
          step: stepNumber,
          description,
          agentStatus: 'acting',
          isComplete: false,
        });

        let toolResultText = '';
        try {
          const result = await mcpClient.callTool({
            name: toolCall.name,
            arguments: toolCall.arguments,
          });
          const resultContent = (result.content as Array<{ type: string; text?: string }>)
            ?.map(c => c.text ?? '')
            .join('\n') ?? 'OK';

          toolResultText = resultContent.slice(0, 10000);
        } catch (err) {
          toolResultText = `Error: ${err instanceof Error ? err.message : String(err)}`;
          console.error(`[finetuned] tool ${toolCall.name} error:`, err);
        }

        toolResponseParts.push(formatToolResponse(toolCall.name, toolResultText));

        recordAttackerStep({
          gameId,
          stepNumber,
          toolName: toolCall.name,
          toolInput: JSON.stringify(toolCall.arguments).slice(0, 2000),
          toolResultSummary: toolResultText.slice(0, 5000),
          description,
          agentStatus: 'acting',
          timestamp: new Date().toISOString(),
          domSnapshot: domSnap ?? undefined,
          screenshotBeforeId: preScreenshotId ?? undefined,
        });
      }

      // Add combined tool responses as a single tool message
      messages.push({
        role: 'tool',
        content: toolResponseParts.join('\n\n'),
      });

      recordConversation({
        gameId,
        stepNumber,
        messages: JSON.stringify(messages),
        toolDefinitions: JSON.stringify(tools),
      });

      // Turn-based mode gate
      if (s.mode === 'turnbased' && toolCalls.length > 0) {
        s.attackerStepsThisTurn++;

        if (s.attackerStepsThisTurn >= s.attackerStepsPerTurn) {
          s.currentTurn = 'defender';
          emitEvent<TurnChangePayload>(gameId, 'turn_change', {
            currentTurn: 'defender',
            turnNumber: s.turnNumber,
            attackerStepsRemaining: 0,
            attackerStepsPerTurn: s.attackerStepsPerTurn,
          });

          const gate = createGate();
          s.attackerGate = gate;
          s.attackerStatus = 'idle';
          emitEvent(gameId, 'status_update', {
            attackerStatus: 'idle',
            defenderStatus: 'plotting',
          });

          if (s.defenderSignal) {
            s.defenderSignal.resolve();
            s.defenderSignal = null;
          }

          await gate.promise;
          if (signal.aborted || s.phase !== 'arena') break;

          s.attackerStepsThisTurn = 0;
          s.turnNumber++;
          s.currentTurn = 'attacker';
          emitEvent<TurnChangePayload>(gameId, 'turn_change', {
            currentTurn: 'attacker',
            turnNumber: s.turnNumber,
            attackerStepsRemaining: s.attackerStepsPerTurn,
            attackerStepsPerTurn: s.attackerStepsPerTurn,
          });
        } else {
          emitEvent<TurnChangePayload>(gameId, 'turn_change', {
            currentTurn: 'attacker',
            turnNumber: s.turnNumber,
            attackerStepsRemaining: s.attackerStepsPerTurn - s.attackerStepsThisTurn,
            attackerStepsPerTurn: s.attackerStepsPerTurn,
          });
        }
      }

      await sleep(500);
    }

    const s = getSession(gameId);
    if (s && s.phase === 'arena' && s.attackerStatus !== 'complete') {
      s.attackerStatus = 'failed';
      emitEvent(gameId, 'status_update', {
        attackerStatus: 'failed',
        defenderStatus: s.defenderStatus,
      });
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
    try { await mcpClient.close(); } catch { /* ignore */ }
    try { await transport.close(); } catch { /* ignore */ }
  }
}

function summarizeArgs(args: Record<string, unknown>): string {
  const parts: string[] = [];
  if (args.url) parts.push(`url: "${String(args.url).slice(0, 50)}"`);
  if (args.ref) parts.push(`ref: "${args.ref}"`);
  if (args.text) parts.push(`text: "${String(args.text).slice(0, 30)}"`);
  if (args.selector) parts.push(`sel: "${String(args.selector).slice(0, 30)}"`);
  if (parts.length === 0) return Object.keys(args).slice(0, 3).join(', ');
  return parts.join(', ');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
