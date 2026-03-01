'use client';

import { useState } from 'react';
import Link from 'next/link';
import { GlitchText } from '@/components/shared/GlitchText';
import { BrandLogo } from '@/components/shared/BrandLogo';
import { FighterSelect } from './FighterSelect';
import { ArenaSelector } from './ArenaSelector';
import { DifficultyBar } from './DifficultyBar';
import { ModeToggle } from './ModeToggle';
import type { AttackerType, Difficulty, GameMode, Task } from '@/types/game';

interface Props {
  onStart: (difficulty: Difficulty, task: Task, mode: GameMode, attackerType: AttackerType) => void;
}

export function LobbyScreenV1({ onStart }: Props) {
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [task, setTask] = useState<Task | null>(null);
  const [mode, setMode] = useState<GameMode>('realtime');
  const [attackerType, setAttackerType] = useState<AttackerType>('playwright-mcp');

  const canStart = !!task;

  return (
    <div
      className="min-h-screen flex flex-col relative"
      style={{ background: 'var(--color-bg-deep)' }}
    >
      {/* CRT scanlines */}
      <div className="crt-overlay" style={{ position: 'fixed' }} />

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-start lg:justify-center px-4 sm:px-6 lg:px-8 py-8 lg:py-10">
        {/* Title */}
        <div className="text-center mb-6 lg:mb-10">
          <BrandLogo size="lg" />
        </div>

        {/* Two-column layout with VS divider */}
        <div className="w-full max-w-6xl flex flex-col lg:flex-row items-stretch gap-4 lg:gap-0">
          {/* Left Panel — Attacker / Fighter Select */}
          <div className="w-full flex-1 flex flex-col">
            <div
              className="flex-1 p-4 sm:p-6 flex flex-col"
              style={{
                background: 'var(--color-bg-panel)',
                border: '2px solid var(--color-border)',
              }}
            >
              <h2
                className="font-display text-sm font-bold tracking-[0.5em] uppercase text-center mb-4"
                style={{ color: 'var(--color-attacker)', textShadow: '0 0 12px var(--color-attacker)' }}
              >
                Choose Your Fighter
              </h2>
              <div className="flex-1 flex items-center justify-center">
                <FighterSelect value={attackerType} onChange={setAttackerType} />
              </div>
            </div>
          </div>

          {/* VS Divider */}
          <div className="flex items-center justify-center py-1 lg:py-0 lg:px-6">
            <div className="flex lg:flex-col items-center gap-3 w-full lg:w-auto">
              <div
                className="h-px flex-1 lg:flex-none lg:h-16 lg:w-px"
                style={{ background: 'var(--color-border)' }}
              />
              <div className="font-display text-4xl font-black tracking-wider">
                <GlitchText text="VS" className="neon-red" />
              </div>
              <div
                className="h-px flex-1 lg:flex-none lg:h-16 lg:w-px"
                style={{ background: 'var(--color-border)' }}
              />
            </div>
          </div>

          {/* Right Panel — Challenge */}
          <div className="w-full flex-1 flex flex-col">
            <div
              className="flex-1 p-4 sm:p-6 flex flex-col"
              style={{
                background: 'var(--color-bg-panel)',
                border: '2px solid var(--color-border)',
              }}
            >
              <h2
                className="font-display text-sm font-bold tracking-[0.5em] uppercase text-center mb-4"
                style={{ color: 'var(--color-defender)', textShadow: '0 0 12px var(--color-defender)' }}
              >
                Set Up the Challenge
              </h2>

              {/* Arena section */}
              <div className="flex flex-col gap-1 mb-2">
                <h3
                  className="font-display text-[11px] font-bold tracking-[0.3em] uppercase px-3"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  SELECT ARENA
                </h3>
                <div
                  className="w-full h-px"
                  style={{ background: 'var(--color-border)' }}
                />
                <ArenaSelector value={task} onChange={(nextTask) => setTask(nextTask)} />
              </div>

              {/* Difficulty section */}
              <div className="flex flex-col gap-1 mb-2">
                <h3
                  className="font-display text-[11px] font-bold tracking-[0.3em] uppercase px-3"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  DIFFICULTY
                </h3>
                <div
                  className="w-full h-px"
                  style={{ background: 'var(--color-border)' }}
                />
                <DifficultyBar value={difficulty} onChange={setDifficulty} />
              </div>

              {/* Mode section */}
              <div className="flex flex-col gap-1">
                <h3
                  className="font-display text-[11px] font-bold tracking-[0.3em] uppercase px-3"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  MODE
                </h3>
                <div
                  className="w-full h-px"
                  style={{ background: 'var(--color-border)' }}
                />
                <ModeToggle value={mode} onChange={setMode} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div
        className="w-full py-4"
        style={{
          background: 'var(--color-bg-panel)',
          borderTop: '2px solid var(--color-border)',
        }}
      >
        <div className="w-full max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-6 px-4">
          <Link
            href="/history"
            className="order-2 sm:order-1 font-mono text-[10px] tracking-wider transition-all duration-200 hover:underline"
            style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}
          >
            [ MATCH HISTORY ]
          </Link>

          <button
            onClick={() => task && onStart(difficulty, task, mode, attackerType)}
            disabled={!canStart}
            className="order-1 sm:order-2 w-full max-w-sm sm:w-auto px-6 sm:px-12 py-3 font-display text-base sm:text-lg font-black tracking-[0.2em] sm:tracking-[0.3em] uppercase transition-all duration-300 cursor-pointer disabled:cursor-not-allowed"
            style={{
              background: canStart
                ? 'linear-gradient(135deg, rgba(0,212,255,0.15), rgba(255,0,60,0.15))'
                : 'var(--color-bg-card)',
              border: canStart
                ? '2px solid var(--color-attacker)'
                : '2px solid var(--color-border)',
              color: canStart
                ? 'var(--color-text-primary)'
                : 'var(--color-text-secondary)',
              boxShadow: canStart
                ? '0 0 20px rgba(0,212,255,0.3), 0 0 40px rgba(255,0,60,0.15)'
                : 'none',
              opacity: canStart ? 1 : 0.3,
            }}
          >
            F I G H T
          </button>

          <span
            className="hidden sm:block order-3 font-mono text-[10px] tracking-wider select-none opacity-0"
            aria-hidden
          >
            [ MATCH HISTORY ]
          </span>
        </div>
      </div>
    </div>
  );
}
