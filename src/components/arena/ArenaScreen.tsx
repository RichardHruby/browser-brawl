'use client';

import { ArenaHeader } from './ArenaHeader';
import { AttackerPanel } from './AttackerPanel';
import { DefenderPanel } from './DefenderPanel';
import { BrowserFrame } from './BrowserFrame';
import { useArenaTimer } from '@/hooks/useArenaTimer';
import type { ClientGameState } from '@/types/game';

interface Props {
  state: ClientGameState;
  onAbort: () => void;
}

export function ArenaScreen({ state, onAbort }: Props) {
  const { formatted } = useArenaTimer(state.phase === 'arena');

  return (
    <div
      className="boxy-ui flex flex-col h-screen"
      style={{ background: 'var(--color-bg-deep)' }}
    >
      <ArenaHeader
        health={state.health}
        elapsed={formatted}
        task={state.task}
        onAbort={onAbort}
        mode={state.mode}
        currentTurn={state.currentTurn}
        turnNumber={state.turnNumber}
        attackerStepsThisTurn={state.attackerStepsThisTurn}
        attackerStepsPerTurn={state.attackerStepsPerTurn}
        difficulty={state.difficulty}
        attackerType={state.attackerType}
        defenderMode={state.defenderMode}
      />

      <main className="flex flex-1 gap-2 p-2 overflow-hidden min-h-0">
        <AttackerPanel
          steps={state.attackerSteps}
          status={state.attackerStatus}
          attackerType={state.attackerType}
        />
        <BrowserFrame
          liveViewUrl={state.liveViewUrl ?? ''}
          hitAt={state.lastHitAt}
        />
        <DefenderPanel
          disruptions={state.defenderDisruptions}
          steps={state.defenderSteps}
          status={state.defenderStatus}
          nextAttackIn={state.defenderNextAttackIn}
        />
      </main>
    </div>
  );
}
