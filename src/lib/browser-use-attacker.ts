import { getBuClient, stopTask } from './browser-use-api';
import { getSession } from './game-session-store';
import { emitEvent } from './sse-emitter';
import { endGame } from './defender-agent';
import { nanoid } from 'nanoid';
import type { AttackerStepPayload } from '@/types/events';

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

  try {
    emitEvent(gameId, 'status_update', {
      attackerStatus: 'acting',
      defenderStatus: session.defenderStatus,
    });
    session.attackerStatus = 'acting';

    // Run the AI agent task on the existing session
    // browserSessionId is from client.sessions.create(), so it's a valid sessionId
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

      // Log the full step object to see what data we actually get
      console.log('[browser-use attacker] step received:', JSON.stringify(step, null, 2));

      const description = step.memory || step.nextGoal || step.evaluationPreviousGoal || `Step ${step.number}`;

      s.attackerSteps.push({
        id: nanoid(8),
        step: step.number,
        description,
        timestamp: new Date().toISOString(),
        agentStatus: 'acting',
      });

      emitEvent<AttackerStepPayload>(gameId, 'attacker_step', {
        step: step.number,
        description,
        agentStatus: 'acting',
        isComplete: false,
        nextGoal: step.nextGoal,
        memory: step.memory,
        evaluationPreviousGoal: step.evaluationPreviousGoal,
        url: step.url,
        screenshotUrl: step.screenshotUrl ?? undefined,
        actions: step.actions,
      });
    }

    // Task finished — get the result
    const result = taskRun.result;
    const s = getSession(gameId);
    if (!s || s.phase !== 'arena') return;

    const isSuccess = result?.isSuccess === true;
    const stepNumber = (s.attackerSteps.length || 0) + 1;
    const finalDescription = typeof result?.output === 'string'
      ? result.output.slice(0, 200)
      : isSuccess ? 'Task completed' : 'Task ended';

    s.attackerSteps.push({
      id: nanoid(8),
      step: stepNumber,
      description: finalDescription,
      timestamp: new Date().toISOString(),
      agentStatus: isSuccess ? 'complete' : 'failed',
    });

    emitEvent<AttackerStepPayload>(gameId, 'attacker_step', {
      step: stepNumber,
      description: finalDescription,
      agentStatus: isSuccess ? 'complete' : 'failed',
      isComplete: isSuccess,
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
