import Anthropic from '@anthropic-ai/sdk';
import { observe, Laminar } from '@lmnr-ai/lmnr';
import { getSession, createGate, type ServerGameSession } from './game-session-store';
import { getDisruptionsForDifficulty, getDisruptionById } from './disruptions';
import { injectJS, snapshotDOM } from './cdp';
import { emitEvent } from './sse-emitter';
import { nanoid } from 'nanoid';
import { getAnthropicApiKey } from './env';
import { recordDefenderAction, finalizeGame, recordHealthChange, captureAndUploadScreenshot, setSessionRecording } from './data-collector';
import { stopScreencast } from './screencast';
import { log, logError, logWarn } from './log';
import type { DisruptionEvent } from '@/types/game';
import type { DefenderActivityPayload, DefenderDisruptionPayload, HealthUpdatePayload, StatusUpdatePayload } from '@/types/events';

const client = new Anthropic({ apiKey: getAnthropicApiKey() });

const DIFFICULTY_INTERVAL: Record<string, number> = {
  easy:      20000,
  medium:    10000,
  hard:      5000,
  nightmare: 2500,
};

const HEALTH_DECAY_PER_SEC: Record<string, number> = {
  easy:      0.05,
  medium:    0.2,
  hard:      0.4,
  nightmare: 0.8,
};

export function startDefenderLoop(gameId: string): void {
  const session = getSession(gameId);
  if (!session) return;

  log('[defender] starting loop for game:', gameId);
  log('[defender] cdpUrl:', session.cdpUrl || '(EMPTY)');
  log('[defender] difficulty:', session.difficulty);

  if (session.mode === 'turnbased') {
    // Turn-based: no timers, no health decay — defender waits for signal from attacker
    runTurnBasedDefenderLoop(gameId).catch(err => {
      logError('[defender] turn-based loop error:', err);
    });
    return;
  }

  // Realtime: passive health decay + timer-based disruptions
  session.healthDecayHandle = setInterval(() => {
    tickHealthDecay(gameId);
  }, 1000);

  // Finetuned: wait for attacker's first real tool step before firing disruptions
  if (session.finetunedReadyGate) {
    session.finetunedReadyGate.promise.then(() => {
      if (getSession(gameId)?.phase === 'arena') {
        scheduleNextAttack(gameId);
      }
    });
  } else {
    scheduleNextAttack(gameId);
  }
}

function scheduleNextAttack(gameId: string): void {
  const session = getSession(gameId);
  if (!session || session.phase !== 'arena') return;

  const intervalMs = DIFFICULTY_INTERVAL[session.difficulty] ?? 15000;
  session.defenderLoopHandle = setTimeout(async () => {
    await runDefenderTurn(gameId);
    scheduleNextAttack(gameId);
  }, intervalMs);
}

async function runTurnBasedDefenderLoop(gameId: string): Promise<void> {
  while (true) {
    const session = getSession(gameId);
    if (!session || session.phase !== 'arena') break;

    // Create a signal the attacker will resolve when it's our turn
    const signal = createGate();
    session.defenderSignal = signal;

    // Wait for the attacker to hand off
    await signal.promise;

    // Re-check after waking — game may have ended
    const s = getSession(gameId);
    if (!s || s.phase !== 'arena') break;

    // Run one defender turn
    await runDefenderTurn(gameId);

    // Re-check after disruption — game may have ended from health depletion
    const s2 = getSession(gameId);
    if (!s2 || s2.phase !== 'arena') break;

    // Signal the attacker to resume
    if (s2.attackerGate) {
      s2.attackerGate.resolve();
      s2.attackerGate = null;
    }
  }
}

function tickHealthDecay(gameId: string): void {
  const session = getSession(gameId);
  if (!session || session.phase !== 'arena') return;

  const decayPerSec = HEALTH_DECAY_PER_SEC[session.difficulty] ?? 0.05;
  const prev = session.health;
  const next = Math.max(0, prev - decayPerSec);
  session.health = next;

  if (next <= 0 && prev > 0) {
    endGame(gameId, 'defender', 'health_depleted');
    return;
  }

  // Emit timer tick + health update every second
  const elapsed = Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000);
  emitEvent(gameId, 'timer_tick', { elapsedSeconds: elapsed });

  // Emit health update when meaningfully changed (every ~5 sec or on big changes)
  if (Math.floor(prev) !== Math.floor(next) || prev - next > 1) {
    emitEvent<HealthUpdatePayload>(gameId, 'health_update', {
      currentHealth: next,
      previousHealth: prev,
      delta: -(prev - next),
      isCritical: next < 20,
    });
  }
}

async function pickDisruption(
  session: ServerGameSession,
  ready: ReturnType<typeof getDisruptionsForDifficulty>
): Promise<{ disruptionId: string; reasoning: string } | null> {
  const recentSteps = session.attackerSteps
    .slice(-5)
    .map(s => `Step ${s.step}: ${s.description}`)
    .join('\n') || 'No steps yet — attacker is just getting started.';

  const disruptionList = ready.map(d => ({
    id: d.id,
    name: d.name,
    description: d.description,
    damage: d.healthDamage,
  }));

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `You are the DEFENDER in Browser Brawl, a game where an AI attacker tries to complete a web task.

TASK THE ATTACKER IS TRYING TO DO:
"${session.task.description}"

ATTACKER'S RECENT STEPS:
${recentSteps}

AVAILABLE DISRUPTIONS:
${JSON.stringify(disruptionList, null, 2)}

Pick ONE disruption most likely to confuse or block the attacker right now, based on where they are in the task.
Aim for a healthy mix: use prebuilt disruptions when they fit the situation, and use "custom-injection" when you can do something more targeted (e.g., hiding the specific button the attacker needs, swapping form values, overlaying fake elements on specific targets). Don't always pick the same disruption.
If you choose "custom-injection", you will get a DOM snapshot and write targeted JavaScript.
Respond with JSON only, no markdown: {"disruptionId":"<id>","reasoning":"<1 sentence why>"}`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    const clean = text.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
    const result = JSON.parse(clean);
    log(`[defender] Picked: ${result.disruptionId} — ${result.reasoning}`);
    return result;
  } catch (err) {
    logError('[defender] LLM pick error, using fallback:', err);
    return { disruptionId: ready[0].id, reasoning: 'Fallback selection.' };
  }
}

function wrapCustomInjection(code: string): string {
  return `(function(){try{${code}}catch(e){console.warn('[bb-custom]',e)}})();`;
}

async function generateCustomInjection(
  session: ServerGameSession,
  reasoning: string
): Promise<string> {
  log('[defender] Generating custom injection — fetching DOM snapshot...');
  const domSnapshot = await snapshotDOM(session.cdpUrl);
  if (!domSnapshot) {
    logWarn('[defender] snapshotDOM returned null, cannot generate custom injection');
    return '';
  }
  log(`[defender] DOM snapshot: ${domSnapshot.length} chars, generating JS...`);

  const recentSteps = session.attackerSteps
    .slice(-5)
    .map(s => `Step ${s.step}: ${s.description}`)
    .join('\n') || 'No steps yet.';

  const recentDisruptions = session.defenderDisruptions
    .slice(-3)
    .map(d => `${d.disruptionName} (${d.success ? 'hit' : 'miss'})`)
    .join(', ') || 'None yet.';

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `You are the DEFENDER in Browser Brawl. Write JavaScript to disrupt an AI attacker.

TASK THE ATTACKER IS TRYING TO DO:
"${session.task.description}"

YOUR REASONING FOR CHOOSING CUSTOM INJECTION:
"${reasoning}"

ATTACKER'S RECENT STEPS:
${recentSteps}

RECENT DEFENDER DISRUPTIONS:
${recentDisruptions}

CURRENT DOM ELEMENTS (interactive elements on page):
${domSnapshot}

Write JavaScript that makes VISIBLE, IMPACTFUL changes to the page that will actively block the attacker.

Good examples of effective disruptions:
- Move a button the attacker needs off-screen or to a random position
- Place a fake overlay div directly on top of the target element (position:absolute, same size/position, high z-index)
- Replace the text content of buttons/links with misleading labels
- Disable or set readonly on input fields the attacker needs to type in
- Add event listeners that call e.preventDefault() and e.stopPropagation() on click for target elements
- Clone a button and hide the real one, making the clone do nothing
- Inject a fake form that looks like the real one but submits nowhere

BAD examples (don't do these — they have no visible effect):
- Just querying elements without modifying them
- Setting variables without applying changes to the DOM
- Console.log statements only
- Modifying elements that don't exist on the page

Target the attacker's CURRENT activity based on their recent steps and the DOM snapshot.
Use element IDs, classes, or selectors from the DOM snapshot to target real elements.

Rules:
- Output ONLY the JavaScript code body (no wrapping function, no markdown fences)
- Must be valid JS that runs in a browser
- Do not use alert() or confirm() — use DOM manipulation only
- Every line should make a VISIBLE change to the DOM
- Keep it under 50 lines`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    // Strip markdown fences if present
    const code = text
      .replace(/^```(?:javascript|js)?\n?/, '')
      .replace(/\n?```$/, '')
      .trim();

    if (!code) return '';
    log(`[defender] Custom JS generated (${code.length} chars): ${code.slice(0, 150)}...`);
    return wrapCustomInjection(code);
  } catch (err) {
    logError('[defender] Custom injection generation failed:', err);
    return '';
  }
}

async function runDefenderTurn(gameId: string): Promise<void> {
  const session = getSession(gameId);
  if (!session || session.phase !== 'arena') return;

  const turnNum = session.defenderDisruptions.length + 1;

  await observe(
    {
      name: `defender-turn-${turnNum}`,
      sessionId: gameId,
      metadata: { gameId, difficulty: session.difficulty, task: session.task.label, health: session.health },
      tags: ['defender', `turn-${turnNum}`],
    },
    async () => {
  const intervalMs = DIFFICULTY_INTERVAL[session.difficulty] ?? 15000;

  emitEvent(gameId, 'status_update', {
    attackerStatus: session.attackerStatus,
    defenderStatus: 'plotting',
  });
  session.defenderStatus = 'plotting';
  emitEvent<DefenderActivityPayload>(gameId, 'defender_activity', {
    message: 'Analyzing attacker behavior...',
    kind: 'thinking',
  });

  const availableDisruptions = getDisruptionsForDifficulty(session.difficulty);

  // Filter out disruptions on cooldown
  let ready;
  if (session.mode === 'turnbased') {
    // Turn-based: cooldowns are turn-based (2-turn gap)
    ready = availableDisruptions.filter(d => {
      const lastUsedTurn = session.defenderCooldowns.get(d.id) ?? 0;
      return session.turnNumber - lastUsedTurn >= 2;
    });
  } else {
    // Realtime: cooldowns are time-based
    const now = Date.now();
    ready = availableDisruptions.filter(d => {
      const lastUsed = session.defenderCooldowns.get(d.id) ?? 0;
      return now - lastUsed >= d.cooldownMs;
    });
  }

  if (ready.length === 0) {
    emitEvent<DefenderActivityPayload>(gameId, 'defender_activity', {
      message: 'All disruptions cooling down...',
      kind: 'thinking',
    });
    session.defenderStatus = 'cooling_down';
    emitEvent<StatusUpdatePayload>(gameId, 'status_update', {
      attackerStatus: session.attackerStatus,
      defenderStatus: 'cooling_down',
      ...(session.mode === 'realtime' ? { nextAttackIn: Math.round(intervalMs / 1000) } : {}),
    });
    return;
  }

  const chosen = await pickDisruption(session, ready);
  if (!chosen) return;

  let disruption = getDisruptionById(chosen.disruptionId) ?? ready[0];
  if (!disruption) return;
  let reasoning = chosen.reasoning;

  // Emit the LLM's reasoning as a thinking step
  emitEvent<DefenderActivityPayload>(gameId, 'defender_activity', {
    message: chosen.reasoning,
    kind: 'thinking',
  });

  session.defenderStatus = 'striking';
  emitEvent(gameId, 'status_update', {
    attackerStatus: session.attackerStatus,
    defenderStatus: 'striking',
  });

  // Generate payload — custom injection gets a second LLM call
  let payload: string;
  if (disruption.id === 'custom-injection') {
    emitEvent<DefenderActivityPayload>(gameId, 'defender_activity', {
      message: 'Generating targeted JavaScript...',
      kind: 'tool_call',
    });
    payload = await generateCustomInjection(session, chosen.reasoning);
    if (!payload) {
      // Fallback to first non-custom disruption
      const fallback = ready.find(d => d.id !== 'custom-injection');
      if (!fallback) return;
      disruption = fallback;
      reasoning = `Fallback: ${fallback.name}`;
      payload = fallback.generatePayload();
      log('[defender] Custom injection failed, falling back to:', fallback.name);
    }
  } else {
    payload = disruption.generatePayload();
  }

  // Fire screenshots in background (fire-and-forget — only for training data, never block game loop)
  captureAndUploadScreenshot(session.cdpUrl).catch(() => null);
  const domSnapPromise = snapshotDOM(session.cdpUrl).catch(() => null);

  emitEvent<DefenderActivityPayload>(gameId, 'defender_activity', {
    message: `Injecting ${disruption.name}...`,
    kind: 'tool_call',
  });

  // Inject immediately — this is the critical path
  log('[defender] injecting disruption:', disruption.name, 'via cdpUrl:', session.cdpUrl || '(EMPTY)');
  const success = await injectJS(session.cdpUrl, payload);
  log('[defender] injection result:', success ? 'SUCCESS' : 'FAILED');

  if (!success) {
    emitEvent<DefenderActivityPayload>(gameId, 'defender_activity', {
      message: 'Injection blocked by browser',
      kind: 'tool_call',
    });
  }

  // Collect DOM snapshot (fast, ~500ms — likely done by now)
  const domSnap = await domSnapPromise;
  const beforeScreenshotId = null;

  // Fire after-screenshot in background (don't block the turn)
  if (success) {
    setTimeout(() => captureAndUploadScreenshot(session.cdpUrl).catch(() => null), 500);
  }
  const afterScreenshotId = null;

  session.defenderCooldowns.set(disruption.id, session.mode === 'turnbased' ? session.turnNumber : Date.now());

  const event: DisruptionEvent = {
    id: nanoid(8),
    disruptionId: disruption.id,
    disruptionName: disruption.name,
    description: disruption.description,
    healthDamage: disruption.healthDamage,
    success,
    timestamp: new Date().toISOString(),
    reasoning,
  };
  session.defenderDisruptions.push(event);

  // Persist defender action to Convex
  recordDefenderAction({
    gameId,
    actionNumber: session.defenderDisruptions.length,
    disruptionId: disruption.id,
    disruptionName: disruption.name,
    description: disruption.description,
    healthDamage: disruption.healthDamage,
    success,
    reasoning,
    timestamp: event.timestamp,
    injectionPayload: payload.slice(0, 5000),
    attackerStepAtTime: session.attackerSteps.length,
    domSnapshot: domSnap ?? undefined,
    screenshotBeforeId: beforeScreenshotId ?? undefined,
    screenshotAfterId: afterScreenshotId ?? undefined,
  });

  // Always emit disruption card (success or failure)
  emitEvent<DefenderDisruptionPayload>(gameId, 'defender_disruption', {
    disruptionId: disruption.id,
    disruptionName: disruption.name,
    description: disruption.description,
    healthDamage: disruption.healthDamage,
    success,
    reasoning,
  });

  // Damage health only on successful injection
  if (success) {
    const prev = session.health;
    const next = Math.max(0, prev - disruption.healthDamage);
    session.health = next;

    emitEvent<HealthUpdatePayload>(gameId, 'health_update', {
      currentHealth: next,
      previousHealth: prev,
      delta: -disruption.healthDamage,
      isCritical: next < 20,
    });

    // Record disruption damage to health timeline
    recordHealthChange({
      gameId,
      health: next,
      delta: -disruption.healthDamage,
      cause: `disruption:${disruption.id}`,
    });

    if (next <= 0) {
      endGame(gameId, 'defender', 'health_depleted');
      return;
    }
  }

  session.defenderStatus = 'cooling_down';
  emitEvent<StatusUpdatePayload>(gameId, 'status_update', {
    attackerStatus: session.attackerStatus,
    defenderStatus: 'cooling_down',
    ...(session.mode === 'realtime' ? { nextAttackIn: Math.round(intervalMs / 1000) } : {}),
  });
    },
  ); // end observe()
}

export function endGame(
  gameId: string,
  winner: 'attacker' | 'defender',
  reason: 'task_complete' | 'health_depleted' | 'aborted'
): void {
  const session = getSession(gameId);
  if (!session || session.phase === 'game_over') return;

  session.phase = 'game_over';
  session.winner = winner;
  session.winReason = reason;
  session.endedAt = new Date().toISOString();

  // Stop loops and cleanup
  if (session.defenderLoopHandle) clearTimeout(session.defenderLoopHandle);
  if (session.healthDecayHandle) clearInterval(session.healthDecayHandle);
  if (session.attackerAbort) session.attackerAbort.abort();
  if (session.stopNetworkCapture) { session.stopNetworkCapture(); session.stopNetworkCapture = null; }

  // Resolve turn-based gates so coroutines unblock and exit
  if (session.attackerGate) {
    session.attackerGate.resolve();
    session.attackerGate = null;
  }
  if (session.defenderSignal) {
    session.defenderSignal.resolve();
    session.defenderSignal = null;
  }

  const elapsed = Math.floor(
    (Date.now() - new Date(session.startedAt).getTime()) / 1000
  );

  emitEvent(gameId, 'game_over', {
    winner,
    reason,
    finalHealth: session.health,
    elapsedSeconds: elapsed,
  });

  // Persist final game state to Convex
  finalizeGame({
    gameId,
    winner,
    winReason: reason,
    healthFinal: session.health,
    durationSeconds: elapsed,
  });

  // Stop screencast and upload recording (async, non-blocking)
  stopScreencast(gameId).then(storageId => {
    if (storageId) setSessionRecording(gameId, storageId);
  }).catch(() => {});

  // Flush Laminar traces so they're sent before potential cleanup
  Laminar.flush().catch(() => {});
}
