'use client';

import { useState } from 'react';
import { GlitchText } from '@/components/shared/GlitchText';
import { AttackerTypeSelector } from './AttackerTypeSelector';
import { DifficultySelector } from './DifficultySelector';
import { TaskSelector } from './TaskSelector';
import { StartButton } from './StartButton';
import type { AttackerType, Difficulty, Task } from '@/types/game';

interface Props {
  onStart: (difficulty: Difficulty, task: Task, attackerType: AttackerType) => void;
}

export function LobbyScreen({ onStart }: Props) {
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [task, setTask] = useState<Task | null>(null);
  const [attackerType, setAttackerType] = useState<AttackerType>('playwright-mcp');

  const canStart = !!task;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-12 overflow-y-auto"
      style={{ background: 'var(--color-bg-deep)' }}
    >
      {/* Title */}
      <div className="text-center mb-10">
        <h1 className="font-display text-6xl font-black tracking-widest mb-3 relative">
          <GlitchText text="BROWSER BRAWL" className="neon-cyan" />
        </h1>
        <p className="font-game text-lg tracking-[0.4em] uppercase"
          style={{ color: 'var(--color-text-secondary)' }}>
          Man vs Machine
        </p>
        <div className="mt-4 flex justify-center gap-6 text-sm font-mono"
          style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }}>
          <span className="neon-cyan">⚔ AI ATTACKER</span>
          <span>vs</span>
          <span className="neon-red">🛡 AI DEFENDER</span>
        </div>
      </div>

      {/* Config card */}
      <div
        className="w-full max-w-2xl rounded-xl p-8 flex flex-col gap-8"
        style={{
          background: 'var(--color-bg-panel)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 0 40px rgba(0,212,255,0.05), 0 0 40px rgba(255,0,60,0.05)',
        }}
      >
        <TaskSelector value={task} onChange={setTask} />
        <AttackerTypeSelector value={attackerType} onChange={setAttackerType} />
        <DifficultySelector value={difficulty} onChange={setDifficulty} />

        {/* Info row */}
        <div className="flex gap-6 text-xs font-mono"
          style={{ color: 'var(--color-text-secondary)' }}>
          <span>Attacker: <span className="neon-cyan">{attackerType === 'browser-use' ? 'browser-use cloud' : 'Playwright MCP'}</span></span>
          <span>Defender: <span className="neon-red">Claude AI</span></span>
          <span>Session: <span style={{ color: 'var(--color-text-primary)' }}>browser-use</span></span>
        </div>

        <StartButton onClick={() => task && onStart(difficulty, task, attackerType)} disabled={!canStart} />
      </div>

      {/* Footer */}
      <div className="mt-8 text-xs font-mono text-center"
        style={{ color: 'var(--color-text-secondary)', opacity: 0.4 }}>
        An AI agent will attempt your task · A defender agent will try to stop it
      </div>
    </div>
  );
}
