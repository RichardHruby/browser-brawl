'use client';

import type { DisruptionEvent } from '@/types/game';
import { DISRUPTION_ICONS } from '@/lib/constants';

interface Props {
  event: DisruptionEvent;
  isNew?: boolean;
}

export function DisruptionCard({ event, isNew }: Props) {
  return (
    <div
      className={`flex items-center gap-1.5 mb-1.5 px-2 py-1 rounded ${isNew ? 'animate-fade-in' : ''}`}
      style={{
        background: event.success ? 'rgba(255,0,60,0.1)' : 'rgba(255,255,255,0.03)',
        borderLeft: event.success
          ? '2px solid var(--color-defender)'
          : '2px solid var(--color-border)',
      }}
    >
      <span className="text-xs shrink-0">{DISRUPTION_ICONS[event.disruptionId] ?? '⚡'}</span>
      <span className="text-xs font-mono truncate"
        style={{ color: event.success ? 'var(--color-defender)' : 'var(--color-text-secondary)' }}>
        {event.disruptionName}
      </span>
      {event.success ? (
        <span className="shrink-0 text-[10px] font-mono font-bold ml-auto"
          style={{ color: 'var(--color-health-low)' }}>
          -{event.healthDamage}
        </span>
      ) : (
        <span className="shrink-0 text-[10px] font-mono ml-auto"
          style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }}>
          BLOCKED
        </span>
      )}
    </div>
  );
}
