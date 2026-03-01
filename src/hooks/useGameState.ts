'use client';

import { useReducer, useCallback } from 'react';
import type { ClientGameState, AttackerType, Difficulty, Task, AgentEvent, DisruptionEvent } from '@/types/game';
import type {
  SSEEnvelope,
  AttackerStepPayload,
  DefenderDisruptionPayload,
  HealthUpdatePayload,
  StatusUpdatePayload,
  GameOverPayload,
} from '@/types/events';

const initial: ClientGameState = {
  phase: 'lobby',
  sessionId: null,
  liveViewUrl: null,
  task: null,
  difficulty: 'easy',
  attackerType: 'playwright-mcp',
  health: 100,
  elapsedSeconds: 0,
  attackerStatus: 'idle',
  defenderStatus: 'idle',
  attackerSteps: [],
  defenderDisruptions: [],
  winner: null,
  winReason: null,
  lastHit: false,
};

type Action =
  | { type: 'START_LOADING'; difficulty: Difficulty; task: Task; attackerType: AttackerType }
  | { type: 'ARENA_READY'; sessionId: string; liveViewUrl: string }
  | { type: 'SSE_EVENT'; envelope: SSEEnvelope }
  | { type: 'RESET' };

function reducer(state: ClientGameState, action: Action): ClientGameState {
  switch (action.type) {
    case 'START_LOADING':
      return {
        ...initial,
        phase: 'loading',
        difficulty: action.difficulty,
        task: action.task,
        attackerType: action.attackerType,
      };

    case 'ARENA_READY':
      return {
        ...state,
        phase: 'arena',
        sessionId: action.sessionId,
        liveViewUrl: action.liveViewUrl,
      };

    case 'SSE_EVENT': {
      const { envelope } = action;
      switch (envelope.type) {
        case 'connection_established':
          return { ...state, phase: 'arena' };

        case 'attacker_step': {
          const p = envelope.payload as AttackerStepPayload;
          const newStep: AgentEvent = {
            id: `${Date.now()}`,
            step: p.step,
            description: p.description,
            timestamp: envelope.timestamp,
            agentStatus: p.agentStatus,
          };
          // Deduplicate by step number
          const existing = state.attackerSteps.find(s => s.step === p.step);
          if (existing) return state;
          return {
            ...state,
            attackerStatus: p.agentStatus,
            attackerSteps: [...state.attackerSteps, newStep],
          };
        }

        case 'defender_disruption': {
          const p = envelope.payload as DefenderDisruptionPayload;
          const newDisruption: DisruptionEvent = {
            id: `${Date.now()}`,
            disruptionId: p.disruptionId,
            disruptionName: p.disruptionName,
            description: p.description,
            healthDamage: p.healthDamage,
            success: p.success,
            timestamp: envelope.timestamp,
            reasoning: p.reasoning,
          };
          return {
            ...state,
            defenderStatus: 'striking',
            defenderDisruptions: [...state.defenderDisruptions, newDisruption],
            lastHit: true,
          };
        }

        case 'health_update': {
          const p = envelope.payload as HealthUpdatePayload;
          return { ...state, health: p.currentHealth, lastHit: false };
        }

        case 'status_update': {
          const p = envelope.payload as StatusUpdatePayload;
          return {
            ...state,
            attackerStatus: p.attackerStatus,
            defenderStatus: p.defenderStatus,
          };
        }

        case 'timer_tick': {
          return { ...state, elapsedSeconds: (envelope.payload as { elapsedSeconds: number }).elapsedSeconds };
        }

        case 'game_over': {
          const p = envelope.payload as GameOverPayload;
          return {
            ...state,
            phase: 'game_over',
            winner: p.winner,
            winReason: p.reason,
            health: p.finalHealth,
            elapsedSeconds: p.elapsedSeconds,
          };
        }

        case 'live_url_ready': {
          const p = envelope.payload as { liveUrl: string };
          return { ...state, liveViewUrl: p.liveUrl };
        }

        default:
          return state;
      }
    }

    case 'RESET':
      return initial;

    default:
      return state;
  }
}

export function useGameState() {
  const [state, dispatch] = useReducer(reducer, initial);

  const startGame = useCallback((difficulty: Difficulty, task: Task, attackerType: AttackerType) => {
    dispatch({ type: 'START_LOADING', difficulty, task, attackerType });
  }, []);

  const setArenaReady = useCallback((sessionId: string, liveViewUrl: string) => {
    dispatch({ type: 'ARENA_READY', sessionId, liveViewUrl });
  }, []);

  const handleSSEEvent = useCallback((envelope: SSEEnvelope) => {
    dispatch({ type: 'SSE_EVENT', envelope });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  return { state, startGame, setArenaReady, handleSSEEvent, reset };
}
