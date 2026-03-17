'use client';

import { HealthBar } from './HealthBar';
import { TurnIndicator } from './TurnIndicator';
import { DIFFICULTY_COLORS, ATTACKER_TYPE_LABELS, ATTACKER_TYPE_COLORS } from '@/lib/constants';
import type { Task, GameMode, TurnOwner, Difficulty, AttackerType } from '@/types/game';

interface Props {
  health: number;
  elapsed: string;
  task: Task | null;
  onAbort: () => void;
  mode: GameMode;
  currentTurn: TurnOwner | null;
  turnNumber: number;
  attackerStepsThisTurn: number;
  attackerStepsPerTurn: number;
  difficulty: Difficulty;
  attackerType: AttackerType;
  defenderMode: 'disruption' | 'hijack' | 'data_exfiltration' | null;
}

export function ArenaHeader({ health, elapsed, task, onAbort, mode, currentTurn, turnNumber, attackerStepsThisTurn, attackerStepsPerTurn, difficulty, attackerType, defenderMode }: Props) {
  const isTimeLimitMode = defenderMode === 'hijack' || defenderMode === 'data_exfiltration';
  const diffColor = DIFFICULTY_COLORS[difficulty];
  const attackerTypeColor = ATTACKER_TYPE_COLORS[attackerType];
  return (
    <div className="flex flex-col gap-1 shrink-0 px-4 py-2"
      style={{ borderBottom: '2px solid var(--color-border)', background: 'var(--color-bg-panel)' }}>

      {/* Top row: labels + timer + abort */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-display text-xs font-bold tracking-widest neon-cyan">
            ⚔ ATTACKER
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 border"
            style={{ color: attackerTypeColor, background: `${attackerTypeColor}1f`, borderColor: `${attackerTypeColor}88` }}>
            {ATTACKER_TYPE_LABELS[attackerType]}
          </span>
        </div>

        <div className="flex items-center gap-4">
          {task && (
            <span className="text-xs font-mono truncate max-w-xs"
              style={{ color: 'var(--color-text-secondary)' }}>
              {task.label}
            </span>
          )}
          <span className="font-display text-sm font-bold tabular-nums"
            style={{ color: 'var(--color-text-primary)' }}>
            ⏱ {elapsed}
          </span>
          <button
            onClick={onAbort}
            className="text-xs font-mono px-2 py-1 border transition-colors"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-secondary)',
            }}
          >
            ABORT
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-display text-xs font-bold tracking-widest neon-red">
            DEFENDER 🛡
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 border uppercase"
            style={{ color: diffColor, background: `${diffColor}18`, borderColor: `${diffColor}66` }}>
            {difficulty}
          </span>
        </div>
      </div>

      {/* Health bar — hidden for hijack/exfil (time-limit modes have no health) */}
      {!isTimeLimitMode && <HealthBar health={health} />}

      {/* Turn indicator (turn-based mode only) */}
      {mode === 'turnbased' && currentTurn && (
        <TurnIndicator
          currentTurn={currentTurn}
          turnNumber={turnNumber}
          stepsRemaining={attackerStepsPerTurn - attackerStepsThisTurn}
          stepsPerTurn={attackerStepsPerTurn}
        />
      )}
    </div>
  );
}
