import { NextRequest } from 'next/server';
import { getSession } from '@/lib/game-session-store';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const session = getSession(sessionId);

  if (!session) {
    return new Response('Session not found', { status: 404 });
  }

  const encoder = new TextEncoder();

  let ctrl: ReadableStreamDefaultController;

  const stream = new ReadableStream({
    start(controller) {
      ctrl = controller;

      // Register this client
      session.sseClients.add(controller);

      // Send initial connection event
      const welcome = `data: ${JSON.stringify({
        type: 'connection_established',
        sessionId,
        timestamp: new Date().toISOString(),
        payload: {
          phase: session.phase,
          health: session.health,
          attackerStatus: session.attackerStatus,
          defenderStatus: session.defenderStatus,
          defenderMode: session.defenderMode ?? null,
        },
      })}\n\n`;
      controller.enqueue(encoder.encode(welcome));

      // Replay any existing steps/disruptions for reconnection
      for (const step of session.attackerSteps) {
        const ev = `data: ${JSON.stringify({
          type: 'attacker_step',
          sessionId,
          timestamp: step.timestamp,
          payload: {
            step: step.step,
            description: step.description,
            agentStatus: step.agentStatus,
          },
        })}\n\n`;
        controller.enqueue(encoder.encode(ev));
      }

      for (const d of session.defenderDisruptions) {
        const ev = `data: ${JSON.stringify({
          type: 'defender_disruption',
          sessionId,
          timestamp: d.timestamp,
          payload: {
            disruptionId: d.disruptionId,
            disruptionName: d.disruptionName,
            description: d.description,
            healthDamage: d.healthDamage,
            success: d.success,
            reasoning: d.reasoning,
          },
        })}\n\n`;
        controller.enqueue(encoder.encode(ev));
      }

      // Replay turn state for turn-based games
      if (session.mode === 'turnbased' && session.currentTurn) {
        const turnEv = `data: ${JSON.stringify({
          type: 'turn_change',
          sessionId,
          timestamp: new Date().toISOString(),
          payload: {
            currentTurn: session.currentTurn,
            turnNumber: session.turnNumber,
            attackerStepsRemaining: session.attackerStepsPerTurn - session.attackerStepsThisTurn,
            attackerStepsPerTurn: session.attackerStepsPerTurn,
          },
        })}\n\n`;
        controller.enqueue(encoder.encode(turnEv));
      }
    },
    cancel() {
      session.sseClients.delete(ctrl);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
