import type { AgentEvent, DisruptionEvent, Difficulty, GameMode, GamePhase, AttackerStatus, AttackerType, DefenderStatus, TurnOwner, Task, ModelProvider, ModelId } from '@/types/game';
import type { AttackSpec, AttackRuntimeState, AttackSuite } from './attack-spec';

// Server-side extended session with runtime fields
export interface ServerGameSession {
  gameId: string;
  browserSessionId: string;
  cdpUrl: string;
  liveViewUrl: string;
  task: Task;
  difficulty: Difficulty;
  attackerType: AttackerType;
  modelUrl?: string;
  modelProvider?: ModelProvider;
  modelId?: ModelId;
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
  // Turn-based mode fields
  mode: GameMode;
  currentTurn: TurnOwner | null;
  turnNumber: number;
  attackerStepsThisTurn: number;
  attackerStepsPerTurn: number;
  attackerGate: { promise: Promise<void>; resolve: () => void } | null;
  defenderSignal: { promise: Promise<void>; resolve: () => void } | null;
  // Finetuned: resolved after first real attacker step so defender waits
  finetunedReadyGate: { promise: Promise<void>; resolve: () => void } | null;
  // Runtime-only fields
  sseClients: Set<ReadableStreamDefaultController>;
  defenderLoopHandle: ReturnType<typeof setTimeout> | null;
  defenderCooldowns: Map<string, number>;
  healthDecayHandle: ReturnType<typeof setInterval> | null;
  attackerAbort: AbortController | null;
  stopNetworkCapture: (() => void) | null;
  knownStepIds: Set<string>;
  buTaskId: string | null;
  buSessionId: string | null;
  skipScreenshots: boolean;
  // Controllable defender fields
  attackSpec?: AttackSpec;
  attackSuite?: AttackSuite;
  agentSecrets?: Record<string, string>;
  attackRuntimeState?: AttackRuntimeState;
}

// Global singleton store — survives across API route invocations in the same process
declare global {
  var __gameSessions: Map<string, ServerGameSession> | undefined;
}

export const sessions: Map<string, ServerGameSession> =
  global.__gameSessions ?? (global.__gameSessions = new Map());

const STEPS_PER_TURN: Record<string, number> = {
  easy: 2,
  medium: 2,
  hard: 2,
  nightmare: 2,
};

export function createGate(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
}

export function createSession(params: {
  gameId: string;
  browserSessionId: string;
  cdpUrl: string;
  liveViewUrl: string;
  task: Task;
  difficulty: Difficulty;
  mode: GameMode;
  attackerType: AttackerType;
  modelUrl?: string;
  modelProvider?: ModelProvider;
  modelId?: ModelId;
  skipScreenshots?: boolean;
  attackSpec?: AttackSpec;
  attackSuite?: AttackSuite;
  agentSecrets?: Record<string, string>;
}): ServerGameSession {
  const session: ServerGameSession = {
    ...params,
    skipScreenshots: params.skipScreenshots ?? false,
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
    // Turn-based fields
    currentTurn: params.mode === 'turnbased' ? 'attacker' : null,
    turnNumber: 1,
    attackerStepsThisTurn: 0,
    attackerStepsPerTurn: STEPS_PER_TURN[params.difficulty] ?? 3,
    attackerGate: null,
    defenderSignal: null,
    finetunedReadyGate: params.attackerType === 'finetuned' ? createGate() : null,
    // Runtime fields
    sseClients: new Set(),
    defenderLoopHandle: null,
    defenderCooldowns: new Map(),
    healthDecayHandle: null,
    attackerAbort: null,
    stopNetworkCapture: null,
    knownStepIds: new Set(),
    buTaskId: null,
    buSessionId: null,
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
