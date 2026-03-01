import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { createBrowser } from '@/lib/browser-use-api';
import { createSession, getSession } from '@/lib/game-session-store';
import { startDefenderLoop, endGame } from '@/lib/defender-agent';
import { emitEvent } from '@/lib/sse-emitter';
import { TASKS } from '@/lib/tasks';
import { runAttackerLoop } from '@/lib/attacker-agent';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { taskId, difficulty = 'easy', customTask, attackerMode = 'playwright' } = body;

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
    attackerMode,
  });

  // 3. Transition to arena
  session.phase = 'arena';
  session.attackerStatus = 'thinking';

  emitEvent(gameId, 'status_update', {
    attackerStatus: 'thinking',
    defenderStatus: 'idle',
  });

  // 4. Start attacker agent loop (Playwright MCP + Anthropic) — non-blocking
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

  // 5. Start defender loop (after a delay to let the browser load)
  setTimeout(() => {
    startDefenderLoop(gameId);
  }, 8000);

  return NextResponse.json({ sessionId: gameId, liveViewUrl });
}
