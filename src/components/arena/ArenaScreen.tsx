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
      className="flex flex-col h-screen"
      style={{ background: 'var(--color-bg-deep)' }}
    >
      <ArenaHeader
        health={state.health}
        elapsed={formatted}
        task={state.task}
        attackerStatus={state.attackerStatus}
        defenderStatus={state.defenderStatus}
        onAbort={onAbort}
        mode={state.mode}
        currentTurn={state.currentTurn}
        turnNumber={state.turnNumber}
        attackerStepsThisTurn={state.attackerStepsThisTurn}
        attackerStepsPerTurn={state.attackerStepsPerTurn}
        difficulty={state.difficulty}
        attackerType={state.attackerType}
      />

      <main className="flex flex-1 gap-2 p-2 overflow-hidden min-h-0">
        <AttackerPanel
          steps={state.attackerSteps}
          status={state.attackerStatus}
        />
        <BrowserFrame
          liveViewUrl={state.liveViewUrl ?? ''}
          hitAt={state.lastHitAt}
        />
        <DefenderPanel
          disruptions={state.defenderDisruptions}
          status={state.defenderStatus}
        />
      </main>
    </div>
  );
}
