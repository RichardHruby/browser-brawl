'use client';

import type { GameMode } from '@/types/game';

const OPTIONS: { value: GameMode; label: string; color: string }[] = [
  { value: 'realtime',  label: 'REALTIME',   color: '#00d4ff' },
  { value: 'turnbased', label: 'TURN-BASED', color: '#cc44ff' },
];

interface Props {
  value: GameMode;
  onChange: (m: GameMode) => void;
}

export function ModeToggle({ value, onChange }: Props) {
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
              className="font-display text-[11px] font-bold tracking-wider"
              style={{
                color: selected ? opt.color : 'var(--color-text-secondary)',
                textShadow: selected ? `0 0 8px ${opt.color}` : 'none',
              }}
            >
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
