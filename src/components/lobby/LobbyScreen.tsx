'use client';

import { LobbyScreenV1 } from './LobbyScreenV1';
import type { AttackerType, Difficulty, Task } from '@/types/game';

interface Props {
  onStart: (difficulty: Difficulty, task: Task, attackerType: AttackerType, modelUrl?: string) => void;
}

export function LobbyScreen({ onStart }: Props) {
  return <LobbyScreenV1 onStart={onStart} />;
}
