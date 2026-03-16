import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { createBrowser, createAgentSession } from '@/lib/browser-use-api';
import { createSession, getSession } from '@/lib/game-session-store';
import { startDefenderLoop } from '@/lib/defender-agent';
import { emitEvent } from '@/lib/sse-emitter';
import { TASKS } from '@/lib/tasks';
import { runAttackerLoop } from '@/lib/attacker-agent';
import { createGameRecord, recordNetworkRequest } from '@/lib/data-collector';
import { startNetworkCapture } from '@/lib/cdp';
import { startScreencast } from '@/lib/screencast';
import { runBrowserUseAttackerLoop } from '@/lib/browser-use-attacker';
import type { AttackerType, Difficulty, ModelProvider, ModelId } from '@/types/game';
import type { AttackSpec, AttackSuite } from '@/lib/attack-spec';
import { expandSuite } from '@/lib/attack-spec';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { taskId, difficulty = 'easy', customTask, mode = 'realtime', attackerType = 'playwright-mcp', modelUrl, noDefender = false, modelProvider, modelId, attackSpec: rawAttackSpec, attackSuite, agentSecrets, defenderMode, defenderSystemPrompt, defenderHijackTarget } = body as {
    taskId?: string;
    difficulty?: Difficulty;
    customTask?: string;
    mode?: string;
    attackerType?: AttackerType;
    modelUrl?: string;
    noDefender?: boolean;
    modelProvider?: ModelProvider;
    modelId?: ModelId;
    attackSpec?: AttackSpec;
    attackSuite?: AttackSuite;
    agentSecrets?: Record<string, string>;
    defenderMode?: 'disruption' | 'hijack' | 'data_exfiltration';
    defenderSystemPrompt?: string;
    defenderHijackTarget?: string;
  };
  const gameMode = mode === 'turnbased' ? 'turnbased' : 'realtime' as const;

  const task =
    customTask
      ? { id: 'custom', label: 'Custom Task', description: customTask, startUrl: '', tags: [] }
      : TASKS.find(t => t.id === taskId);

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 400 });
  }

  // Resolve attack spec: explicit spec > suite preset > null (legacy mode)
  let resolvedAttackSpec: AttackSpec | undefined;
  if (rawAttackSpec) {
    resolvedAttackSpec = rawAttackSpec;
  } else if (attackSuite) {
    resolvedAttackSpec = expandSuite(attackSuite, task);
  }
  const hasAttackSpec = !!resolvedAttackSpec;

  if (hasAttackSpec) {
    console.log('[start] controllable defender mode — suite:', attackSuite ?? 'custom', '| attacks:', resolvedAttackSpec!.attacks.length);
  }

  const gameId = nanoid(10);

  let browserSessionId = '';
  let cdpUrl = '';
  let liveViewUrl = '';

  // Pre-warm finetuned model endpoint during browser creation (fire-and-forget).
  // Modal vLLM cold starts take ~2min — this overlaps warm-up with the ~8s browser spin-up.
  if (attackerType === 'finetuned' && modelUrl) {
    console.log('[start] warming up finetuned model endpoint:', modelUrl);
    fetch(modelUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
        temperature: 0.0,
      }),
    }).then(() => {
      console.log('[start] model warm-up ping completed');
    }).catch(() => {
      console.log('[start] model warm-up ping failed (will retry on first real call)');
    });
  }

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
    console.log('[start] mode:', gameMode, '| difficulty:', difficulty, '| attackerType:', attackerType, '| model:', modelProvider ? `${modelProvider}/${modelId}` : 'default');
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
    mode: gameMode,
    attackerType,
    modelUrl,
    modelProvider: attackerType === 'playwright-mcp' ? (modelProvider ?? 'anthropic') : undefined,
    modelId: attackerType === 'playwright-mcp' ? (modelId ?? 'claude-sonnet-4-6') : undefined,
    attackSpec: resolvedAttackSpec,
    attackSuite,
    agentSecrets,
    defenderMode,
    defenderSystemPrompt,
    defenderHijackTarget,
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
    attackerType,
    attackerModel: attackerType === 'finetuned' ? 'finetuned-qwen' : (modelId ?? 'claude-sonnet-4-6'),
    defenderModel: 'claude-haiku-4-5-20251001',
    hasDefender: !noDefender,
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

  // 5. Start attacker agent loop — non-blocking
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

  // 6. Start defender loop
  // If attackSpec is set, always enable defender (overrides noDefender)
  // Turn-based: start immediately — defender just waits for attacker's signal, no browser needed yet
  // Realtime: delay 8s to let the browser load before injecting disruptions
  const shouldRunDefender = hasAttackSpec || !noDefender;
  if (shouldRunDefender) {
    if (gameMode === 'turnbased') {
      startDefenderLoop(gameId);
    } else {
      setTimeout(() => {
        startDefenderLoop(gameId);
      }, 8000);
    }
  }

  return NextResponse.json({ sessionId: gameId, liveViewUrl, mode: gameMode });
}
