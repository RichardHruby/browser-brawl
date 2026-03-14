'use client';

import { LobbyScreenV1 } from './LobbyScreenV1';
import type { AttackerType, Difficulty, GameMode, ModelId, ModelProvider, Task } from '@/types/game';

interface Props {
  onStart: (difficulty: Difficulty, task: Task, mode: GameMode, attackerType: AttackerType, modelUrl?: string, modelProvider?: ModelProvider, modelId?: ModelId) => void;
}

export function LobbyScreen({ onStart }: Props) {
  return <LobbyScreenV1 onStart={onStart} />;
}
