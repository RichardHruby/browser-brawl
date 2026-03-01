'use client';

import { BrandLogo } from './BrandLogo';

export function LoadingArena() {
  return (
    <div className="fixed inset-0 boxy-ui flex flex-col items-center justify-center gap-8 px-6"
      style={{ background: 'var(--color-bg-deep)' }}>
      <BrandLogo size="md" />
      <div
        className="w-full max-w-xl px-6 py-6 text-center"
        style={{
          background: 'var(--color-bg-panel)',
          border: '2px solid var(--color-border)',
        }}
      >
        <div className="font-display text-sm font-bold tracking-[0.35em] uppercase mb-4 neon-cyan">
          Entering The Arena
        </div>
        <div className="flex justify-center gap-2 mb-4">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-3 h-3"
              style={{
                background: i % 2 === 0 ? 'var(--color-attacker)' : 'var(--color-defender)',
                animation: 'healthFlicker 0.8s ease-in-out infinite',
                animationDelay: `${i * 0.25}s`,
              }}
            />
          ))}
        </div>
        <div className="text-xs font-mono tracking-wider uppercase" style={{ color: 'var(--color-text-secondary)' }}>
          Spawning Browser Session...
        </div>
      </div>
    </div>
  );
}
