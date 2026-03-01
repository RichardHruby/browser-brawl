import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { createBrowser, createAgentSession } from '@/lib/browser-use-api';
import { createSession, getSession } from '@/lib/game-session-store';
import { startDefenderLoop } from '@/lib/defender-agent';
import { emitEvent } from '@/lib/sse-emitter';
import { TASKS } from '@/lib/tasks';
import { runAttackerLoop } from '@/lib/attacker-agent';
import { runBrowserUseAttackerLoop } from '@/lib/browser-use-attacker';
import type { AttackerType, Difficulty } from '@/types/game';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { taskId, difficulty = 'easy', customTask, attackerType = 'playwright-mcp' } = body as {
    taskId?: string;
    difficulty?: Difficulty;
    customTask?: string;
    attackerType?: AttackerType;
  };

  const task =
    customTask
      ? { id: 'custom', label: 'Custom Task', description: customTask, startUrl: '', tags: [] }
      : TASKS.find(t => t.id === taskId);

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 400 });
  }

  const gameId = nanoid(10);

  let browserSessionId = '';
  let cdpUrl = '';
  let liveViewUrl = '';

  try {
    if (attackerType === 'browser-use') {
      // Agent session: has both cdpUrl (for defender) and AI task execution
      const agentSession = await createAgentSession();
      browserSessionId = agentSession.id;
      cdpUrl = agentSession.cdpUrl;
      liveViewUrl = agentSession.liveUrl;
    } else {
      // Raw browser: CDP access for Playwright MCP/Stagehand attacker + defender
      const browser = await createBrowser(240);
      browserSessionId = browser.id;
      cdpUrl = browser.cdpUrl;
      liveViewUrl = browser.liveUrl;
    }

    if (!browserSessionId || !cdpUrl || !liveViewUrl) {
      throw new Error('Session created without required browser URLs');
    }

    console.log('[start] session created:', browserSessionId);
    console.log('[start] CDP URL:', cdpUrl);
    console.log('[start] live view:', liveViewUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[start] browser-use create error:', message);
    if (message.includes('BROWSER_USE_API_KEY')) {
      return NextResponse.json({ error: 'Server is missing BROWSER_USE_API_KEY' }, { status: 500 });
    }
    return NextResponse.json({ error: 'Failed to create browser session' }, { status: 500 });
  }

  const session = createSession({
    gameId,
    browserSessionId,
    cdpUrl,
    liveViewUrl,
    task,
    difficulty,
    attackerType,
  });

  session.phase = 'arena';
  session.attackerStatus = 'thinking';

  emitEvent(gameId, 'status_update', {
    attackerStatus: 'thinking',
    defenderStatus: 'idle',
  });

  const abort = new AbortController();
  session.attackerAbort = abort;

  if (attackerType === 'browser-use') {
    // Browser-Use AI agent on the agent session
    runBrowserUseAttackerLoop(gameId, abort.signal).catch(err => {
      console.error('[start] browser-use attacker error:', err);
      const s = getSession(gameId);
      if (s && s.phase === 'arena') {
        s.attackerStatus = 'failed';
        emitEvent(gameId, 'status_update', {
          attackerStatus: 'failed',
          defenderStatus: s.defenderStatus,
        });
      }
    });
  } else {
    // Local attacker loop routes to Playwright MCP or Stagehand
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
  }

  // Defender starts after delay to let the browser spin up
  setTimeout(() => {
    startDefenderLoop(gameId);
  }, 8000);

  return NextResponse.json({ sessionId: gameId, liveViewUrl });
}
