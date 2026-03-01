import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/game-session-store';
import { endGame } from '@/lib/defender-agent';
import { stopBrowser, stopSession, stopTask } from '@/lib/browser-use-api';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const session = getSession(sessionId);

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  // Abort the attacker agent loop
  if (session.attackerAbort) {
    session.attackerAbort.abort();
  }

  // Stop the browser-use AI task if running
  if (session.buTaskId) {
    stopTask(session.buTaskId).catch(() => {});
  }

  // Stop the browser/session
  if (session.browserSessionId) {
    if (session.attackerType === 'browser-use') {
      stopSession(session.browserSessionId).catch(() => {});
    } else {
      stopBrowser(session.browserSessionId).catch(() => {});
    }
  }

  // End game
  endGame(sessionId, 'defender', 'aborted');

  return NextResponse.json({ ok: true });
}
