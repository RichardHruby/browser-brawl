import WebSocket from 'ws';
import { uploadScreenshot } from './data-collector';

interface ScreencastFrame {
  timestamp: number; // ms since recording start
  data: string;      // base64 JPEG
}

interface ScreencastSession {
  frames: ScreencastFrame[];
  ws: WebSocket;
  startTime: number;
  stopped: boolean;
}

const activeSessions = new Map<string, ScreencastSession>();

/**
 * Start CDP screencast for a game session.
 * Captures JPEG frames at ~1fps and stores them in memory.
 */
export async function startScreencast(gameId: string, cdpUrl: string): Promise<void> {
  if (!cdpUrl || activeSessions.has(gameId)) return;

  try {
    // Resolve page target WebSocket URL
    const httpBase = cdpUrl
      .replace('wss://', 'https://')
      .replace('ws://', 'http://');
    const baseUrl = new URL(httpBase);
    const targetsUrl = `${baseUrl.protocol}//${baseUrl.host}/json`;

    const targetsRes = await fetch(targetsUrl);
    if (!targetsRes.ok) return;

    const targets = await targetsRes.json();
    const page = targets.find((t: { type: string; webSocketDebuggerUrl?: string }) => t.type === 'page');
    if (!page?.webSocketDebuggerUrl) return;

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    const session: ScreencastSession = {
      frames: [],
      ws,
      startTime: Date.now(),
      stopped: false,
    };
    activeSessions.set(gameId, session);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Page.startScreencast',
        params: {
          format: 'jpeg',
          quality: 40,
          maxWidth: 1280,
          maxHeight: 720,
          everyNthFrame: 1,
        },
      }));
      console.log(`[screencast] Started for game ${gameId}`);
    });

    ws.on('message', (data) => {
      if (session.stopped) return;
      try {
        const msg = JSON.parse(data.toString());
        if (msg.method === 'Page.screencastFrame') {
          const frameData = msg.params?.data;
          const sessionId = msg.params?.sessionId;

          if (frameData) {
            session.frames.push({
              timestamp: Date.now() - session.startTime,
              data: frameData,
            });
          }

          // Acknowledge frame to receive the next one
          if (sessionId != null) {
            ws.send(JSON.stringify({
              id: 2,
              method: 'Page.screencastFrameAck',
              params: { sessionId },
            }));
          }
        }
      } catch {
        // ignore parse errors
      }
    });

    ws.on('error', (err) => {
      console.error(`[screencast] WebSocket error for game ${gameId}:`, err.message);
    });

    ws.on('close', () => {
      session.stopped = true;
    });
  } catch (err) {
    console.error('[screencast] start error:', err);
  }
}

/**
 * Stop screencast and upload the recording to Convex.
 * Returns the Convex storage ID of the recording blob, or null.
 */
export async function stopScreencast(gameId: string): Promise<string | null> {
  const session = activeSessions.get(gameId);
  if (!session) return null;

  session.stopped = true;
  activeSessions.delete(gameId);

  // Stop screencast and close WebSocket
  try {
    session.ws.send(JSON.stringify({
      id: 3,
      method: 'Page.stopScreencast',
      params: {},
    }));
  } catch { /* ignore */ }

  setTimeout(() => {
    try { session.ws.close(); } catch { /* ignore */ }
  }, 500);

  const frameCount = session.frames.length;
  console.log(`[screencast] Stopped for game ${gameId} — ${frameCount} frames captured`);

  if (frameCount === 0) return null;

  // Build a compact recording: JSON with frame timestamps + base64 JPEG data
  // Format: { fps: number, duration: number, frames: [{ t: number, d: string }] }
  try {
    const recording = JSON.stringify({
      fps: frameCount / ((Date.now() - session.startTime) / 1000),
      duration: Date.now() - session.startTime,
      frameCount,
      frames: session.frames.map(f => ({ t: f.timestamp, d: f.data })),
    });

    // Upload as a blob to Convex storage via the screenshot upload mechanism
    const buffer = Buffer.from(recording, 'utf-8');
    const storageId = await uploadScreenshot(buffer);

    if (storageId) {
      console.log(`[screencast] Uploaded recording for game ${gameId} (${frameCount} frames, ${(buffer.length / 1024 / 1024).toFixed(1)}MB)`);
    }

    // Free memory
    session.frames.length = 0;

    return storageId;
  } catch (err) {
    console.error('[screencast] upload error:', err);
    session.frames.length = 0;
    return null;
  }
}
