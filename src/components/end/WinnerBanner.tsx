'use client';

import Link from 'next/link';
import { REASON_LABELS } from '@/lib/constants';
import { BrandLogo } from '@/components/shared/BrandLogo';

interface Props {
  winner: 'attacker' | 'defender';
  reason: string | null;
  sessionId?: string | null;
  onPlayAgain: () => void;
}

export function WinnerBanner({ winner, reason, sessionId, onPlayAgain }: Props) {
  const isAttacker = winner === 'attacker';
  // Raw hex (not CSS var) because color is used with hex opacity suffixes below
  const color = isAttacker ? '#00d4ff' : '#ff003c';
  const label = isAttacker ? 'ATTACKER WINS' : 'DEFENDER WINS';
  const reasonText = reason ? (REASON_LABELS[reason] ?? reason) : '';

  return (
    <div
      className="fixed inset-0 boxy-ui flex flex-col items-center justify-center gap-8 animate-fade-in px-6"
      style={{ background: 'rgba(5,5,8,0.97)' }}
    >
      <BrandLogo size="sm" />

      {/* Winner text */}
      <div
        className="font-display text-5xl sm:text-7xl font-black tracking-widest text-center animate-winner px-6 py-4"
        style={{
          color,
          background: 'var(--color-bg-panel)',
          border: `2px solid ${color}`,
          textShadow: `0 0 40px ${color}, 0 0 80px ${color}44`,
        }}
      >
        {label}
      </div>

      {/* Reason */}
      {reasonText && (
        <div
          className="font-game text-xl tracking-widest uppercase"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {reasonText}
        </div>
      )}

      {/* Divider */}
      <div
        className="w-64 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
      />

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-4">
        <button
          onClick={onPlayAgain}
          className="px-12 py-4 font-display text-xl font-bold tracking-widest transition-all duration-200 hover:scale-105"
          style={{
            background: `${color}18`,
            border: `2px solid ${color}`,
            color,
            boxShadow: `0 0 20px ${color}44`,
          }}
        >
          PLAY AGAIN
        </button>
        {sessionId && (
          <Link
            href={`/history/${sessionId}`}
            className="px-8 py-4 font-display text-xl font-bold tracking-widest transition-all duration-200 hover:scale-105 flex items-center"
            style={{
              background: 'var(--color-bg-card)',
              border: '2px solid var(--color-border)',
              color: 'var(--color-text-secondary)',
            }}
          >
            VIEW REPLAY
          </Link>
        )}
      </div>
    </div>
  );
}
