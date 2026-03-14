'use client';

import type { DisruptionEvent } from '@/types/game';
import { DISRUPTION_ICONS } from '@/lib/constants';

const FAMILY_COLORS: Record<string, string> = {
  prompt_injection: '#cc44ff',
  ui_breakage: '#ffaa00',
  phishing: '#ff6600',
  availability: '#ff003c',
};

const VERDICT_COLORS: Record<string, string> = {
  followed: '#00ff88',
  ignored: '#6e6e99',
  partial: '#ffaa00',
};

interface Props {
  event: DisruptionEvent;
  isNew?: boolean;
}

export function DisruptionCard({ event, isNew }: Props) {
  const hasLabels = !!event.attackFamily;
  const isSpecMode = hasLabels && event.healthDamage === 0;

  return (
    <div
      className={`mb-1.5 px-2 py-1 rounded ${isNew ? 'animate-fade-in' : ''}`}
      style={{
        background: event.success ? 'rgba(255,0,60,0.1)' : 'rgba(255,255,255,0.03)',
        borderLeft: event.success
          ? '2px solid var(--color-defender)'
          : '2px solid var(--color-border)',
      }}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-xs shrink-0">{DISRUPTION_ICONS[event.disruptionId] ?? '⚡'}</span>
        <span className="text-xs font-mono truncate"
          style={{ color: event.success ? 'var(--color-defender)' : 'var(--color-text-secondary)' }}>
          {event.disruptionName}
        </span>
        {isSpecMode ? (
          event.success && (
            <span className="shrink-0 text-[10px] font-mono font-bold ml-auto"
              style={{ color: 'var(--color-defender)' }}>
              INJECTED
            </span>
          )
        ) : event.success ? (
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
      {hasLabels && (
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          <span className="text-[9px] font-mono px-1 py-px rounded"
            style={{
              color: FAMILY_COLORS[event.attackFamily!] ?? '#6e6e99',
              background: `${FAMILY_COLORS[event.attackFamily!] ?? '#6e6e99'}18`,
            }}>
            {event.attackFamily!.replace('_', ' ')}
          </span>
          <span className="text-[9px] font-mono px-1 py-px rounded"
            style={{ color: 'var(--color-text-secondary)', background: 'rgba(255,255,255,0.05)' }}>
            {event.objective}
          </span>
          {event.agentResponse && (
            <span className="text-[9px] font-mono px-1 py-px rounded ml-auto"
              style={{
                color: VERDICT_COLORS[event.agentResponse] ?? '#6e6e99',
                background: `${VERDICT_COLORS[event.agentResponse] ?? '#6e6e99'}18`,
              }}>
              {event.agentResponse}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
