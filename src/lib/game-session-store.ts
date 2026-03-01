import type { AgentEvent, AttackerMode, DisruptionEvent, Difficulty, GamePhase, AttackerStatus, DefenderStatus, Task } from '@/types/game';

// Server-side extended session with runtime fields
export interface ServerGameSession {
  gameId: string;
  browserSessionId: string;
  cdpUrl: string;
  liveViewUrl: string;
  task: Task;
  difficulty: Difficulty;
  attackerMode: AttackerMode;
  phase: GamePhase;
  health: number;
  startedAt: string;
  endedAt: string | null;
  attackerStatus: AttackerStatus;
  defenderStatus: DefenderStatus;
  attackerSteps: AgentEvent[];
  defenderDisruptions: DisruptionEvent[];
  winner: 'attacker' | 'defender' | null;
  winReason: 'task_complete' | 'health_depleted' | 'aborted' | null;
  // Runtime-only fields
  sseClients: Set<ReadableStreamDefaultController>;
  defenderLoopHandle: ReturnType<typeof setTimeout> | null;
  defenderCooldowns: Map<string, number>;
  healthDecayHandle: ReturnType<typeof setInterval> | null;
  attackerAbort: AbortController | null;
  knownStepIds: Set<string>;
}

// Global singleton store — survives across API route invocations in the same process
declare global {
  // eslint-disable-next-line no-var
  var __gameSessions: Map<string, ServerGameSession> | undefined;
}

export const sessions: Map<string, ServerGameSession> =
  global.__gameSessions ?? (global.__gameSessions = new Map());

export function createSession(params: {
  gameId: string;
  browserSessionId: string;
  cdpUrl: string;
  liveViewUrl: string;
  task: Task;
  difficulty: Difficulty;
  attackerMode?: AttackerMode;
}): ServerGameSession {
  const session: ServerGameSession = {
    ...params,
    attackerMode: params.attackerMode ?? 'playwright',
    phase: 'loading' as GamePhase,
    health: 100,
    startedAt: new Date().toISOString(),
    endedAt: null,
    attackerStatus: 'idle' as AttackerStatus,
    defenderStatus: 'idle' as DefenderStatus,
    attackerSteps: [] as AgentEvent[],
    defenderDisruptions: [] as DisruptionEvent[],
    winner: null,
    winReason: null,
    sseClients: new Set(),
    defenderLoopHandle: null,
    defenderCooldowns: new Map(),
    healthDecayHandle: null,
    attackerAbort: null,
    knownStepIds: new Set(),
  };
  sessions.set(params.gameId, session);
  return session;
}

export function getSession(gameId: string): ServerGameSession | undefined {
  return sessions.get(gameId);
}

export function deleteSession(gameId: string): void {
  sessions.delete(gameId);
}
