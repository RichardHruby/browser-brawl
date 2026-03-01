'use client';

import { LobbyScreenV1 } from './LobbyScreenV1';
import type { AttackerType, Difficulty, GameMode, Task } from '@/types/game';

interface Props {
  onStart: (difficulty: Difficulty, task: Task, mode: GameMode, attackerType: AttackerType) => void;
}

export function LobbyScreen({ onStart }: Props) {
  return <LobbyScreenV1 onStart={onStart} />;
}
