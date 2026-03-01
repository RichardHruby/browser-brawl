import Anthropic from '@anthropic-ai/sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { getSession } from './game-session-store';
import { emitEvent } from './sse-emitter';
import { endGame } from './defender-agent';
import { nanoid } from 'nanoid';
import type { AttackerStepPayload } from '@/types/events';

const anthropic = new Anthropic();

/**
 * Run the attacker agent loop using Playwright MCP + Anthropic SDK:
 * 1. Spawn Playwright MCP server connected to the remote browser via CDP
 * 2. Use Anthropic SDK to drive Claude with Playwright MCP tools
 * 3. Claude decides actions, Playwright MCP executes them
 * 4. Emit SSE events for each step
 */
export async function runAttackerLoop(gameId: string, signal: AbortSignal): Promise<void> {
  const session = getSession(gameId);
  if (!session) return;

  // 1. Spawn Playwright MCP as a child process connected to the remote browser
  const transport = new StdioClientTransport({
    command: 'npx',
    args: [
      '@playwright/mcp@latest',
      '--cdp-endpoint', session.cdpUrl,
    ],
  });

  const mcpClient = new Client({ name: 'browser-brawl-attacker', version: '1.0.0' });
  await mcpClient.connect(transport);

  // Proactively tear down MCP when the game is aborted to avoid orphaned processes
  const onAbort = () => {
    mcpClient.close().catch(() => {});
    transport.close().catch(() => {});
  };
  signal.addEventListener('abort', onAbort, { once: true });

  try {
    // 2. Discover available tools from Playwright MCP
    const { tools: mcpToolList } = await mcpClient.listTools();

    // Convert MCP tools to Anthropic tool format
    const tools: Anthropic.Tool[] = mcpToolList.map(tool => ({
      name: tool.name,
      description: tool.description ?? '',
      input_schema: tool.inputSchema as Anthropic.Tool['input_schema'],
    }));

    // 3. Build initial message
    const taskPrompt = session.task.startUrl
      ? `Navigate to ${session.task.startUrl} and then: ${session.task.description}`
      : session.task.description;

    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: `You are a browser automation agent. Complete the following task using the browser tools available to you.

TASK: ${taskPrompt}

IMPORTANT:
- Use browser_snapshot to understand the current page state before acting.
- Use browser_navigate to go to URLs.
- Use browser_click to click elements (use the ref from snapshots).
- Use browser_type to type text into fields.
- When done, respond with a message saying "TASK COMPLETE" and describe what you accomplished.
- If you get stuck, try alternative approaches before giving up.
- Be methodical: snapshot first, then act.`,
      },
    ];

    let stepNumber = 0;
    const MAX_STEPS = 50;

    // 4. Agentic loop
    while (!signal.aborted && stepNumber < MAX_STEPS) {
      const s = getSession(gameId);
      if (!s || s.phase !== 'arena') break;

      s.attackerStatus = 'thinking';
      emitEvent(gameId, 'status_update', {
        attackerStatus: 'thinking',
        defenderStatus: s.defenderStatus,
      });

      // Call Claude (pass abort signal so the request is cancelled on game end)
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        tools,
        messages,
      }, { signal });

      // Process response content
      const assistantContent = response.content;
      messages.push({ role: 'assistant', content: assistantContent });

      // Check if there are tool uses
      const toolUses = assistantContent.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      if (toolUses.length === 0) {
        // No tool calls — Claude is done or responding with text
        const textBlocks = assistantContent.filter(
          (block): block is Anthropic.TextBlock => block.type === 'text'
        );
        const finalText = textBlocks.map(b => b.text).join('\n');

        stepNumber++;
        const isComplete = finalText.toLowerCase().includes('task complete');

        emitEvent<AttackerStepPayload>(gameId, 'attacker_step', {
          step: stepNumber,
          description: isComplete ? finalText.slice(0, 200) : finalText.slice(0, 200),
          agentStatus: isComplete ? 'complete' : 'acting',
          isComplete,
        });

        if (isComplete) {
          s.attackerStatus = 'complete';
          s.attackerSteps.push({
            id: nanoid(8),
            step: stepNumber,
            description: finalText.slice(0, 200),
            timestamp: new Date().toISOString(),
            agentStatus: 'complete',
          });
          endGame(gameId, 'attacker', 'task_complete');
        }
        break;
      }

      // Execute each tool call via MCP
      s.attackerStatus = 'acting';
      emitEvent(gameId, 'status_update', {
        attackerStatus: 'acting',
        defenderStatus: s.defenderStatus,
      });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUses) {
        // Check abort before each tool call so we stop promptly on game end
        if (signal.aborted) break;

        stepNumber++;

        // Emit step event
        const description = `${toolUse.name}(${summarizeInput(toolUse.input)})`;
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

        // Execute via MCP
        try {
          const result = await mcpClient.callTool({
            name: toolUse.name,
            arguments: toolUse.input as Record<string, unknown>,
          });

          // Convert MCP result to Anthropic tool result format
          const resultContent = (result.content as Array<{ type: string; text?: string }>)
            ?.map(c => c.text ?? '')
            .join('\n') ?? 'OK';

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: resultContent.slice(0, 10000), // Truncate large responses
          });
        } catch (err) {
          console.error(`[attacker] tool ${toolUse.name} error:`, err);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: `Error: ${err instanceof Error ? err.message : String(err)}`,
            is_error: true,
          });
        }
      }

      // Add tool results to conversation
      messages.push({ role: 'user', content: toolResults });

      // Small delay between steps to avoid rate limiting
      await sleep(500);
    }

    // If we hit max steps without completing
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
    // Clean up MCP connection
    try {
      await mcpClient.close();
    } catch {
      // ignore cleanup errors
    }
    try {
      await transport.close();
    } catch {
      // ignore cleanup errors
    }
  }
}

function summarizeInput(input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const obj = input as Record<string, unknown>;
  const parts: string[] = [];
  if (obj.url) parts.push(`url: "${String(obj.url).slice(0, 50)}"`);
  if (obj.ref) parts.push(`ref: "${obj.ref}"`);
  if (obj.text) parts.push(`text: "${String(obj.text).slice(0, 30)}"`);
  if (obj.selector) parts.push(`sel: "${String(obj.selector).slice(0, 30)}"`);
  if (obj.element) parts.push(`el: "${String(obj.element).slice(0, 30)}"`);
  if (parts.length === 0) {
    const keys = Object.keys(obj).slice(0, 3);
    return keys.join(', ');
  }
  return parts.join(', ');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
