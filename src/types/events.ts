import type { AttackerStatus, DefenderStatus, TurnOwner } from './game';

export type SSEEventType =
  | 'connection_established'
  | 'attacker_step'
  | 'defender_disruption'
  | 'defender_activity'
  | 'health_update'
  | 'status_update'
  | 'timer_tick'
  | 'turn_change'
  | 'game_over'
  | 'live_url_ready'
  | 'judge_verdict'
  | 'defender_outcome';

export interface SSEEnvelope<T = unknown> {
  type: SSEEventType;
  sessionId: string;
  timestamp: string;
  payload: T;
}

export interface AttackerStepPayload {
  step: number;
  description: string;
  agentStatus: AttackerStatus;
  isComplete?: boolean;
  // Rich step data (browser-use mode only)
  nextGoal?: string;
  memory?: string;
  evaluationPreviousGoal?: string;
  url?: string;
  screenshotUrl?: string;
  actions?: string[];
}

export interface DefenderDisruptionPayload {
  disruptionId: string;
  disruptionName: string;
  description: string;
  healthDamage: number;
  success: boolean;
  reasoning: string;
  // Structured labels (present when attackSpec is used)
  attackFamily?: string;
  objective?: string;
  concealment?: string;
  authority?: string;
  placement?: string;
}

export interface DefenderActivityPayload {
  message: string;
  kind: 'thinking' | 'tool_call';
}

export interface HealthUpdatePayload {
  currentHealth: number;
  previousHealth: number;
  delta: number;
  isCritical: boolean;
}

export interface TimerTickPayload {
  elapsedSeconds: number;
}

export interface StatusUpdatePayload {
  attackerStatus: AttackerStatus;
  defenderStatus: DefenderStatus;
  nextAttackIn?: number;
}

export interface TurnChangePayload {
  currentTurn: TurnOwner;
  turnNumber: number;
  attackerStepsRemaining: number;
  attackerStepsPerTurn: number;
}

export interface GameOverPayload {
  winner: 'attacker' | 'defender';
  reason: string;
  finalHealth: number;
  elapsedSeconds: number;
}

export interface JudgeVerdictPayload {
  actionNumber: number;
  agentResponse: 'followed' | 'ignored' | 'partial';
  judgeReasoning: string;
}
