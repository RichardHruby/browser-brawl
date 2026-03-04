import { Stagehand } from '@browserbasehq/stagehand';
import { getSession } from './game-session-store';
import { emitEvent } from './sse-emitter';
import { endGame } from './defender-agent';
import { captureAndUploadScreenshot, recordConversation } from './data-collector';
import { snapshotDOM } from './cdp';
import { AttackerStepLogger } from './attacker-step-logger';
import { log } from './log';

const MAX_STEPS = 50;

/**
 * Discover the browser-level WebSocket debugger URL from a CDP HTTP endpoint.
 * Browser-Use gives us `https://SESSION.cdp0.browser-use.com` but Stagehand
 * needs the actual WebSocket URL (e.g. `ws://HOST/devtools/browser/GUID`).
 */
async function discoverWsUrl(cdpHttpUrl: string): Promise<string> {
  const httpBase = cdpHttpUrl
    .replace('wss://', 'https://')
    .replace('ws://', 'http://');
  const base = new URL(httpBase);

  // Try /json/version first (browser-level WebSocket URL)
  try {
    const versionRes = await fetch(`${base.protocol}//${base.host}/json/version`);
    if (versionRes.ok) {
      const info = await versionRes.json();
      if (info.webSocketDebuggerUrl) {
        return info.webSocketDebuggerUrl as string;
      }
    }
  } catch {
    // fall through to next attempt
  }

  // Fallback: try /json to find a page target's debugger URL
  try {
    const targetsRes = await fetch(`${base.protocol}//${base.host}/json`);
    if (targetsRes.ok) {
      const targets = await targetsRes.json();
      const page = targets.find((t: { type: string; webSocketDebuggerUrl?: string }) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) {
        return page.webSocketDebuggerUrl as string;
      }
    }
  } catch {
    // fall through
  }

  throw new Error(`Could not discover WebSocket debugger URL from ${cdpHttpUrl}`);
}

/**
 * Run the attacker agent loop using Stagehand (streaming mode):
 * 1. Connect to the remote browser via CDP
 * 2. Use Stagehand's streaming agent for autonomous task completion
 * 3. Emit reasoning via text stream BEFORE tools run (thinking phase)
 * 4. Emit tool call summaries via onStepFinish AFTER tools run (acting phase)
 */
export async function runAttackerLoop(gameId: string, signal: AbortSignal): Promise<void> {
  const session = getSession(gameId);
  if (!session) return;

  const wsUrl = await discoverWsUrl(session.cdpUrl);
  log('[stagehand] discovered WebSocket URL:', wsUrl);

  const stagehand = new Stagehand({
    env: 'LOCAL',
    model: 'anthropic/claude-sonnet-4-5',
    localBrowserLaunchOptions: {
      cdpUrl: wsUrl,
    },
    verbose: 0,
    experimental: true,
  });

  // Track whether we initiated close so we can distinguish abort errors
  let closingForAbort = false;

  const onAbort = () => {
    closingForAbort = true;
    stagehand.close().catch(() => {});
  };
  signal.addEventListener('abort', onAbort, { once: true });

  try {
    await stagehand.init();

    const s = getSession(gameId);
    if (!s || s.phase !== 'arena') return;

    s.attackerStatus = 'thinking';
    emitEvent(gameId, 'status_update', {
      attackerStatus: 'thinking',
      defenderStatus: s.defenderStatus,
    });

    const taskPrompt = session.task.startUrl
      ? `Navigate to ${session.task.startUrl} and then: ${session.task.description}`
      : session.task.description;

    const agent = stagehand.agent({
      model: 'anthropic/claude-sonnet-4-5',
      mode: 'hybrid',
      stream: true,
      systemPrompt: `You are a browser automation agent completing a task on a webpage.
Another agent is actively trying to block you by injecting popups, fake overlays, moving elements, and other disruptions.
Stay focused on the task. If you encounter unexpected popups or overlays, dismiss them and continue.
If elements disappear or move, try to find them again.
Be persistent and methodical.`,
    });

    const logger = new AttackerStepLogger(gameId);

    // Synthetic conversation history for replay UI & conversations table
    const syntheticMessages: Array<{ role: string; content: string }> = [
      { role: 'user', content: `TASK: ${taskPrompt}` },
    ];
    let conversationsRecorded = 0;
    let isFirstCallback = true;

    // Capture initial screenshot + DOM snapshot (fire-and-forget)
    let latestScreenshotId: string | null = null;
    let latestDomSnap: string | null = null;
    Promise.all([
      captureAndUploadScreenshot(session.cdpUrl).catch(() => null),
      snapshotDOM(session.cdpUrl).catch(() => null),
    ]).then(([ssId, dom]) => {
      latestScreenshotId = ssId;
      latestDomSnap = dom;
    });

    const streamResult = await agent.execute({
      instruction: taskPrompt,
      maxSteps: MAX_STEPS,
      callbacks: {
        // Fires after each LLM step completes (tools have executed)
        onStepFinish: async (event: Record<string, unknown>) => {
          // Diagnostic: log event shape on first callback
          if (isFirstCallback) {
            log(`[tracing] stagehand onStepFinish keys: [${Object.keys(event).join(', ')}]`);
            if (Array.isArray(event.toolCalls) && event.toolCalls.length > 0) {
              const firstTc = event.toolCalls[0] as Record<string, unknown>;
              log(`[tracing] stagehand toolCall[0] keys: [${Object.keys(firstTc).join(', ')}]`);
            }
            isFirstCallback = false;
          }

          // Emit reasoning as a "thinking" step
          if (typeof event.text === 'string' && event.text.trim().length > 0) {
            logger.logThinking({
              description: event.text.trim().slice(0, 300),
              screenshotId: latestScreenshotId,
              domSnapshot: latestDomSnap,
            });

            syntheticMessages.push({
              role: 'assistant',
              content: `[Thinking] ${event.text.trim()}`,
            });
          }

          // Emit tool calls as an "acting" step with rich tool data
          if (Array.isArray(event.toolCalls) && event.toolCalls.length > 0) {
            const firstTool = event.toolCalls[0] as Record<string, unknown>;
            const toolName = String(firstTool?.toolName ?? firstTool?.name ?? 'tool');
            const toolInput = firstTool?.input ?? firstTool?.args;

            // Check for tool results — Stagehand may expose result/output on each tool call
            const toolResultRaw = firstTool?.result ?? firstTool?.output;
            const toolResult = toolResultRaw != null
              ? (typeof toolResultRaw === 'string' ? toolResultRaw : JSON.stringify(toolResultRaw)).slice(0, 500)
              : undefined;

            const toolDesc = event.toolCalls.map((tc: Record<string, unknown>) => {
              const name = String(tc.toolName ?? tc.name ?? 'tool');
              const input = tc.input ?? tc.args;
              if (input && typeof input === 'object') {
                return `${name}(${summarizeToolInput(input as Record<string, unknown>)})`;
              }
              return name;
            }).join(', ');

            logger.logAction({
              description: toolDesc.slice(0, 300),
              toolName,
              toolInput: toolInput ? JSON.stringify(toolInput).slice(0, 2000) : undefined,
              toolResult,
              screenshotId: latestScreenshotId,
              domSnapshot: latestDomSnap,
            });

            syntheticMessages.push({
              role: 'assistant',
              content: `[Action] ${toolDesc}`,
            });
            if (toolResult) {
              syntheticMessages.push({
                role: 'user',
                content: `[Result] ${toolResult}`,
              });
            }
          }

          // Persist synthetic conversation for replay
          recordConversation({
            gameId,
            stepNumber: logger.currentStep,
            messages: JSON.stringify(syntheticMessages),
          });
          conversationsRecorded++;

          // Refresh screenshot + DOM for next step (fire-and-forget)
          Promise.all([
            captureAndUploadScreenshot(session.cdpUrl).catch(() => null),
            snapshotDOM(session.cdpUrl).catch(() => null),
          ]).then(([ssId, dom]) => {
            latestScreenshotId = ssId;
            latestDomSnap = dom;
          });
        },
      },
    });

    // Consume the text stream (drives the streaming pipeline to completion)
    // Check abort signal each iteration so we stop promptly on game end
    for await (const chunk of streamResult.textStream) {
      if (signal.aborted) break;
      void chunk;
    }

    // If aborted (game ended externally), skip result processing
    if (signal.aborted) return;

    const result = await streamResult.result;

    // Emit final completion or failure
    const s2 = getSession(gameId);
    if (!s2 || s2.phase !== 'arena') return;

    if (result.success) {
      const finalMsg = (result.message || 'Task completed').slice(0, 200);
      logger.logComplete({ description: finalMsg, success: true });

      // Record final conversation state
      syntheticMessages.push({
        role: 'assistant',
        content: `[Complete] ${finalMsg}`,
      });
      recordConversation({
        gameId,
        stepNumber: logger.currentStep,
        messages: JSON.stringify(syntheticMessages),
      });
      conversationsRecorded++;

      log(`[tracing] stagehand summary | steps=${logger.currentStep} conversations=${conversationsRecorded}`);
      endGame(gameId, 'attacker', 'task_complete');
    } else {
      log(`[tracing] stagehand summary | steps=${logger.currentStep} conversations=${conversationsRecorded} result=failed`);
      s2.attackerStatus = 'failed';
      emitEvent(gameId, 'status_update', {
        attackerStatus: 'failed',
        defenderStatus: s2.defenderStatus,
      });
    }
  } catch (err) {
    // Stagehand throws when close() is called during execution (abort/game-end).
    // This is expected — don't propagate it as an attacker failure.
    if (closingForAbort || signal.aborted) {
      log('[stagehand] agent stopped (game ended)');
      return;
    }
    throw err;
  } finally {
    signal.removeEventListener('abort', onAbort);
    try {
      await stagehand.close();
    } catch {
      // ignore cleanup errors — may already be closed by onAbort
    }
  }
}

function summarizeToolInput(input: Record<string, unknown>): string {
  const parts: string[] = [];
  if (input.instruction) parts.push(`"${String(input.instruction).slice(0, 60)}"`);
  if (input.url) parts.push(`url: "${String(input.url).slice(0, 50)}"`);
  if (input.text) parts.push(`"${String(input.text).slice(0, 40)}"`);
  if (input.action) parts.push(String(input.action).slice(0, 60));
  if (parts.length > 0) return parts.join(', ');
  const keys = Object.keys(input).slice(0, 3);
  return keys.join(', ');
}
