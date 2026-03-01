'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import type { AttackerType } from '@/types/game';

interface Fighter {
  value: AttackerType;
  name: string;
  image: string;
  color: string;
  desc: string;
  stats: { label: string; value: number; max: number }[];
}

const FIGHTERS: Fighter[] = [
  {
    value: 'playwright-mcp',
    name: 'PLAYWRIGHT MCP',
    image: '/fighters/playwright-mcp.jpg',
    color: '#cc2244',
    desc: 'The Director — scripts every move with surgical precision via local Playwright automation.',
    stats: [
      { label: 'SPD', value: 4, max: 6 },
      { label: 'PRC', value: 5, max: 6 },
      { label: 'RES', value: 3, max: 6 },
    ],
  },
  {
    value: 'browser-use',
    name: 'BROWSER-USE',
    image: '/fighters/browser-use.jpg',
    color: '#dd8800',
    desc: 'The Cloud Phantom — materializes from remote infrastructure, resilient and managed.',
    stats: [
      { label: 'SPD', value: 3, max: 6 },
      { label: 'PRC', value: 4, max: 6 },
      { label: 'RES', value: 5, max: 6 },
    ],
  },
  {
    value: 'stagehand',
    name: 'STAGEHAND',
    image: '/fighters/stagehand.jpg',
    color: '#ccaa00',
    desc: 'The Naturalist — reads the battlefield by instinct, fast and adaptive.',
    stats: [
      { label: 'SPD', value: 5, max: 6 },
      { label: 'PRC', value: 3, max: 6 },
      { label: 'RES', value: 4, max: 6 },
    ],
  },
];

function StatBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-mono tracking-wider w-8" style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </span>
      <div className="flex gap-[3px]">
        {Array.from({ length: max }).map((_, i) => (
          <div
            key={i}
            className="h-[10px] w-[14px] transition-all duration-300"
            style={{
              background: i < value ? color : 'var(--color-bg-deep)',
              boxShadow: i < value ? `0 0 4px ${color}` : 'none',
              border: `1px solid ${i < value ? color : 'var(--color-border)'}`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

interface Props {
  value: AttackerType;
  onChange: (t: AttackerType) => void;
}

export function FighterSelect({ value, onChange }: Props) {
  const selected = FIGHTERS.find(f => f.value === value) ?? FIGHTERS[0];

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const idx = FIGHTERS.findIndex(f => f.value === value);
      const next = e.key === 'ArrowLeft'
        ? (idx - 1 + FIGHTERS.length) % FIGHTERS.length
        : (idx + 1) % FIGHTERS.length;
      onChange(FIGHTERS[next].value);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [value, onChange]);

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      {/* Fighter portraits */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 justify-items-center w-full">
        {FIGHTERS.map((fighter) => {
          const isSelected = value === fighter.value;
          return (
            <button
              key={fighter.value}
              onClick={() => onChange(fighter.value)}
              className="group relative flex flex-col items-center gap-2 transition-all duration-300 cursor-pointer w-full max-w-[160px]"
              style={{
                transform: isSelected ? 'scale(1.08)' : 'scale(0.95)',
                opacity: isSelected ? 1 : 0.55,
                filter: isSelected ? 'none' : 'grayscale(0.5) brightness(0.7)',
              }}
            >
              {/* Portrait frame */}
              <div
                className="relative overflow-hidden transition-all duration-300 w-full max-w-[160px] aspect-[16/21]"
                style={{
                  border: isSelected ? `3px solid ${fighter.color}` : '3px solid var(--color-border)',
                  boxShadow: isSelected
                    ? `0 0 20px ${fighter.color}, 0 0 40px ${fighter.color}33, inset 0 0 15px ${fighter.color}1a`
                    : 'none',
                  background: 'var(--color-bg-deep)',
                }}
              >
                <Image
                  src={fighter.image}
                  alt={fighter.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 639px) 110px, (max-width: 767px) 130px, 160px"
                />
                {/* CRT overlay on portrait */}
                <div className="crt-overlay" />
                {/* Selection glow overlay — tinted to fighter color */}
                {isSelected && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: `linear-gradient(to top, ${fighter.color}25, transparent 50%)`,
                    }}
                  />
                )}
              </div>

              {/* Fighter name below portrait */}
              <span
                className="font-display text-xs font-bold tracking-widest transition-all duration-300"
                style={{
                  color: isSelected ? fighter.color : 'var(--color-text-secondary)',
                  textShadow: isSelected ? `0 0 8px ${fighter.color}` : 'none',
                }}
              >
                {fighter.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected fighter stats panel */}
      <div
        className="w-full max-w-md px-4 sm:px-5 py-4 transition-all duration-300"
        style={{
          background: `linear-gradient(135deg, ${selected.color}0d, var(--color-bg-panel) 40%)`,
          border: '1px solid var(--color-border)',
          borderTop: `2px solid ${selected.color}`,
          boxShadow: `0 -4px 20px ${selected.color}15`,
        }}
      >
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4 min-h-[7.5rem]">
          <div className="flex flex-col gap-2 flex-1 min-h-[4.75rem]">
            <span
              className="font-display text-base font-bold tracking-wider"
              style={{ color: selected.color, textShadow: `0 0 6px ${selected.color}` }}
            >
              {selected.name}
            </span>
            <p className="text-xs font-game leading-relaxed min-h-[3.75rem]" style={{ color: 'var(--color-text-secondary)' }}>
              {selected.desc}
            </p>
          </div>
          <div className="flex flex-col gap-[6px] flex-shrink-0">
            {selected.stats.map((stat) => (
              <StatBar key={stat.label} color={selected.color} {...stat} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
