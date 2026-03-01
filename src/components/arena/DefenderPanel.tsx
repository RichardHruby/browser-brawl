'use client';

import { useRef, useEffect, useMemo } from 'react';
import type { DisruptionEvent, DefenderStep, DefenderStatus } from '@/types/game';
import { DisruptionCard } from './DisruptionCard';
import { DEFENDER_STATUS_LABELS, DEFENDER_STATUS_COLORS } from '@/lib/constants';

type FeedItem =
  | { type: 'step'; data: DefenderStep }
  | { type: 'disruption'; data: DisruptionEvent };

interface Props {
  disruptions: DisruptionEvent[];
  steps: DefenderStep[];
  status: DefenderStatus;
  nextAttackIn: number | null;
}

export function DefenderPanel({ disruptions, steps, status, nextAttackIn }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isActive = status === 'plotting' || status === 'striking';

  const feed = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [
      ...steps.map(s => ({ type: 'step' as const, data: s })),
      ...disruptions.map(d => ({ type: 'disruption' as const, data: d })),
    ];
    items.sort((a, b) => {
      const tA = a.type === 'step' ? a.data.timestamp : a.data.timestamp;
      const tB = b.type === 'step' ? b.data.timestamp : b.data.timestamp;
      return tA.localeCompare(tB);
    });
    return items;
  }, [steps, disruptions]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [feed.length]);

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
          <span className={isActive ? 'animate-status-pulse' : ''}>●</span>{' '}
          {DEFENDER_STATUS_LABELS[status]}
        </span>
      </div>

      {/* Feed */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-2 feed-scroll"
      >
        {feed.length === 0 ? (
          <div className="text-xs font-mono mt-4 text-center opacity-40"
            style={{ color: 'var(--color-text-secondary)' }}>
            Defender is watching...
          </div>
        ) : (
          feed.map((item, i) => {
            const isLast = i === feed.length - 1;

            if (item.type === 'disruption') {
              return (
                <DisruptionCard
                  key={item.data.id}
                  event={item.data}
                  isNew={isLast}
                />
              );
            }

            // Step item — render like attacker thinking/tool steps
            const step = item.data;
            const isThinking = step.kind === 'thinking';
            const isLive = isLast && isActive;

            return (
              <div
                key={step.id}
                className={`mb-1.5 ${isLast ? 'animate-fade-in' : ''}`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-xs font-mono shrink-0 mt-0.5"
                    style={{
                      color: isThinking ? 'var(--color-status-plotting)' : 'var(--color-defender)',
                      opacity: 0.7,
                    }}>
                    {isThinking ? '>>' : '⚡'}
                  </span>
                  <span className={`text-xs font-mono leading-relaxed ${isThinking ? 'italic' : ''}`}
                    style={{
                      color: isThinking ? 'var(--color-status-plotting)' : 'var(--color-text-mono)',
                      opacity: isThinking ? 0.7 : 0.9,
                    }}>
                    {step.message}
                    {isLive && <span className="animate-status-pulse ml-1">_</span>}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 shrink-0 text-xs font-mono flex items-center justify-between"
        style={{ borderTop: '1px solid var(--color-defender-dim)', color: 'var(--color-text-secondary)' }}>
        <span>{disruptions.filter(d => d.success).length} disruptions landed</span>
        {nextAttackIn != null && nextAttackIn > 0 && (
          <span style={{ color: DEFENDER_STATUS_COLORS.cooling_down }}>
            Next in {nextAttackIn}s
          </span>
        )}
      </div>
    </div>
  );
}
