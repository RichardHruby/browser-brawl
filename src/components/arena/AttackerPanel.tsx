'use client';

import React, { useRef, useEffect } from 'react';
import type { AgentEvent, AttackerStatus } from '@/types/game';
import { ATTACKER_STATUS_LABELS, ATTACKER_STATUS_COLORS } from '@/lib/constants';

interface Props {
  steps: AgentEvent[];
  status: AttackerStatus;
}

export function AttackerPanel({ steps, status }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [steps.length]);

  return (
    <div className="flex flex-col h-full w-72 shrink-0 rounded overflow-hidden"
      style={{ border: '1px solid var(--color-attacker-border)', background: 'var(--color-bg-panel)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--color-attacker-dim)' }}>
        <span className="font-display text-sm font-bold tracking-widest neon-cyan">
          ATTACKER
        </span>
        <span
          className="text-xs font-mono px-2 py-0.5 rounded"
          style={{
            color: ATTACKER_STATUS_COLORS[status],
            background: `${ATTACKER_STATUS_COLORS[status]}22`,
            border: `1px solid ${ATTACKER_STATUS_COLORS[status]}44`,
          }}
        >
          ● {ATTACKER_STATUS_LABELS[status]}
        </span>
      </div>

      {/* Feed */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-2 feed-scroll"
      >
        {steps.length === 0 ? (
          <div className="text-xs font-mono mt-4 text-center opacity-40"
            style={{ color: 'var(--color-text-secondary)' }}>
            Waiting for attacker...
          </div>
        ) : (
          steps.reduce<{ actionNum: number; elements: React.ReactNode[] }>((acc, step, i) => {
            const isThinking = step.agentStatus === 'thinking';
            if (!isThinking) acc.actionNum++;
            const displayNum = acc.actionNum;
            acc.elements.push(
              <div
                key={step.id}
                className={`mb-2 ${i === steps.length - 1 ? 'animate-slide-left' : ''}`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-xs font-mono shrink-0 mt-0.5"
                    style={{ color: isThinking ? 'var(--color-status-thinking)' : 'var(--color-attacker)', opacity: 0.6 }}>
                    {isThinking ? '>>' : String(displayNum).padStart(2, '0')}
                  </span>
                  <span className={`text-xs font-mono leading-relaxed ${isThinking ? 'italic' : ''}`}
                    style={{ color: isThinking ? 'var(--color-status-thinking)' : 'var(--color-text-mono)', opacity: isThinking ? 0.7 : 1 }}>
                    {step.description}
                  </span>
                </div>
              </div>
            );
            return acc;
          }, { actionNum: 0, elements: [] }).elements
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 shrink-0 text-xs font-mono"
        style={{ borderTop: '1px solid var(--color-attacker-dim)', color: 'var(--color-text-secondary)' }}>
        {steps.filter(s => s.agentStatus !== 'thinking').length} action{steps.filter(s => s.agentStatus !== 'thinking').length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
