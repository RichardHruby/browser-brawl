'use client';

import type { AttackerType } from '@/types/game';

const OPTIONS: { value: AttackerType; label: string; desc: string }[] = [
  {
    value: 'playwright-mcp',
    label: 'PLAYWRIGHT MCP',
    desc: 'Local agent via Claude + Playwright',
  },
  {
    value: 'browser-use',
    label: 'BROWSER-USE',
    desc: 'Cloud agent via browser-use API',
  },
];

const ATTACKER_COLOR = '#00d4ff';

interface Props {
  value: AttackerType;
  onChange: (t: AttackerType) => void;
}

export function AttackerTypeSelector({ value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-mono tracking-widest mb-1"
        style={{ color: 'var(--color-text-secondary)' }}>
        ATTACKER ENGINE
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
                borderColor: selected ? ATTACKER_COLOR : 'var(--color-border)',
                background: selected ? `${ATTACKER_COLOR}18` : 'var(--color-bg-card)',
                color: selected ? ATTACKER_COLOR : 'var(--color-text-secondary)',
                boxShadow: selected ? `0 0 12px ${ATTACKER_COLOR}44` : 'none',
              }}
            >
              <span>{opt.label}</span>
              <span className="text-xs font-game font-normal tracking-normal normal-case"
                style={{ color: selected ? ATTACKER_COLOR : 'var(--color-text-secondary)', opacity: 0.8 }}>
                {opt.desc}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
