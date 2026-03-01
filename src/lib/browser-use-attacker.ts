import { getBuClient, stopTask } from './browser-use-api';
import { getSession } from './game-session-store';
import { emitEvent } from './sse-emitter';
import { endGame } from './defender-agent';
import { initLaminar } from './laminar';
import { downloadAndUploadScreenshot } from './data-collector';
import { snapshotDOM } from './browserbase';
import { AttackerStepLogger } from './attacker-step-logger';

// Initialize Laminar so any underlying Anthropic calls are traced
initLaminar();

/**
 * Run the attacker via the browser-use AI agent.
 * The session is already created by the start route via createAgentSession().
 * We dispatch a task to it via client.run() with the session ID.
 * The defender connects to the same session via its cdpUrl.
 */
export async function runBrowserUseAttackerLoop(
  gameId: string,
  signal: AbortSignal,
): Promise<void> {
  const session = getSession(gameId);
  if (!session) throw new Error('Session not found');
  const buClient = getBuClient();

  const taskPrompt = session.task.startUrl
    ? `Navigate to ${session.task.startUrl} and then: ${session.task.description}`
    : session.task.description;

  // Set up abort handler
  const abortTask = () => {
    if (session.buTaskId) {
      stopTask(session.buTaskId).catch(() => {});
    }
  };
  signal.addEventListener('abort', abortTask, { once: true });

  const logger = new AttackerStepLogger(gameId);

  try {
    session.attackerStatus = 'acting';
    emitEvent(gameId, 'status_update', {
      attackerStatus: 'acting',
      defenderStatus: session.defenderStatus,
    });

    // Kick off initial DOM snapshot (fire-and-forget)
    let latestDomSnap: string | null = null;
    snapshotDOM(session.cdpUrl).then(dom => { latestDomSnap = dom; }).catch(() => {});

    // Run the AI agent task on the existing session
    console.log('[browser-use attacker] dispatching task to session:', session.browserSessionId);
    const taskRun = buClient.run(taskPrompt, {
      sessionId: session.browserSessionId,
      startUrl: session.task.startUrl || undefined,
    });

    // Wait for task ID to become available, then store it
    const checkTaskId = async () => {
      await sleep(1000);
      if (taskRun.taskId) {
        session.buTaskId = taskRun.taskId;
        console.log('[browser-use attacker] task created:', taskRun.taskId);
      }
    };
    checkTaskId().catch(() => {});

    // Stream steps via async iteration
    for await (const step of taskRun) {
      if (signal.aborted) break;

      const s = getSession(gameId);
      if (!s || s.phase !== 'arena') break;

      // Store taskId if we haven't yet
      if (!s.buTaskId && taskRun.taskId) {
        s.buTaskId = taskRun.taskId;
      }

      console.log('[browser-use attacker] step received:', JSON.stringify(step, null, 2));

      // Phase 1: Emit reasoning as a "thinking" step
      const thinkingText = step.nextGoal || step.evaluationPreviousGoal || step.memory;
      if (thinkingText) {
        logger.logThinking({
          description: thinkingText.slice(0, 300),
          domSnapshot: latestDomSnap,
        });
      }

      // Phase 2: Emit actions as an "acting" step
      const actionDesc = step.actions?.length
        ? step.actions.join(', ')
        : step.memory || `Step ${step.number}`;

      logger.logAction({
        description: actionDesc.slice(0, 300),
        toolName: step.actions?.[0],
        screenshotUrl: step.screenshotUrl ?? undefined,
        domSnapshot: latestDomSnap,
      });

      // Fire-and-forget: download screenshot from Browser-Use URL and upload to Convex
      if (step.screenshotUrl) {
        downloadAndUploadScreenshot(step.screenshotUrl).catch(() => {});
      }
      // Refresh DOM snapshot for next step
      snapshotDOM(session.cdpUrl).then(dom => { latestDomSnap = dom; }).catch(() => {});
    }

    // Task finished — get the result
    const result = taskRun.result;
    const s = getSession(gameId);
    if (!s || s.phase !== 'arena') return;

    const isSuccess = result?.isSuccess === true;
    const finalDescription = typeof result?.output === 'string'
      ? result.output.slice(0, 200)
      : isSuccess ? 'Task completed' : 'Task ended';

    logger.logComplete({
      description: finalDescription,
      success: isSuccess,
      domSnapshot: latestDomSnap,
    });

    if (isSuccess) {
      s.attackerStatus = 'complete';
      endGame(gameId, 'attacker', 'task_complete');
    } else {
      s.attackerStatus = 'failed';
      emitEvent(gameId, 'status_update', {
        attackerStatus: 'failed',
        defenderStatus: s.defenderStatus,
      });
    }
  } catch (err) {
    console.error('[browser-use attacker] error:', err);
    const s = getSession(gameId);
    if (s && s.phase === 'arena') {
      s.attackerStatus = 'failed';
      emitEvent(gameId, 'status_update', {
        attackerStatus: 'failed',
        defenderStatus: s.defenderStatus,
      });
    }
  } finally {
    signal.removeEventListener('abort', abortTask);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
