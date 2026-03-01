'use client';

import type { Difficulty } from '@/types/game';

const OPTIONS: { value: Difficulty; label: string; blocks: number; color: string }[] = [
  { value: 'easy',      label: 'EASY',      blocks: 2, color: '#00ff88' },
  { value: 'medium',    label: 'MEDIUM',    blocks: 4, color: '#ffaa00' },
  { value: 'hard',      label: 'HARD',      blocks: 6, color: '#ff6600' },
  { value: 'nightmare', label: 'NIGHTMARE', blocks: 8, color: '#ff003c' },
];

const MAX_BLOCKS = 8;

function BlockMeter({ filled, max, color, active }: { filled: number; max: number; color: string; active: boolean }) {
  return (
    <div className="flex gap-[2px]">
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          className="h-[8px] w-[8px] transition-all duration-200"
          style={{
            background: i < filled ? (active ? color : 'var(--color-text-secondary)') : 'var(--color-bg-deep)',
            boxShadow: i < filled && active ? `0 0 4px ${color}` : 'none',
            border: `1px solid ${i < filled ? (active ? color : 'var(--color-text-secondary)') : 'var(--color-border)'}`,
            opacity: active ? 1 : 0.4,
          }}
        />
      ))}
    </div>
  );
}

interface Props {
  value: Difficulty;
  onChange: (d: Difficulty) => void;
}

export function DifficultyBar({ value, onChange }: Props) {
  return (
    <div className="flex flex-col">
      {OPTIONS.map(opt => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className="flex items-center gap-3 py-2 px-3 transition-all duration-150 cursor-pointer text-left"
            style={{
              background: selected ? `${opt.color}12` : 'transparent',
              borderLeft: selected ? `2px solid ${opt.color}` : '2px solid transparent',
            }}
          >
            <span
              className="font-display text-xs w-3 flex-shrink-0"
              style={{ color: selected ? opt.color : 'transparent' }}
            >
              ▶
            </span>
            <span
              className="font-display text-[11px] font-bold tracking-wider w-24 flex-shrink-0"
              style={{
                color: selected ? opt.color : 'var(--color-text-secondary)',
                textShadow: selected ? `0 0 8px ${opt.color}` : 'none',
              }}
            >
              {opt.label}
            </span>
            <BlockMeter filled={opt.blocks} max={MAX_BLOCKS} color={opt.color} active={selected} />
          </button>
        );
      })}
    </div>
  );
}
