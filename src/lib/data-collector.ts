import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';
import type { SSEEventType } from '@/types/events';

let client: ConvexHttpClient | null = null;

function getClient(): ConvexHttpClient | null {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    console.warn('[data-collector] NEXT_PUBLIC_CONVEX_URL not set — data collection disabled');
    return null;
  }

  client = new ConvexHttpClient(url);
  return client;
}

/**
 * Fire-and-forget helper. Logs errors but never throws.
 */
function fire(promise: Promise<unknown>): void {
  promise.catch((err) => {
    console.error('[data-collector]', err);
  });
}

// ── Session lifecycle ──────────────────────────────────────────────

export function createGameRecord(params: {
  gameId: string;
  taskId: string;
  taskLabel: string;
  taskDescription: string;
  taskStartUrl: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'nightmare';
  mode: 'realtime' | 'turnbased';
  attackerModel: string;
  defenderModel: string;
}): void {
  const c = getClient();
  if (!c) return;

  fire(
    c.mutation(api.sessions.create, {
      ...params,
      startedAt: new Date().toISOString(),
    }),
  );
}

export function finalizeGame(params: {
  gameId: string;
  winner: 'attacker' | 'defender';
  winReason: 'task_complete' | 'health_depleted' | 'aborted';
  healthFinal: number;
  durationSeconds: number;
}): void {
  const c = getClient();
  if (!c) return;

  fire(c.mutation(api.sessions.finalize, params));
}

export function setSessionRecording(gameId: string, recordingStorageId: string): void {
  const c = getClient();
  if (!c) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fire(c.mutation(api.sessions.setRecording, { gameId, recordingStorageId: recordingStorageId as any }));
}

// ── Attacker steps ─────────────────────────────────────────────────

export function recordAttackerStep(params: {
  gameId: string;
  stepNumber: number;
  toolName?: string;
  toolInput?: string;
  toolResultSummary?: string;
  description: string;
  agentStatus: string;
  timestamp: string;
  domSnapshot?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  screenshotBeforeId?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  screenshotAfterId?: any;
}): void {
  const c = getClient();
  if (!c) return;

  fire(c.mutation(api.steps.recordAttackerStep, params));
}

// ── Defender actions ───────────────────────────────────────────────

export function recordDefenderAction(params: {
  gameId: string;
  actionNumber: number;
  disruptionId: string;
  disruptionName: string;
  description: string;
  healthDamage: number;
  success: boolean;
  reasoning: string;
  timestamp: string;
  injectionPayload?: string;
  domSnapshot?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  screenshotBeforeId?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  screenshotAfterId?: any;
  attackerStepAtTime?: number;
}): void {
  const c = getClient();
  if (!c) return;

  fire(c.mutation(api.steps.recordDefenderAction, params));
}

// ── Conversation history (for training data) ──────────────────────

export function recordConversation(params: {
  gameId: string;
  stepNumber: number;
  messages: string; // JSON-stringified Anthropic messages array
  toolDefinitions?: string; // JSON-stringified tool schemas
}): void {
  const c = getClient();
  if (!c) return;

  const msgCount = JSON.parse(params.messages).length;
  const toolCount = params.toolDefinitions ? JSON.parse(params.toolDefinitions).length : 0;
  console.log(`[training-data] 📝 Recording conversation | game=${params.gameId.slice(0, 8)} step=${params.stepNumber} msgs=${msgCount} tools=${toolCount} size=${(params.messages.length / 1024).toFixed(1)}KB`);

  fire(
    c.mutation(api.conversations.record, {
      ...params,
      timestamp: new Date().toISOString(),
    }),
  );
}

// ── Health timeline ────────────────────────────────────────────────

export function recordHealthChange(params: {
  gameId: string;
  health: number;
  delta: number;
  cause: string;
}): void {
  const c = getClient();
  if (!c) return;

  fire(
    c.mutation(api.health.record, {
      ...params,
      timestamp: new Date().toISOString(),
    }),
  );
}

// ── SSE event log ──────────────────────────────────────────────────

export function recordSSEEvent(
  gameId: string,
  eventType: SSEEventType,
  payload: unknown,
): void {
  const c = getClient();
  if (!c) return;

  fire(
    c.mutation(api.events.record, {
      gameId,
      eventType,
      payloadJson: JSON.stringify(payload),
      timestamp: new Date().toISOString(),
    }),
  );
}

// ── Network requests ───────────────────────────────────────────────

export function recordNetworkRequest(params: {
  gameId: string;
  method: string;
  url: string;
  status?: number;
  resourceType?: string;
  responseSize?: number;
  stepRef?: string;
}): void {
  const c = getClient();
  if (!c) return;

  fire(
    c.mutation(api.network.record, {
      ...params,
      timestamp: new Date().toISOString(),
    }),
  );
}

// ── Screenshot capture + upload ──────────────────────────────────

/**
 * Capture a screenshot from the browser and upload to Convex in one call.
 * Returns the Convex storage ID, or null on failure.
 */
export async function captureAndUploadScreenshot(
  cdpUrl: string,
): Promise<string | null> {
  try {
    const { captureScreenshot } = await import('./cdp');
    const png = await captureScreenshot(cdpUrl);
    if (!png) return null;
    return await uploadScreenshot(png);
  } catch (err) {
    console.error('[data-collector] captureAndUpload error:', err);
    return null;
  }
}

/**
 * Download a screenshot from a URL and upload to Convex storage.
 * Used for Browser-Use mode where screenshots are external URLs.
 * Returns the Convex storage ID, or null on failure.
 */
export async function downloadAndUploadScreenshot(
  url: string,
): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuf = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    return await uploadScreenshot(buffer);
  } catch (err) {
    console.error('[data-collector] downloadAndUpload error:', err);
    return null;
  }
}

export async function uploadScreenshot(
  pngBuffer: Buffer,
): Promise<string | null> {
  const c = getClient();
  if (!c) return null;

  try {
    const uploadUrl = await c.mutation(api.screenshots.generateUploadUrl, {});

    const blob = new Blob([pngBuffer as unknown as ArrayBuffer], { type: 'image/png' });
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: blob,
    });

    if (!res.ok) {
      console.error('[data-collector] Screenshot upload failed:', res.status);
      return null;
    }

    const { storageId } = await res.json();
    return storageId as string;
  } catch (err) {
    console.error('[data-collector] Screenshot upload error:', err);
    return null;
  }
}
