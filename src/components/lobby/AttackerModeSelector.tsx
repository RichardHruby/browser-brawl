'use client';

import type { AttackerMode } from '@/types/game';

const OPTIONS: { value: AttackerMode; label: string; desc: string }[] = [
  { value: 'playwright', label: 'PLAYWRIGHT', desc: 'MCP tools + Anthropic loop' },
  { value: 'stagehand',  label: 'STAGEHAND',  desc: 'Browserbase AI agent' },
];

interface Props {
  value: AttackerMode;
  onChange: (m: AttackerMode) => void;
}

export function AttackerModeSelector({ value, onChange }: Props) {
  const color = '#00d4ff';
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-mono tracking-widest mb-1"
        style={{ color: 'var(--color-text-secondary)' }}>
        ATTACKER MODE
      </div>
      <div className="flex gap-3">
        {OPTIONS.map(opt => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className="flex-1 flex flex-col items-center gap-1 py-3 px-2 rounded border transition-all duration-200 font-display text-sm font-bold tracking-wider"
              style={{
                borderColor: selected ? color : 'var(--color-border)',
                background: selected ? `${color}18` : 'var(--color-bg-card)',
                color: selected ? color : 'var(--color-text-secondary)',
                boxShadow: selected ? `0 0 12px ${color}44` : 'none',
              }}
            >
              <span>{opt.label}</span>
              <span className="text-xs font-game font-normal tracking-normal normal-case"
                style={{ color: selected ? color : 'var(--color-text-secondary)', opacity: 0.8 }}>
                {opt.desc}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
