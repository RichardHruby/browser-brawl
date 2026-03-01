'use client';

import { useRef, useEffect } from 'react';
import type { DisruptionEvent, DefenderStatus } from '@/types/game';
import { DisruptionCard } from './DisruptionCard';
import { DEFENDER_STATUS_LABELS, DEFENDER_STATUS_COLORS } from '@/lib/constants';

interface Props {
  disruptions: DisruptionEvent[];
  status: DefenderStatus;
}

export function DefenderPanel({ disruptions, status }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [disruptions.length]);

  return (
    <div className="flex flex-col h-full w-72 shrink-0 rounded overflow-hidden"
      style={{ border: '2px solid var(--color-defender-border)', background: 'var(--color-bg-panel)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: '2px solid var(--color-defender-dim)' }}>
        <span className="font-display text-sm font-bold tracking-widest neon-red">
          DEFENDER
        </span>
        <span
          className="text-xs font-mono px-2 py-0.5 rounded"
          style={{
            color: DEFENDER_STATUS_COLORS[status],
            background: `${DEFENDER_STATUS_COLORS[status]}22`,
            border: `1px solid ${DEFENDER_STATUS_COLORS[status]}44`,
          }}
        >
          ● {DEFENDER_STATUS_LABELS[status]}
        </span>
      </div>

      {/* Feed */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-2 feed-scroll"
      >
        {disruptions.length === 0 ? (
          <div className="text-xs font-mono mt-4 text-center opacity-40"
            style={{ color: 'var(--color-text-secondary)' }}>
            Defender is watching...
          </div>
        ) : (
          disruptions.map((d, i) => (
            <DisruptionCard
              key={d.id}
              event={d}
              isNew={i === disruptions.length - 1}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 shrink-0 text-xs font-mono"
        style={{ borderTop: '1px solid var(--color-defender-dim)', color: 'var(--color-text-secondary)' }}>
        {disruptions.filter(d => d.success).length} disruptions landed
      </div>
    </div>
  );
}
