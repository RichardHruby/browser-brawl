'use client';

import type { TurnOwner } from '@/types/game';

interface Props {
  currentTurn: TurnOwner;
  turnNumber: number;
  stepsRemaining: number;
  stepsPerTurn: number;
}

export function TurnIndicator({ currentTurn, turnNumber, stepsRemaining, stepsPerTurn }: Props) {
  const isAttacker = currentTurn === 'attacker';
  const color = isAttacker ? 'var(--color-attacker)' : 'var(--color-defender)';
  const label = isAttacker ? 'ATTACKER' : 'DEFENDER';
  const icon = isAttacker ? '⚔' : '🛡';
  const bgColor = isAttacker ? 'var(--color-attacker-dim)' : 'var(--color-defender-dim)';
  const borderColor = isAttacker ? 'var(--color-attacker-border)' : 'var(--color-defender-border)';

  return (
    <div
      className="flex items-center justify-center gap-3 py-1.5 px-4 font-display text-xs font-bold tracking-widest"
      style={{
        background: bgColor,
        borderTop: `1px solid ${borderColor}`,
        borderBottom: `1px solid ${borderColor}`,
        color,
      }}
    >
      <span>TURN {turnNumber}</span>
      <span style={{ opacity: 0.4 }}>|</span>
      <span>{icon} {label}&apos;S TURN</span>
      {isAttacker && (
        <>
          <span style={{ opacity: 0.4 }}>|</span>
          <span className="font-mono text-xs">
            {stepsRemaining}/{stepsPerTurn} steps left
          </span>
        </>
      )}
    </div>
  );
}
