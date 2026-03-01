import Anthropic from '@anthropic-ai/sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { observe } from '@lmnr-ai/lmnr';
import { getSession, createGate } from './game-session-store';
import { emitEvent } from './sse-emitter';
import { endGame } from './defender-agent';
import { getAnthropicApiKey } from './env';
import { recordConversation, captureAndUploadScreenshot } from './data-collector';
import { snapshotDOM } from './cdp';
import { AttackerStepLogger } from './attacker-step-logger';
import { buildPlaywrightMcpLaunchArgs } from './playwright-mcp-launcher';
import { log, logError } from './log';
import type { TurnChangePayload } from '@/types/events';

const anthropic = new Anthropic({ apiKey: getAnthropicApiKey() });

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
  const mcpLaunch = buildPlaywrightMcpLaunchArgs(session.cdpUrl);
  const transport = new StdioClientTransport({
    command: mcpLaunch.command,
    args: mcpLaunch.args,
    env: mcpLaunch.env,
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

    // Cache tool definitions as JSON for training data persistence
    const toolDefsJson = JSON.stringify(tools);

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

    const logger = new AttackerStepLogger(gameId);
    let toolStepCount = 0;
    const MAX_STEPS = 50;

    // 4. Agentic loop
    while (!signal.aborted && toolStepCount < MAX_STEPS) {
      const s = getSession(gameId);
      if (!s || s.phase !== 'arena') break;

      const loopStepNum = logger.currentStep + 1;
      const loopT0 = Date.now();
      const loopResult = await observe(
        {
          name: `attacker-step-${loopStepNum}`,
          sessionId: gameId,
          metadata: { gameId, difficulty: session.difficulty, task: session.task.label, attackerType: 'playwright-mcp' },
          tags: ['attacker', `step-${loopStepNum}`],
        },
        async () => {
      s.attackerStatus = 'thinking';
      emitEvent(gameId, 'status_update', {
        attackerStatus: 'thinking',
        defenderStatus: s.defenderStatus,
      });

      // Start screenshot + DOM capture immediately so Claude call can run in parallel.
      const preScreenshotPromise = captureAndUploadScreenshot(session.cdpUrl).catch(() => null);

      // Start DOM snapshot concurrently with Claude call (fast, ~500ms)
      const domSnapPromise = snapshotDOM(session.cdpUrl).catch(() => null);

      // Call Claude immediately
      log(`[attacker] Step ${logger.currentStep + 1} — calling Claude (loop start +${Date.now() - loopT0}ms)...`);
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        tools,
        messages,
      }, { signal });

      // Collect capture artifacts after Claude responds.
      const [preScreenshotId, domSnap] = await Promise.all([
        preScreenshotPromise,
        domSnapPromise,
      ]);

      // Process response content
      const assistantContent = response.content;
      messages.push({ role: 'assistant', content: assistantContent });

      const blockTypes = assistantContent.map(b => b.type).join(', ');
      log(`[training-data] Claude response | step=${logger.currentStep + 1} blocks=[${blockTypes}] stop=${response.stop_reason}`);

      // Persist full conversation for training data extraction
      recordConversation({
        gameId,
        stepNumber: logger.currentStep + 1,
        messages: JSON.stringify(messages),
        toolDefinitions: toolDefsJson,
      });

      // Check if there are tool uses
      const toolUses = assistantContent.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      // Emit Claude's reasoning text as a "thinking" step
      const textBlocks = assistantContent.filter(
        (block): block is Anthropic.TextBlock => block.type === 'text'
      );
      const reasoningText = textBlocks.map(b => b.text).join('\n').trim();
      if (reasoningText && toolUses.length > 0) {
        logger.logThinking({
          description: reasoningText.slice(0, 300),
          screenshotId: preScreenshotId,
          domSnapshot: domSnap,
        });
      }

      if (toolUses.length === 0) {
        // No tool calls — Claude is done or responding with text
        const finalText = textBlocks.map(b => b.text).join('\n');
        const isComplete = finalText.toLowerCase().includes('task complete');
        log(`[attacker] Text response (complete=${isComplete}): ${finalText.slice(0, 150)}`);

        if (isComplete) {
          logger.logComplete({
            description: finalText.slice(0, 200),
            success: true,
            screenshotId: preScreenshotId,
            domSnapshot: domSnap,
          });
          endGame(gameId, 'attacker', 'task_complete');
        } else {
          logger.logAction({
            description: finalText.slice(0, 200),
            screenshotId: preScreenshotId,
            domSnapshot: domSnap,
          });
        }
        return { action: 'break', hadToolUses: false } as const;
      }

      // Execute each tool call via MCP
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUses) {
        // Check abort before each tool call so we stop promptly on game end
        if (signal.aborted) break;
        if (toolStepCount >= MAX_STEPS) break;

        toolStepCount++;

        const description = `${toolUse.name}(${summarizeInput(toolUse.input)})`;
        log(`[attacker] Tool: ${description}`);

        // Execute via MCP
        let toolResultSummary = '';
        try {
          const result = await mcpClient.callTool({
            name: toolUse.name,
            arguments: toolUse.input as Record<string, unknown>,
          });

          // Convert MCP result to Anthropic tool result format
          const resultContent = (result.content as Array<{ type: string; text?: string }>)
            ?.map(c => c.text ?? '')
            .join('\n') ?? 'OK';

          toolResultSummary = resultContent.slice(0, 5000);
          log(`[training-data] Tool result | ${toolUse.name} full=${resultContent.length}chars saved=${toolResultSummary.length}chars`);

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: resultContent.slice(0, 10000), // Truncate large responses
          });
        } catch (err) {
          logError(`[attacker] tool ${toolUse.name} error:`, err);
          toolResultSummary = `Error: ${err instanceof Error ? err.message : String(err)}`;
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: toolResultSummary,
            is_error: true,
          });
        }

        // Log tool step via unified logger (SSE + in-memory + Convex)
        logger.logAction({
          description,
          toolName: toolUse.name,
          toolInput: JSON.stringify(toolUse.input).slice(0, 2000),
          toolResult: toolResultSummary,
          screenshotId: preScreenshotId,
          domSnapshot: domSnap,
        });
      }

      // Add tool results to conversation
      messages.push({ role: 'user', content: toolResults });

      log(`[training-data] Saving full turn | step=${logger.currentStep} toolResults=${toolResults.length}`);
      // Persist conversation with tool results included
      recordConversation({
        gameId,
        stepNumber: logger.currentStep,
        messages: JSON.stringify(messages),
        toolDefinitions: toolDefsJson,
      });

      return { action: 'continue', hadToolUses: true } as const;
        },
      ); // end observe()

      if (loopResult.action === 'break') break;

      // Turn-based: check if attacker's turn is exhausted
      if (s.mode === 'turnbased' && loopResult.hadToolUses) {
        s.attackerStepsThisTurn++;

        if (s.attackerStepsThisTurn >= s.attackerStepsPerTurn) {
          // Attacker turn is over — hand off to defender
          s.currentTurn = 'defender';

          emitEvent<TurnChangePayload>(gameId, 'turn_change', {
            currentTurn: 'defender',
            turnNumber: s.turnNumber,
            attackerStepsRemaining: 0,
            attackerStepsPerTurn: s.attackerStepsPerTurn,
          });

          // Create gate and wake defender
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

          // Block until defender finishes
          await gate.promise;

          // Check if game ended during defender turn
          if (signal.aborted || s.phase !== 'arena') break;

          // Start new attacker turn
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
          // Still attacker's turn — emit progress
          emitEvent<TurnChangePayload>(gameId, 'turn_change', {
            currentTurn: 'attacker',
            turnNumber: s.turnNumber,
            attackerStepsRemaining: s.attackerStepsPerTurn - s.attackerStepsThisTurn,
            attackerStepsPerTurn: s.attackerStepsPerTurn,
          });
        }
      }

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
