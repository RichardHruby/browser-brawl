'use client';

import { useState } from 'react';
import Link from 'next/link';
import { GlitchText } from '@/components/shared/GlitchText';
import { FighterSelect } from './FighterSelect';
import { ArenaSelector } from './ArenaSelector';
import { DifficultyBar } from './DifficultyBar';
import { ModeToggle } from './ModeToggle';
import type { AttackerType, Difficulty, GameMode, Task } from '@/types/game';

interface Props {
  onStart: (difficulty: Difficulty, task: Task, mode: GameMode, attackerType: AttackerType, modelUrl?: string) => void;
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

      {/* GitHub badge — fixed top-right corner */}
      <a
        href="https://github.com/RichardHruby/browser-brawl"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed top-4 right-4 z-20 flex items-center gap-2 font-display text-xs font-bold tracking-widest uppercase px-3 py-1.5 transition-all duration-200 hover:scale-105"
        style={{
          color: 'var(--color-attacker)',
          background: 'var(--color-bg-panel)',
          border: '2px solid var(--color-attacker)',
          textShadow: '0 0 8px var(--color-attacker)',
        }}
      >
        <svg height="14" viewBox="0 0 16 16" width="14" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
        GitHub
      </a>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-start lg:justify-center px-4 sm:px-6 lg:px-8 py-8 lg:py-10">
        {/* Title */}
        <div className="text-center mb-6 lg:mb-10">
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-black tracking-[0.15em] sm:tracking-[0.2em] lg:tracking-widest mb-3 relative">
            <GlitchText text="BROWSER BRAWL" className="neon-cyan" />
          </h1>
          <p className="font-mono text-xs sm:text-sm" style={{ color: 'var(--color-text-secondary)', opacity: 0.7 }}>
            Two AI agents battle on live websites — one completes tasks, the other sabotages the DOM, you train on the data.
          </p>
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
              <div
                className="flex-1 flex items-center justify-center transition-all duration-300"
              >
                <FighterSelect value={attackerType} onChange={setAttackerType} />
              </div>

              {/* Bring Your Own Model — links to waitlist */}
              <div
                className="mt-4 pt-3"
                style={{ borderTop: '1px solid var(--color-border)' }}
              >
                <Link
                  href="/waitlist"
                  className="flex items-center gap-2 w-full group"
                >
                  <div
                    className="w-4 h-4 flex items-center justify-center flex-shrink-0"
                    style={{ border: '2px solid var(--color-border)' }}
                  />
                  <span
                    className="font-display text-[11px] font-bold tracking-[0.3em] uppercase transition-colors duration-200 group-hover:underline"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    BRING YOUR OWN MODEL
                  </span>
                </Link>
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

      {/* Bottom bar — sticky */}
      <div
        className="sticky bottom-0 z-10 w-full py-4"
        style={{
          background: 'var(--color-bg-panel)',
          borderTop: '2px solid var(--color-border)',
        }}
      >
        <div className="w-full max-w-6xl mx-auto flex flex-col sm:flex-row items-center gap-4 sm:gap-6 px-4">
          <div className="order-2 sm:order-1 flex gap-4 sm:flex-1">
            <Link
              href="/history"
              className="font-mono text-sm tracking-widest font-bold transition-all duration-200 hover:underline"
              style={{ color: 'var(--color-attacker)' }}
            >
              [ PRIOR TRACES ]
            </Link>
            <Link
              href="/waitlist"
              className="font-mono text-sm tracking-widest font-bold transition-all duration-200 hover:underline"
              style={{ color: '#cc44ff', opacity: 0.6 }}
            >
              [ FINE TUNING RUNS ]
            </Link>
          </div>

          <div className="hidden sm:block sm:w-12 lg:w-24 shrink-0" aria-hidden />

          <div className="order-1 sm:order-2 w-full max-w-sm sm:max-w-none sm:flex-1 flex justify-center">
            <button
              onClick={() => task && onStart(difficulty, task, mode, attackerType)}
              disabled={!canStart}
              className="w-full max-w-sm sm:w-auto px-6 sm:px-12 py-3 font-display text-base sm:text-lg font-black tracking-[0.2em] sm:tracking-[0.3em] uppercase transition-all duration-300 cursor-pointer disabled:cursor-not-allowed"
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
          </div>
        </div>
      </div>
    </div>
  );
}
