'use client';

import { useState } from 'react';
import Link from 'next/link';
import { GlitchText } from '@/components/shared/GlitchText';
import { AttackerTypeSelector } from './AttackerTypeSelector';
import { DifficultySelector } from './DifficultySelector';
import { ModeSelector } from './ModeSelector';
import { TaskSelector } from './TaskSelector';
import { StartButton } from './StartButton';
import type { AttackerType, Difficulty, GameMode, Task } from '@/types/game';

interface Props {
  onStart: (difficulty: Difficulty, task: Task, mode: GameMode, attackerType: AttackerType) => void;
}

function attackerLabel(attackerType: AttackerType): string {
  switch (attackerType) {
    case 'browser-use':
      return 'browser-use cloud';
    case 'stagehand':
      return 'Stagehand';
    default:
      return 'Playwright MCP';
  }
}

export function LobbyScreen({ onStart }: Props) {
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [task, setTask] = useState<Task | null>(null);
  const [mode, setMode] = useState<GameMode>('realtime');
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
        <ModeSelector value={mode} onChange={setMode} />
        <AttackerTypeSelector value={attackerType} onChange={setAttackerType} />
        <DifficultySelector value={difficulty} onChange={setDifficulty} />

        {/* Info row */}
        <div className="flex gap-6 text-xs font-mono"
          style={{ color: 'var(--color-text-secondary)' }}>
          <span>Attacker: <span className="neon-cyan">{attackerLabel(attackerType)}</span></span>
          <span>Defender: <span className="neon-red">Claude AI</span></span>
          <span>Session: <span style={{ color: 'var(--color-text-primary)' }}>browser-use</span></span>
        </div>

        <div className="flex gap-3">
          <StartButton onClick={() => task && onStart(difficulty, task, mode, attackerType)} disabled={!canStart} />
          <Link
            href="/history"
            className="flex-shrink-0 px-5 py-3 rounded font-display text-sm font-bold tracking-widest uppercase transition-all duration-200 hover:scale-105 flex items-center"
            style={{
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)',
            }}
          >
            History
          </Link>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 text-xs font-mono"
        style={{ color: 'var(--color-text-secondary)', opacity: 0.4 }}>
        <span>An AI agent will attempt your task · A defender agent will try to stop it</span>
      </div>
    </div>
  );
}
