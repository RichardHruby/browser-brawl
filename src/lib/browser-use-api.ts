import { BrowserUse } from 'browser-use-sdk';

let buClient: BrowserUse | null = null;

export function getBuClient(): BrowserUse {
  if (buClient) return buClient;

  const apiKey = process.env.BROWSER_USE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('BROWSER_USE_API_KEY is not configured');
  }

  buClient = new BrowserUse({ apiKey });
  return buClient;
}

// ── Shared result type ──────────────────────────────────────────────

export interface BUSession {
  id: string;
  cdpUrl: string;
  liveUrl: string;
}

// ── Browser Infrastructure (for Playwright MCP mode) ────────────────

export async function createBrowser(timeoutSecs = 900): Promise<BUSession> {
  const session = await getBuClient().browsers.create({ timeout: Math.ceil(timeoutSecs / 60) });
  const cdpUrl = session.cdpUrl ?? '';
  const liveUrl = session.liveUrl ?? '';
  if (!cdpUrl || !liveUrl) {
    throw new Error('[createBrowser] Browser session missing CDP or live URL');
  }
  return {
    id: session.id,
    cdpUrl,
    liveUrl,
  };
}

export async function stopBrowser(browserId: string): Promise<void> {
  await getBuClient().browsers.stop(browserId);
}

// ── Agent Session (for browser-use mode) ────────────────────────────
// Session URLs can appear shortly after creation, so we poll briefly.

export async function createAgentSession(): Promise<BUSession> {
  const session = await getBuClient().sessions.create({ keepAlive: true });
  const { liveUrl, cdpUrl } = await waitForSessionUrls(session.id, session.liveUrl ?? '');

  console.log('[createAgentSession] id:', session.id, 'liveUrl:', liveUrl, 'cdpUrl:', cdpUrl || '(EMPTY)');
  return {
    id: session.id,
    cdpUrl,
    liveUrl,
  };
}

async function waitForSessionUrls(
  sessionId: string,
  initialLiveUrl: string,
): Promise<{ liveUrl: string; cdpUrl: string }> {
  let liveUrl = initialLiveUrl;

  for (let attempt = 0; attempt < 8; attempt++) {
    const cdpUrl = extractCdpFromLiveUrl(liveUrl);
    if (liveUrl && cdpUrl) {
      return { liveUrl, cdpUrl };
    }

    await sleep(500);
    const latest = await getBuClient().sessions.get(sessionId);
    liveUrl = latest.liveUrl ?? '';
  }

  throw new Error(`[createAgentSession] Session ${sessionId} missing liveUrl/cdpUrl`);
}

/**
 * Extract the CDP endpoint from a browser-use liveUrl.
 * liveUrl format: https://live.browser-use.com?wss=https%3A%2F%2F{id}.cdpN.browser-use.com
 * Returns the wss parameter value as-is (https://... format), which injectJS can handle.
 */
function extractCdpFromLiveUrl(liveUrl: string): string {
  if (!liveUrl) return '';
  try {
    const url = new URL(liveUrl);
    const wss = url.searchParams.get('wss');
    if (wss) {
      console.log('[extractCdpFromLiveUrl] extracted wss param:', wss);
      return wss;
    }
  } catch {
    // ignore
  }
  return '';
}

export async function stopTask(taskId: string): Promise<void> {
  await getBuClient().tasks.stop(taskId);
}

export async function stopSession(sessionId: string): Promise<void> {
  await getBuClient().sessions.stop(sessionId);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
