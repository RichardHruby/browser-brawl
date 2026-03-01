import { getSession } from './game-session-store';
import { emitEvent } from './sse-emitter';
import { recordAttackerStep } from './data-collector';
import { nanoid } from 'nanoid';
import type { AttackerStepPayload } from '@/types/events';
import type { AttackerStatus } from '@/types/game';

/**
 * Unified logger for attacker steps across all attacker modes
 * (Playwright MCP, Stagehand, Browser-Use).
 *
 * Encapsulates the 4 concerns each step needs:
 * 1. Increment step counter
 * 2. Push to session.attackerSteps[] (in-memory)
 * 3. Emit SSE attacker_step + status_update events
 * 4. Persist to Convex via recordAttackerStep() (fire-and-forget)
 *
 * The logger does NOT manage screenshot/DOM capture — each attacker mode
 * captures data however it wants and passes it in.
 */
export class AttackerStepLogger {
  private stepNumber = 0;

  constructor(private gameId: string) {}

  /** Current step number */
  get currentStep(): number {
    return this.stepNumber;
  }

  /** Log a reasoning/thinking step */
  logThinking(opts: {
    description: string;
    screenshotId?: string | null;
    domSnapshot?: string | null;
  }): number {
    const step = ++this.stepNumber;
    const description = opts.description.slice(0, 300);
    const timestamp = new Date().toISOString();


    this.pushToSession(step, description, 'thinking', timestamp);
    this.emitStep(step, description, 'thinking', false);
    this.emitStatus('thinking');

    recordAttackerStep({
      gameId: this.gameId,
      stepNumber: step,
      description,
      agentStatus: 'thinking',
      timestamp,
      screenshotBeforeId: opts.screenshotId ?? undefined,
      domSnapshot: opts.domSnapshot ?? undefined,
    });

    return step;
  }

  /** Log a tool execution / action step */
  logAction(opts: {
    description: string;
    toolName?: string;
    toolInput?: string;
    toolResult?: string;
    screenshotId?: string | null;
    domSnapshot?: string | null;
    screenshotUrl?: string;
  }): number {
    const step = ++this.stepNumber;
    const description = opts.description.slice(0, 300);
    const timestamp = new Date().toISOString();


    this.pushToSession(step, description, 'acting', timestamp);

    // Include screenshotUrl in SSE payload for live display (Browser-Use)
    emitEvent<AttackerStepPayload>(this.gameId, 'attacker_step', {
      step,
      description,
      agentStatus: 'acting',
      isComplete: false,
      screenshotUrl: opts.screenshotUrl,
    });
    this.emitStatus('acting');

    recordAttackerStep({
      gameId: this.gameId,
      stepNumber: step,
      toolName: opts.toolName,
      toolInput: opts.toolInput?.slice(0, 2000),
      toolResultSummary: opts.toolResult?.slice(0, 500),
      description,
      agentStatus: 'acting',
      timestamp,
      screenshotBeforeId: opts.screenshotId ?? undefined,
      domSnapshot: opts.domSnapshot ?? undefined,
    });

    return step;
  }

  /** Log completion or failure (final step) */
  logComplete(opts: {
    description: string;
    success: boolean;
    screenshotId?: string | null;
    domSnapshot?: string | null;
  }): number {
    const step = ++this.stepNumber;
    const description = opts.description.slice(0, 200);
    const agentStatus: AttackerStatus = opts.success ? 'complete' : 'failed';
    const timestamp = new Date().toISOString();


    this.pushToSession(step, description, agentStatus, timestamp);
    this.emitStep(step, description, agentStatus, opts.success);
    this.emitStatus(agentStatus);

    recordAttackerStep({
      gameId: this.gameId,
      stepNumber: step,
      description,
      agentStatus,
      timestamp,
      screenshotBeforeId: opts.screenshotId ?? undefined,
      domSnapshot: opts.domSnapshot ?? undefined,
    });

    return step;
  }

  // ── Private helpers ──────────────────────────────────────────────

  private pushToSession(
    step: number,
    description: string,
    agentStatus: AttackerStatus,
    timestamp: string,
  ): void {
    const session = getSession(this.gameId);
    if (!session) return;
    session.attackerSteps.push({
      id: nanoid(8),
      step,
      description,
      timestamp,
      agentStatus,
    });
  }

  private emitStep(
    step: number,
    description: string,
    agentStatus: AttackerStatus,
    isComplete: boolean,
  ): void {
    emitEvent<AttackerStepPayload>(this.gameId, 'attacker_step', {
      step,
      description,
      agentStatus,
      isComplete,
    });
  }

  private emitStatus(attackerStatus: AttackerStatus): void {
    const session = getSession(this.gameId);
    if (!session) return;
    session.attackerStatus = attackerStatus;
    emitEvent(this.gameId, 'status_update', {
      attackerStatus,
      defenderStatus: session.defenderStatus,
    });
  }
}
