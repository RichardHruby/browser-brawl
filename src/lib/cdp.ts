import WebSocket from 'ws';

/**
 * Inject JavaScript into a browser session via CDP Runtime.evaluate.
 * Opens a temporary WebSocket to the CDP endpoint, sends the evaluate command, and closes.
 *
 * cdpUrl can be https:// (browser-use format) or wss:// format.
 */
export async function injectJS(cdpUrl: string, script: string): Promise<boolean> {
  if (!cdpUrl) {
    console.error('[injectJS] No CDP URL provided');
    return false;
  }

  console.log('[injectJS] cdpUrl received:', cdpUrl);

  try {
    const wsUrl = await getPageTargetWsUrl(cdpUrl);
    if (!wsUrl) {
      console.error('[injectJS] No page target found');
      return false;
    }
    return await evaluateViaCDP(wsUrl, script);
  } catch (err) {
    console.error('[injectJS] error:', err);
    return false;
  }
}

function evaluateViaCDP(wsUrl: string, expression: string): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(wsUrl);
    const timeout = setTimeout(() => {
      ws.close();
      resolve(false);
    }, 5000);

    ws.on('open', () => {
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
    const ws = new WebSocket(wsUrl);
    const timeout = setTimeout(() => {
      ws.close();
      resolve(null);
    }, 8000);

    ws.on('open', () => {
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

  try {
    const wsUrl = await getPageTargetWsUrl(cdpUrl);
    if (!wsUrl) return null;

    return await screenshotViaCDP(wsUrl);
  } catch (err) {
    console.error('[captureScreenshot] error:', err);
    return null;
  }
}

function screenshotViaCDP(wsUrl: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const ws = new WebSocket(wsUrl);
    const timeout = setTimeout(() => {
      ws.close();
      resolve(null);
    }, 8000);

    ws.on('open', () => {
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
 */
async function getPageTargetWsUrl(cdpUrl: string): Promise<string | null> {
  const httpBase = cdpUrl
    .replace('wss://', 'https://')
    .replace('ws://', 'http://');
  const baseUrl = new URL(httpBase);
  const targetsUrl = `${baseUrl.protocol}//${baseUrl.host}/json`;

  const targetsRes = await fetch(targetsUrl);
  if (!targetsRes.ok) return null;

  const targets = await targetsRes.json();
  const page = targets.find((t: { type: string; webSocketDebuggerUrl?: string }) => t.type === 'page');
  return page?.webSocketDebuggerUrl ?? null;
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
    console.error('[startNetworkCapture] error:', err);
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

  try {
    const wsUrl = await getPageTargetWsUrl(cdpUrl);
    if (!wsUrl) return null;

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

    return await evaluateAndReturnViaCDP(wsUrl, expression);
  } catch (err) {
    console.error('[snapshotDOM] error:', err);
    return null;
  }
}
