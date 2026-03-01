'use client';

import type { GameMode } from '@/types/game';

const OPTIONS: { value: GameMode; label: string; color: string; tooltip: string }[] = [
  { value: 'realtime',  label: 'REALTIME',   color: '#00d4ff', tooltip: 'Both agents run simultaneously — defender fires disruptions on a timer while the attacker works.' },
  { value: 'turnbased', label: 'TURN-BASED', color: '#cc44ff', tooltip: 'Attacker takes N steps, then the defender strikes — structured back-and-forth.' },
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
          <div key={opt.value} className="relative group">
            <button
              onClick={() => onChange(opt.value)}
              className="w-full flex items-center gap-3 py-2 px-3 transition-all duration-150 cursor-pointer text-left"
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
            {/* Tooltip */}
            <div
              className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-50 w-56 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-center"
              style={{ background: 'var(--color-bg-deep)', border: `1px solid ${opt.color}`, color: 'var(--color-text-secondary)' }}
            >
              {opt.tooltip}
            </div>
          </div>
        );
      })}
    </div>
  );
}
