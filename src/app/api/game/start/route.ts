import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { createBrowser } from '@/lib/browser-use-api';
import { createSession, getSession } from '@/lib/game-session-store';
import { startDefenderLoop, endGame } from '@/lib/defender-agent';
import { emitEvent } from '@/lib/sse-emitter';
import { TASKS } from '@/lib/tasks';
import { runAttackerLoop } from '@/lib/attacker-agent';
import { createGameRecord, recordNetworkRequest } from '@/lib/data-collector';
import { startNetworkCapture } from '@/lib/browserbase';
import { startScreencast } from '@/lib/screencast';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { taskId, difficulty = 'easy', customTask, mode = 'realtime' } = body;
  const gameMode = mode === 'turnbased' ? 'turnbased' : 'realtime' as const;

  const task =
    customTask
      ? { id: 'custom', label: 'Custom Task', description: customTask, startUrl: '', tags: [] }
      : TASKS.find(t => t.id === taskId);

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 400 });
  }

  const gameId = nanoid(10);

  // 1. Create a managed browser via browser-use (gives us CDP + live view)
  let browserSessionId = '';
  let cdpUrl = '';
  let liveViewUrl = '';
  try {
    const browser = await createBrowser(240); // 4 min timeout (API max)
    browserSessionId = browser.id;
    // Keep cdpUrl as https:// — Playwright's connectOverCDP needs the HTTP endpoint
    // to discover targets via /json before connecting via WebSocket
    cdpUrl = browser.cdpUrl;
    liveViewUrl = browser.liveUrl;
    console.log('[start] browser created:', browserSessionId);
    console.log('[start] CDP URL:', cdpUrl);
    console.log('[start] live view:', liveViewUrl);
    console.log('[start] mode:', gameMode, '| difficulty:', difficulty);
  } catch (err) {
    console.error('[start] browser-use createBrowser error:', err);
    return NextResponse.json({ error: 'Failed to create browser session' }, { status: 500 });
  }

  // 2. Create game session in store
  const session = createSession({
    gameId,
    browserSessionId,
    cdpUrl,
    liveViewUrl,
    task,
    difficulty,
    mode: gameMode,
  });

  // 2b. Persist to Convex for training data collection
  createGameRecord({
    gameId,
    taskId: task.id,
    taskLabel: task.label,
    taskDescription: task.description,
    taskStartUrl: task.startUrl,
    difficulty,
    mode: gameMode,
    attackerModel: 'claude-sonnet-4-20250514',
    defenderModel: 'claude-haiku-4-5-20251001',
  });

  // 2c. Start network request capture via CDP
  startNetworkCapture(cdpUrl, (req) => {
    recordNetworkRequest({
      gameId,
      method: req.method,
      url: req.url,
      status: req.status,
      resourceType: req.resourceType,
      responseSize: req.responseSize,
    });
  }).then(stopFn => {
    if (stopFn) session.stopNetworkCapture = stopFn;
  }).catch(() => {});

  // 2d. Start screencast recording via CDP
  startScreencast(gameId, cdpUrl).catch(() => {});

  // 3. Transition to arena
  session.phase = 'arena';
  session.attackerStatus = 'thinking';

  emitEvent(gameId, 'status_update', {
    attackerStatus: 'thinking',
    defenderStatus: 'idle',
  });

  // 4. Emit initial turn state for turn-based games
  if (gameMode === 'turnbased') {
    emitEvent(gameId, 'turn_change', {
      currentTurn: 'attacker',
      turnNumber: 1,
      attackerStepsRemaining: session.attackerStepsPerTurn,
      attackerStepsPerTurn: session.attackerStepsPerTurn,
    });
  }

  // 5. Start attacker agent loop (Playwright MCP + Anthropic) — non-blocking
  const abort = new AbortController();
  session.attackerAbort = abort;

  runAttackerLoop(gameId, abort.signal).catch(err => {
    console.error('[start] attacker loop error:', err);
    const s = getSession(gameId);
    if (s && s.phase === 'arena') {
      s.attackerStatus = 'failed';
      emitEvent(gameId, 'status_update', {
        attackerStatus: 'failed',
        defenderStatus: s.defenderStatus,
      });
    }
  });

  // 6. Start defender loop (after a delay to let the browser load)
  setTimeout(() => {
    startDefenderLoop(gameId);
  }, 8000);

  return NextResponse.json({ sessionId: gameId, liveViewUrl, mode: gameMode });
}
