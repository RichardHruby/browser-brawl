import WebSocket from 'ws';
import { log, logError } from './log';

// Cache resolved page target WS URL per CDP endpoint
const wsUrlCache = new Map<string, { url: string; resolvedAt: number }>();
const WS_URL_CACHE_TTL = 60_000; // 60s

/**
 * Inject JavaScript into a browser session via CDP Runtime.evaluate.
 * Opens a temporary WebSocket to the CDP endpoint, sends the evaluate command, and closes.
 *
 * cdpUrl can be https:// (browser-use format) or wss:// format.
 */
export async function injectJS(cdpUrl: string, script: string): Promise<boolean> {
  if (!cdpUrl) {
    logError('[injectJS] No CDP URL provided');
    return false;
  }

  const t0 = Date.now();

  try {
    const result = await runWithPageTargetRetry(
      cdpUrl,
      'injectJS',
      (wsUrl) => evaluateViaCDP(wsUrl, script),
      (value) => value === false,
    );
    if (result == null) {
      logError('[injectJS] No page target found');
      return false;
    }
    log(`[injectJS] done in ${Date.now() - t0}ms (success=${result})`);
    return result;
  } catch (err) {
    logError(`[injectJS] error after ${Date.now() - t0}ms:`, err);
    return false;
  }
}

function evaluateViaCDP(wsUrl: string, expression: string): Promise<boolean> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const ws = new WebSocket(wsUrl);
    const timeout = setTimeout(() => {
      log(`[evaluateViaCDP] TIMEOUT after ${Date.now() - t0}ms`);
      ws.close();
      resolve(false);
    }, 5000);

    ws.on('open', () => {
      log(`[evaluateViaCDP] WS open in ${Date.now() - t0}ms`);
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression, awaitPromise: false },
      }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id === 1) {
          clearTimeout(timeout);
          ws.close();
          log(`[evaluateViaCDP] response in ${Date.now() - t0}ms`);
          resolve(!msg.error);
        }
      } catch {
        // ignore
      }
    });

    ws.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

function evaluateAndReturnViaCDP(wsUrl: string, expression: string): Promise<string | null> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const ws = new WebSocket(wsUrl);
    const timeout = setTimeout(() => {
      log(`[evaluateAndReturnViaCDP] TIMEOUT after ${Date.now() - t0}ms`);
      ws.close();
      resolve(null);
    }, 8000);

    ws.on('open', () => {
      log(`[evaluateAndReturnViaCDP] WS open in ${Date.now() - t0}ms`);
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true, awaitPromise: false },
      }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id === 1) {
          clearTimeout(timeout);
          ws.close();
          log(`[evaluateAndReturnViaCDP] response in ${Date.now() - t0}ms`);
          if (msg.error || !msg.result?.result?.value) {
            resolve(null);
          } else {
            resolve(String(msg.result.result.value));
          }
        }
      } catch {
        resolve(null);
      }
    });

    ws.on('error', () => {
      clearTimeout(timeout);
      resolve(null);
    });
  });
}

/**
 * Capture a PNG screenshot via CDP Page.captureScreenshot.
 * Returns the raw PNG as a Buffer, or null on failure.
 */
export async function captureScreenshot(cdpUrl: string): Promise<Buffer | null> {
  if (!cdpUrl) return null;
  const t0 = Date.now();

  try {
    const result = await runWithPageTargetRetry(
      cdpUrl,
      'captureScreenshot',
      screenshotViaCDP,
      (value) => value == null,
    );
    log(`[captureScreenshot] done in ${Date.now() - t0}ms (${result ? `${result.length} bytes` : 'null'})`);
    return result;
  } catch (err) {
    logError(`[captureScreenshot] error after ${Date.now() - t0}ms:`, err);
    return null;
  }
}

function screenshotViaCDP(wsUrl: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const ws = new WebSocket(wsUrl);
    const timeout = setTimeout(() => {
      log(`[screenshotViaCDP] TIMEOUT after ${Date.now() - t0}ms`);
      ws.close();
      resolve(null);
    }, 8000);

    ws.on('open', () => {
      log(`[screenshotViaCDP] WS open in ${Date.now() - t0}ms`);
      ws.send(JSON.stringify({
        id: 1,
        method: 'Page.captureScreenshot',
        params: { format: 'png' },
      }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id === 1) {
          clearTimeout(timeout);
          ws.close();
          log(`[screenshotViaCDP] response in ${Date.now() - t0}ms`);
          if (msg.error || !msg.result?.data) {
            resolve(null);
          } else {
            resolve(Buffer.from(msg.result.data, 'base64'));
          }
        }
      } catch {
        resolve(null);
      }
    });

    ws.on('error', () => {
      clearTimeout(timeout);
      resolve(null);
    });
  });
}

/**
 * Resolve the WebSocket debugger URL for the first page target.
 * Caches the result per CDP endpoint for 60s.
 */
export async function getPageTargetWsUrl(cdpUrl: string): Promise<string | null> {
  const t0 = Date.now();

  // Check cache first
  const cached = wsUrlCache.get(cdpUrl);
  if (cached && Date.now() - cached.resolvedAt < WS_URL_CACHE_TTL) {
    log(`[getPageTargetWsUrl] cache HIT (${Date.now() - t0}ms)`);
    return cached.url;
  }

  const httpBase = cdpUrl
    .replace('wss://', 'https://')
    .replace('ws://', 'http://');
  const baseUrl = new URL(httpBase);
  const targetsUrl = `${baseUrl.protocol}//${baseUrl.host}/json`;

  try {
    const targetsRes = await fetch(targetsUrl);
    if (!targetsRes.ok) {
      log(`[getPageTargetWsUrl] fetch FAILED (${targetsRes.status}) in ${Date.now() - t0}ms`);
      return null;
    }

    const targets = await targetsRes.json();
    const page = targets.find((t: { type: string; webSocketDebuggerUrl?: string }) => t.type === 'page');
    const wsUrl = page?.webSocketDebuggerUrl ?? null;

    if (wsUrl) {
      wsUrlCache.set(cdpUrl, { url: wsUrl, resolvedAt: Date.now() });
    }

    log(`[getPageTargetWsUrl] resolved in ${Date.now() - t0}ms (cached=${!!wsUrl})`);
    return wsUrl;
  } catch (err) {
    logError(`[getPageTargetWsUrl] error after ${Date.now() - t0}ms:`, err);
    return null;
  }
}

async function runWithPageTargetRetry<T>(
  cdpUrl: string,
  opName: string,
  operation: (wsUrl: string) => Promise<T>,
  isFailure: (result: T) => boolean,
): Promise<T | null> {
  let wsUrl = await getPageTargetWsUrl(cdpUrl);
  if (!wsUrl) return null;

  let result = await operation(wsUrl);
  if (!isFailure(result)) return result;

  if (!wsUrlCache.has(cdpUrl)) return result;

  // Page targets can rotate; invalidate stale cache entry and retry once.
  wsUrlCache.delete(cdpUrl);
  log(`[${opName}] retrying with refreshed page target URL`);

  wsUrl = await getPageTargetWsUrl(cdpUrl);
  if (!wsUrl) return result;

  result = await operation(wsUrl);
  return result;
}

/**
 * Start capturing network requests via CDP Network domain.
 * Returns a stop function that closes the WebSocket and returns captured requests.
 */
export async function startNetworkCapture(
  cdpUrl: string,
  onRequest: (req: { method: string; url: string; status?: number; resourceType?: string; responseSize?: number }) => void,
): Promise<(() => void) | null> {
  if (!cdpUrl) return null;

  try {
    const wsUrl = await getPageTargetWsUrl(cdpUrl);
    if (!wsUrl) return null;

    const ws = new WebSocket(wsUrl);
    let closed = false;

    ws.on('open', () => {
      ws.send(JSON.stringify({ id: 1, method: 'Network.enable', params: {} }));
    });

    ws.on('message', (data) => {
      if (closed) return;
      try {
        const msg = JSON.parse(data.toString());
        if (msg.method === 'Network.responseReceived') {
          const resp = msg.params?.response;
          if (resp) {
            onRequest({
              method: resp.requestHeaders?.[':method'] ?? msg.params.type ?? 'GET',
              url: resp.url ?? '',
              status: resp.status,
              resourceType: msg.params.type,
              responseSize: resp.encodedDataLength,
            });
          }
        }
      } catch {
        // ignore parse errors
      }
    });

    ws.on('error', () => { /* ignore */ });

    return () => {
      closed = true;
      try {
        ws.send(JSON.stringify({ id: 2, method: 'Network.disable', params: {} }));
      } catch { /* ignore */ }
      ws.close();
    };
  } catch (err) {
    logError('[startNetworkCapture] error:', err);
    return null;
  }
}

/**
 * Extract a snapshot of interactive DOM elements via CDP.
 * Returns a JSON string describing up to 50 visible interactive elements,
 * or null on failure.
 */
export async function snapshotDOM(cdpUrl: string): Promise<string | null> {
  if (!cdpUrl) return null;
  const t0 = Date.now();

  try {
    const expression = `
      (function() {
        var els = document.querySelectorAll(
          'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [type="submit"], form'
        );
        var results = [];
        for (var i = 0; i < els.length && results.length < 50; i++) {
          var el = els[i];
          var rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;
          var cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          results.push({
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || '').trim().slice(0, 80),
            id: el.id || undefined,
            classes: el.className ? String(el.className).slice(0, 100) : undefined,
            type: el.getAttribute('type') || undefined,
            href: el.getAttribute('href') || undefined,
            name: el.getAttribute('name') || undefined,
            role: el.getAttribute('role') || undefined,
            pos: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
          });
        }
        return JSON.stringify(results);
      })()
    `;

    const result = await runWithPageTargetRetry(
      cdpUrl,
      'snapshotDOM',
      (wsUrl) => evaluateAndReturnViaCDP(wsUrl, expression),
      (value) => value == null,
    );
    log(`[snapshotDOM] done in ${Date.now() - t0}ms (${result ? `${result.length} chars` : 'null'})`);
    return result;
  } catch (err) {
    logError(`[snapshotDOM] error after ${Date.now() - t0}ms:`, err);
    return null;
  }
}
