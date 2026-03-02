import { getBuClient, stopTask } from './browser-use-api';
import { getSession } from './game-session-store';
import { emitEvent } from './sse-emitter';
import { endGame } from './defender-agent';
import { downloadAndUploadScreenshot, recordConversation } from './data-collector';
import { snapshotDOM } from './cdp';
import { AttackerStepLogger } from './attacker-step-logger';
import { log, logError } from './log';

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

  // Synthetic conversation history for replay UI & conversations table
  const syntheticMessages: Array<{ role: string; content: string }> = [
    { role: 'user', content: `TASK: ${taskPrompt}` },
  ];
  let conversationsRecorded = 0;
  let screenshotsLinked = 0;

  try {
    session.attackerStatus = 'acting';
    emitEvent(gameId, 'status_update', {
      attackerStatus: 'acting',
      defenderStatus: session.defenderStatus,
    });

    // Kick off initial DOM snapshot (fire-and-forget)
    let latestDomSnap: string | null = null;
    snapshotDOM(session.cdpUrl).then(dom => { latestDomSnap = dom; }).catch(() => {});

    // Track screenshot upload from previous step so we can link it to the current step
    let pendingScreenshot: Promise<string | null> = Promise.resolve(null);

    // Run the AI agent task on the existing session
    log('[browser-use attacker] dispatching task to session:', session.browserSessionId);
    const taskRun = buClient.run(taskPrompt, {
      sessionId: session.browserSessionId,
      startUrl: session.task.startUrl || undefined,
    });

    // Wait for task ID to become available, then store it
    const checkTaskId = async () => {
      await sleep(1000);
      if (taskRun.taskId) {
        session.buTaskId = taskRun.taskId;
        log('[browser-use attacker] task created:', taskRun.taskId);
      }
    };
    checkTaskId().catch(() => {});

    let isFirstStep = true;

    // Stream steps via async iteration
    for await (const step of taskRun) {
      if (signal.aborted) break;

      const s = getSession(gameId);
      if (!s || s.phase !== 'arena') break;

      // Store taskId if we haven't yet
      if (!s.buTaskId && taskRun.taskId) {
        s.buTaskId = taskRun.taskId;
      }

      // Diagnostic: log step shape on first step so we know what fields the SDK provides
      if (isFirstStep) {
        log(`[tracing] browser-use step keys: [${Object.keys(step).join(', ')}]`);
        log(`[tracing] browser-use step sample:`, JSON.stringify(step, null, 2));
        isFirstStep = false;
      } else {
        log('[browser-use attacker] step received:', JSON.stringify(step, null, 2));
      }

      // Await the previous step's screenshot upload so we can link it to this step
      const screenshotId = await pendingScreenshot;
      if (screenshotId) screenshotsLinked++;

      // Start uploading this step's screenshot (will be linked to the NEXT step or final)
      if (step.screenshotUrl) {
        pendingScreenshot = downloadAndUploadScreenshot(step.screenshotUrl).catch((err) => {
          logError('[browser-use attacker] screenshot upload failed:', err);
          return null;
        });
      } else {
        pendingScreenshot = Promise.resolve(null);
      }

      // Extract available data from step for tool input/result fields
      const actionsJson = step.actions?.length
        ? JSON.stringify(step.actions).slice(0, 2000)
        : undefined;
      const evalResult = step.evaluationPreviousGoal || step.memory || undefined;
      const toolResult = typeof evalResult === 'string' ? evalResult.slice(0, 500) : undefined;

      // Phase 1: Emit reasoning as a "thinking" step
      const thinkingText = step.nextGoal || step.evaluationPreviousGoal || step.memory;
      if (thinkingText) {
        logger.logThinking({
          description: thinkingText.slice(0, 300),
          screenshotId: screenshotId,
          domSnapshot: latestDomSnap,
        });

        syntheticMessages.push({
          role: 'assistant',
          content: `[Thinking] ${thinkingText}`,
        });
      }

      // Phase 2: Emit actions as an "acting" step
      const actionDesc = step.actions?.length
        ? step.actions.join(', ')
        : step.memory || `Step ${step.number}`;

      logger.logAction({
        description: actionDesc.slice(0, 300),
        toolName: step.actions?.[0],
        toolInput: actionsJson,
        toolResult: toolResult,
        screenshotId: screenshotId,
        screenshotUrl: step.screenshotUrl ?? undefined,
        domSnapshot: latestDomSnap,
      });

      syntheticMessages.push({
        role: 'assistant',
        content: `[Action] ${actionDesc}`,
      });
      if (toolResult) {
        syntheticMessages.push({
          role: 'user',
          content: `[Result] ${toolResult}`,
        });
      }

      // Persist synthetic conversation for replay
      recordConversation({
        gameId,
        stepNumber: logger.currentStep,
        messages: JSON.stringify(syntheticMessages),
      });
      conversationsRecorded++;

      // Refresh DOM snapshot for next step
      snapshotDOM(session.cdpUrl).then(dom => { latestDomSnap = dom; }).catch(() => {});
    }

    // Await final screenshot upload
    const finalScreenshotId = await pendingScreenshot;
    if (finalScreenshotId) screenshotsLinked++;

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
      screenshotId: finalScreenshotId,
      domSnapshot: latestDomSnap,
    });

    // Record final conversation state
    syntheticMessages.push({
      role: 'assistant',
      content: `[Complete] ${finalDescription}`,
    });
    recordConversation({
      gameId,
      stepNumber: logger.currentStep,
      messages: JSON.stringify(syntheticMessages),
    });
    conversationsRecorded++;

    log(`[tracing] browser-use summary | steps=${logger.currentStep} screenshotsLinked=${screenshotsLinked} conversations=${conversationsRecorded}`);

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
    logError('[browser-use attacker] error:', err);
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
