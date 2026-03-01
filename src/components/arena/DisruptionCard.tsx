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
      className={`px-3 py-2 rounded border mb-2 ${isNew ? 'animate-slide-right' : ''}`}
      style={{
        background: event.success ? 'rgba(255,0,60,0.08)' : 'var(--color-bg-card)',
        borderColor: event.success ? 'var(--color-defender-border)' : 'var(--color-border)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base">{DISRUPTION_ICONS[event.disruptionId] ?? '⚡'}</span>
          <div>
            <div className="text-xs font-game font-semibold tracking-wide"
              style={{ color: event.success ? 'var(--color-defender)' : 'var(--color-text-secondary)' }}>
              {event.disruptionName}
            </div>
            {event.reasoning && (
              <div className="text-xs font-mono mt-0.5 opacity-60 leading-tight"
                style={{ color: 'var(--color-text-secondary)' }}>
                {event.reasoning}
              </div>
            )}
          </div>
        </div>
        {event.success && (
          <span className="shrink-0 text-xs font-mono font-bold"
            style={{ color: 'var(--color-health-low)' }}>
            -{event.healthDamage} HP
          </span>
        )}
      </div>
    </div>
  );
}
