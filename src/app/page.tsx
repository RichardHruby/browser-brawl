'use client';

import { LobbyScreen } from '@/components/lobby/LobbyScreen';
import { LoadingArena } from '@/components/shared/LoadingArena';
import { WinnerBanner } from '@/components/end/WinnerBanner';
import { useGameState } from '@/hooks/useGameState';
import { useGameSSE } from '@/hooks/useGameSSE';
import { ArenaScreen } from '@/components/arena/ArenaScreen';
import type { AttackerType, Difficulty, GameMode, ModelId, ModelProvider, Task } from '@/types/game';
import type { DefenderConfigState } from '@/components/lobby/DefenderConfig';
import { DEFAULT_SYSTEM_PROMPTS, DEFAULT_HIJACK_TARGET, DEFAULT_SECRETS } from '@/components/lobby/DefenderConfig';

export default function Home() {
  const { state, startGame, setArenaReady, handleSSEEvent, reset } = useGameState();

  useGameSSE(
    state.phase === 'arena' || state.phase === 'game_over' ? state.sessionId : null,
    handleSSEEvent
  );

  async function handleStart(difficulty: Difficulty, task: Task, mode: GameMode, attackerType: AttackerType, modelUrl?: string, modelProvider?: ModelProvider, modelId?: ModelId, defenderConfig?: DefenderConfigState) {
    startGame(difficulty, task, mode, attackerType);
    try {
      const res = await fetch('/api/game/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id,
          difficulty,
          mode,
          attackerType,
          modelUrl,
          modelProvider,
          modelId,
          customTask: task.id === 'custom' ? task.description : undefined,
          ...(defenderConfig?.mode && {
            defenderMode: defenderConfig.mode,
            defenderSystemPrompt: defenderConfig.systemPrompt.trim() || DEFAULT_SYSTEM_PROMPTS[defenderConfig.mode],
            defenderHijackTarget: defenderConfig.mode === 'hijack'
              ? (defenderConfig.hijackTarget.trim() || DEFAULT_HIJACK_TARGET)
              : undefined,
            agentSecrets: defenderConfig.mode === 'data_exfiltration'
              ? (() => {
                  const filled = defenderConfig.secrets.filter(s => s.key.trim());
                  const effective = filled.length > 0 ? filled : DEFAULT_SECRETS;
                  return Object.fromEntries(effective.map(s => [s.key.trim(), s.value]));
                })()
              : undefined,
          }),
        }),
      });
      if (!res.ok) throw new Error('Failed to start game');
      const { sessionId, liveViewUrl } = await res.json();
      setArenaReady(sessionId, liveViewUrl);
    } catch (err) {
      console.error(err);
      reset();
    }
  }

  async function handleAbort() {
    if (state.sessionId) {
      await fetch(`/api/game/${state.sessionId}/abort`, { method: 'POST' });
    }
    reset();
  }

  if (state.phase === 'lobby') {
    return <LobbyScreen onStart={handleStart} />;
  }

  if (state.phase === 'loading') {
    return <LoadingArena />;
  }

  if (state.phase === 'arena') {
    return <ArenaScreen state={state} onAbort={handleAbort} />;
  }

  if (state.phase === 'game_over' && state.winner) {
    return (
      <>
        <ArenaScreen state={state} onAbort={() => {}} />
        <WinnerBanner winner={state.winner} reason={state.winReason} sessionId={state.sessionId} onPlayAgain={reset} />
      </>
    );
  }

  return <LobbyScreen onStart={handleStart} />;
}
