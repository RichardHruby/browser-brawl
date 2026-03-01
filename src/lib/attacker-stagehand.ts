import { Stagehand } from '@browserbasehq/stagehand';
import { getSession } from './game-session-store';
import { emitEvent } from './sse-emitter';
import { endGame } from './defender-agent';
import { nanoid } from 'nanoid';
import type { AttackerStepPayload } from '@/types/events';

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
  const versionRes = await fetch(`${base.protocol}//${base.host}/json/version`);
  if (versionRes.ok) {
    const info = await versionRes.json();
    if (info.webSocketDebuggerUrl) {
      return info.webSocketDebuggerUrl as string;
    }
  }

  // Fallback: try /json to find a page target's debugger URL
  const targetsRes = await fetch(`${base.protocol}//${base.host}/json`);
  if (targetsRes.ok) {
    const targets = await targetsRes.json();
    const page = targets.find((t: { type: string; webSocketDebuggerUrl?: string }) => t.type === 'page');
    if (page?.webSocketDebuggerUrl) {
      return page.webSocketDebuggerUrl as string;
    }
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
  console.log('[stagehand] discovered WebSocket URL:', wsUrl);

  const stagehand = new Stagehand({
    env: 'LOCAL',
    model: 'anthropic/claude-sonnet-4-5',
    localBrowserLaunchOptions: {
      cdpUrl: wsUrl,
    },
    verbose: 0,
    experimental: true,
  });

  await stagehand.init();

  const onAbort = () => {
    stagehand.close().catch(() => {});
  };
  signal.addEventListener('abort', onAbort, { once: true });

  try {
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

    let stepNumber = 0;

    const emitStep = (description: string, status: 'thinking' | 'acting') => {
      const sess = getSession(gameId);
      if (!sess || sess.phase !== 'arena') return;

      stepNumber++;
      sess.attackerStatus = status;

      sess.attackerSteps.push({
        id: nanoid(8),
        step: stepNumber,
        description,
        timestamp: new Date().toISOString(),
        agentStatus: status,
      });

      emitEvent<AttackerStepPayload>(gameId, 'attacker_step', {
        step: stepNumber,
        description,
        agentStatus: status,
        isComplete: false,
      });

      emitEvent(gameId, 'status_update', {
        attackerStatus: status,
        defenderStatus: sess.defenderStatus,
      });
    };

    const streamResult = await agent.execute({
      instruction: taskPrompt,
      maxSteps: MAX_STEPS,
      callbacks: {
        // Fires after each LLM step completes (tools have executed)
        onStepFinish: async (event: Record<string, unknown>) => {
          // Emit reasoning as a "thinking" step
          if (typeof event.text === 'string' && event.text.trim().length > 0) {
            emitStep(event.text.trim().slice(0, 300), 'thinking');
          }

          // Emit tool calls as an "acting" step
          if (Array.isArray(event.toolCalls) && event.toolCalls.length > 0) {
            const toolDesc = event.toolCalls.map((tc: Record<string, unknown>) => {
              const name = String(tc.toolName ?? tc.name ?? 'tool');
              const input = tc.input ?? tc.args;
              if (input && typeof input === 'object') {
                return `${name}(${summarizeToolInput(input as Record<string, unknown>)})`;
              }
              return name;
            }).join(', ');
            emitStep(toolDesc.slice(0, 300), 'acting');
          }
        },
      },
    });

    // Consume the text stream (drives the streaming pipeline to completion)
    for await (const _chunk of streamResult.textStream) {
      // Consumed to keep the stream flowing
    }

    const result = await streamResult.result;

    // Emit final completion or failure
    const s2 = getSession(gameId);
    if (!s2 || s2.phase !== 'arena') return;

    if (result.success) {
      const finalStep = stepNumber + 1;
      const finalMsg = (result.message || 'Task completed').slice(0, 200);

      s2.attackerStatus = 'complete';
      s2.attackerSteps.push({
        id: nanoid(8),
        step: finalStep,
        description: finalMsg,
        timestamp: new Date().toISOString(),
        agentStatus: 'complete',
      });

      emitEvent<AttackerStepPayload>(gameId, 'attacker_step', {
        step: finalStep,
        description: finalMsg,
        agentStatus: 'complete',
        isComplete: true,
      });

      endGame(gameId, 'attacker', 'task_complete');
    } else {
      s2.attackerStatus = 'failed';
      emitEvent(gameId, 'status_update', {
        attackerStatus: 'failed',
        defenderStatus: s2.defenderStatus,
      });
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
    try {
      await stagehand.close();
    } catch {
      // ignore cleanup errors
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
