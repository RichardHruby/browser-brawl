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
    // Ensure we have an https:// base for the /json endpoint
    const httpBase = cdpUrl
      .replace('wss://', 'https://')
      .replace('ws://', 'http://');
    const baseUrl = new URL(httpBase);
    const targetsUrl = `${baseUrl.protocol}//${baseUrl.host}/json`;

    console.log('[injectJS] fetching targets from:', targetsUrl);
    const targetsRes = await fetch(targetsUrl);
    if (!targetsRes.ok) {
      const body = await targetsRes.text();
      console.error('[injectJS] Failed to list CDP targets:', targetsRes.status, body);
      return false;
    }

    const targets = await targetsRes.json();
    console.log('[injectJS] targets found:', targets.length, 'types:', targets.map((t: { type: string }) => t.type));
    const page = targets.find((t: { type: string; webSocketDebuggerUrl?: string }) => t.type === 'page');
    if (!page?.webSocketDebuggerUrl) {
      console.error('[injectJS] No page target found. All targets:', JSON.stringify(targets, null, 2));
      return false;
    }

    console.log('[injectJS] connecting to page target:', page.webSocketDebuggerUrl);
    return await evaluateViaCDP(page.webSocketDebuggerUrl, script);
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
 * Extract a snapshot of interactive DOM elements via CDP.
 * Returns a JSON string describing up to 50 visible interactive elements,
 * or null on failure.
 */
export async function snapshotDOM(cdpUrl: string): Promise<string | null> {
  if (!cdpUrl) return null;

  try {
    const httpBase = cdpUrl
      .replace('wss://', 'https://')
      .replace('ws://', 'http://');
    const baseUrl = new URL(httpBase);
    const targetsUrl = `${baseUrl.protocol}//${baseUrl.host}/json`;

    const targetsRes = await fetch(targetsUrl);
    if (!targetsRes.ok) return null;

    const targets = await targetsRes.json();
    const page = targets.find((t: { type: string; webSocketDebuggerUrl?: string }) => t.type === 'page');
    if (!page?.webSocketDebuggerUrl) return null;

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

    return await evaluateAndReturnViaCDP(page.webSocketDebuggerUrl, expression);
  } catch (err) {
    console.error('[snapshotDOM] error:', err);
    return null;
  }
}
