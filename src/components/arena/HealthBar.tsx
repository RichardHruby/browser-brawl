'use client';

import { useHealthBar } from '@/hooks/useHealthBar';

interface Props {
  health: number;
  variant?: 'arena' | 'static';
}

export function HealthBar({ health, variant = 'arena' }: Props) {
  const { shaking, color, isCritical } = useHealthBar(health);
  const isStatic = variant === 'static';

  if (isStatic) {
    return (
      <div className="flex items-center gap-3 flex-1">
        <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'var(--color-bg-card)' }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.max(0, health)}%`,
              background: color,
              transition: 'width 600ms ease, background 600ms ease',
            }}
          />
        </div>
        <span className="font-mono text-xs" style={{ color: 'var(--color-text-primary)' }}>
          {Math.round(health)}%
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 flex-1 px-4">
      <div className="flex justify-between items-center mb-0.5">
        <span className="text-xs font-mono tracking-widest"
          style={{ color: 'var(--color-text-secondary)' }}>
          HP
        </span>
        <span className="text-xs font-mono font-bold"
          style={{ color }}>
          {Math.ceil(health)}%
        </span>
      </div>
      <div
        className={`relative h-5 rounded overflow-hidden ${shaking ? 'animate-bar-shake' : ''}`}
        style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
      >
        {/* Segment markers */}
        {[25, 50, 75].map(pct => (
          <div
            key={pct}
            className="absolute top-0 bottom-0 w-px z-10"
            style={{ left: `${pct}%`, background: 'var(--color-bg-deep)', opacity: 0.6 }}
          />
        ))}

        {/* Bar fill */}
        <div
          className={isCritical ? 'animate-health-flicker' : ''}
          style={{
            width: `${Math.max(0, health)}%`,
            height: '100%',
            background: `linear-gradient(90deg, ${color}cc, ${color})`,
            boxShadow: `0 0 8px ${color}88`,
            transition: 'width 600ms ease, background 600ms ease',
          }}
        />
      </div>
    </div>
  );
}
