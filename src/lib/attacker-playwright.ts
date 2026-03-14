import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { observe } from '@lmnr-ai/lmnr';
import { getSession, createGate } from './game-session-store';
import { emitEvent } from './sse-emitter';
import { endGame } from './defender-agent';
import { recordConversation, captureAndUploadScreenshot } from './data-collector';
import { snapshotDOM } from './cdp';
import { AttackerStepLogger } from './attacker-step-logger';
import { buildPlaywrightMcpLaunchArgs } from './playwright-mcp-launcher';
import { log, logError } from './log';
import { createModelProvider } from './model-providers';
import { AnthropicProvider } from './model-providers/anthropic-provider';
import type { LLMProvider, ToolResult } from './model-providers/types';
import type { TurnChangePayload } from '@/types/events';

/**
 * Run the attacker agent loop using Playwright MCP + a pluggable LLM provider:
 * 1. Spawn Playwright MCP server connected to the remote browser via CDP
 * 2. Use the LLM provider (Anthropic/OpenAI/Gemini) to drive reasoning
 * 3. The model decides actions, Playwright MCP executes them
 * 4. Emit SSE events for each step
 */
export async function runAttackerLoop(gameId: string, signal: AbortSignal): Promise<void> {
  const session = getSession(gameId);
  if (!session) return;

  // Resolve model provider from session (defaults to Anthropic Claude Sonnet 4)
  let provider: LLMProvider;
  if (session.modelProvider && session.modelId) {
    provider = createModelProvider(session.modelProvider, session.modelId);
  } else {
    provider = new AnthropicProvider('claude-sonnet-4-6');
  }

  log(`[attacker] Using provider: ${provider.provider} model: ${provider.modelId}`);

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

    // Initialize provider with MCP tools
    provider.initTools(mcpToolList);

    // 3. Build initial message
    const taskPrompt = session.task.startUrl
      ? `Navigate to ${session.task.startUrl} and then: ${session.task.description}`
      : session.task.description;

    provider.initMessages(taskPrompt);

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
          metadata: { gameId, difficulty: session.difficulty, task: session.task.label, attackerType: 'playwright-mcp', provider: provider.provider, model: provider.modelId },
          tags: ['attacker', `step-${loopStepNum}`],
        },
        async () => {
      s.attackerStatus = 'thinking';
      emitEvent(gameId, 'status_update', {
        attackerStatus: 'thinking',
        defenderStatus: s.defenderStatus,
      });

      // Start screenshot + DOM capture immediately so model call can run in parallel.
      const preScreenshotPromise = captureAndUploadScreenshot(session.cdpUrl).catch(() => null);

      // Start DOM snapshot concurrently with model call (fast, ~500ms)
      const domSnapPromise = snapshotDOM(session.cdpUrl).catch(() => null);

      // Call the model
      log(`[attacker] Step ${logger.currentStep + 1} — calling ${provider.provider}/${provider.modelId} (loop start +${Date.now() - loopT0}ms)...`);
      const response = await provider.call(signal);

      if (response.usage) {
        log(`[attacker] Usage: ${response.usage.inputTokens} in / ${response.usage.outputTokens} out`);
      }

      // Collect capture artifacts after model responds.
      const [preScreenshotId, domSnap] = await Promise.all([
        preScreenshotPromise,
        domSnapPromise,
      ]);

      // Persist full conversation for training data extraction
      const snapshot = provider.getConversationSnapshot();
      recordConversation({
        gameId,
        stepNumber: logger.currentStep + 1,
        messages: snapshot.messages,
        toolDefinitions: snapshot.toolDefinitions,
      });

      // Emit model's reasoning text as a "thinking" step
      if (response.reasoningText && response.toolCalls.length > 0) {
        logger.logThinking({
          description: response.reasoningText.slice(0, 300),
          screenshotId: preScreenshotId,
          domSnapshot: domSnap,
        });
      }

      if (response.toolCalls.length === 0) {
        // No tool calls — model is done or responding with text
        const isComplete = response.isComplete;
        log(`[attacker] Text response (complete=${isComplete}): ${response.reasoningText.slice(0, 150)}`);

        if (isComplete) {
          logger.logComplete({
            description: response.reasoningText.slice(0, 200),
            success: true,
            screenshotId: preScreenshotId,
            domSnapshot: domSnap,
          });
          endGame(gameId, 'attacker', 'task_complete');
        } else {
          logger.logAction({
            description: response.reasoningText.slice(0, 200),
            screenshotId: preScreenshotId,
            domSnapshot: domSnap,
          });
        }
        return { action: 'break', hadToolUses: false } as const;
      }

      // Execute each tool call via MCP
      const toolResults: ToolResult[] = [];

      for (const toolCall of response.toolCalls) {
        // Check abort before each tool call so we stop promptly on game end
        if (signal.aborted) break;
        if (toolStepCount >= MAX_STEPS) break;

        toolStepCount++;

        const description = `${toolCall.name}(${summarizeInput(toolCall.arguments)})`;
        log(`[attacker] Tool: ${description}`);

        // Execute via MCP
        let toolResultSummary = '';
        try {
          const result = await mcpClient.callTool({
            name: toolCall.name,
            arguments: toolCall.arguments,
          });

          // Convert MCP result to string
          const resultContent = (result.content as Array<{ type: string; text?: string }>)
            ?.map(c => c.text ?? '')
            .join('\n') ?? 'OK';

          toolResultSummary = resultContent.slice(0, 5000);
          log(`[attacker] Tool result | ${toolCall.name} full=${resultContent.length}chars saved=${toolResultSummary.length}chars`);

          toolResults.push({
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            content: resultContent.slice(0, 10000),
            isError: false,
          });
        } catch (err) {
          logError(`[attacker] tool ${toolCall.name} error:`, err);
          toolResultSummary = `Error: ${err instanceof Error ? err.message : String(err)}`;
          toolResults.push({
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            content: toolResultSummary,
            isError: true,
          });
        }

        // Log tool step via unified logger (SSE + in-memory + Convex)
        logger.logAction({
          description,
          toolName: toolCall.name,
          toolInput: JSON.stringify(toolCall.arguments).slice(0, 2000),
          toolResult: toolResultSummary,
          screenshotId: preScreenshotId,
          domSnapshot: domSnap,
        });
      }

      // Add tool results to conversation via provider
      provider.appendToolResults(toolResults);

      // Persist conversation with tool results included
      const snapshot2 = provider.getConversationSnapshot();
      log(`[attacker] Saving full turn | step=${logger.currentStep} toolResults=${toolResults.length}`);
      recordConversation({
        gameId,
        stepNumber: logger.currentStep,
        messages: snapshot2.messages,
        toolDefinitions: snapshot2.toolDefinitions,
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
