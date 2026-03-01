export type Difficulty = 'easy' | 'medium' | 'hard' | 'nightmare';
export type GameMode = 'realtime' | 'turnbased';
export type AttackerType = 'playwright-mcp' | 'browser-use' | 'browserbase';
export type GamePhase = 'lobby' | 'loading' | 'arena' | 'game_over';
export type AttackerStatus = 'idle' | 'thinking' | 'acting' | 'complete' | 'failed';
export type DefenderStatus = 'idle' | 'plotting' | 'striking' | 'cooling_down';
export type TurnOwner = 'attacker' | 'defender';

export interface Task {
  id: string;
  label: string;
  description: string;
  startUrl: string;
  tags: string[];
}

export interface AgentEvent {
  id: string;
  step: number;
  description: string;
  timestamp: string;
  agentStatus: AttackerStatus;
}

export interface DisruptionEvent {
  id: string;
  disruptionId: string;
  disruptionName: string;
  description: string;
  healthDamage: number;
  success: boolean;
  timestamp: string;
  reasoning: string;
}

export interface GameSession {
  gameId: string;
  browserSessionId: string;
  cdpUrl: string;
  liveViewUrl: string;
  task: Task;
  difficulty: Difficulty;
  attackerType: AttackerType;
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
}

export interface ClientGameState {
  phase: GamePhase;
  sessionId: string | null;
  liveViewUrl: string | null;
  task: Task | null;
  difficulty: Difficulty;
  mode: GameMode;
  attackerType: AttackerType;
  health: number;
  elapsedSeconds: number;
  attackerStatus: AttackerStatus;
  defenderStatus: DefenderStatus;
  attackerSteps: AgentEvent[];
  defenderDisruptions: DisruptionEvent[];
  winner: 'attacker' | 'defender' | null;
  winReason: string | null;
  lastHitAt: number;
  currentTurn: TurnOwner | null;
  turnNumber: number;
  attackerStepsThisTurn: number;
  attackerStepsPerTurn: number;
}
