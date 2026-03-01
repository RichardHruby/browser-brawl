'use client';

import { useState } from 'react';
import type { Task } from '@/types/game';
import { TASKS } from '@/lib/tasks';

interface Arena {
  task: Task;
  name: string;
  subtitle: string;
}

const ARENA_CONFIGS: { taskId: string; name: string; subtitle: string }[] = [
  {
    taskId: 'amazon-toothpaste',
    name: 'THE MARKETPLACE',
    subtitle: 'amazon.com',
  },
  {
    taskId: 'google-flights',
    name: 'THE SKYWAY',
    subtitle: 'google.com/flights',
  },
  {
    taskId: 'hackernews-upvote',
    name: 'THE FORUM',
    subtitle: 'news.ycombinator.com',
  },
  {
    taskId: 'techcrunch-newsletter',
    name: 'THE NEWSROOM',
    subtitle: 'techcrunch.com',
  },
];

const ARENAS: Arena[] = ARENA_CONFIGS.flatMap(({ taskId, name, subtitle }) => {
  const task = TASKS.find(t => t.id === taskId);
  return task ? [{ task, name, subtitle }] : [];
});

const HIGHLIGHT_COLOR = '#00d4ff';

interface Props {
  value: Task | null;
  onChange: (task: Task | null) => void;
}

export function ArenaSelector({ value, onChange }: Props) {
  const [custom, setCustom] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const handleCustomToggle = () => {
    const next = !showCustom;
    setShowCustom(next);
    if (next) onChange(null);
  };

  const handleCustomSubmit = () => {
    if (!custom.trim()) return;
    onChange({
      id: 'custom',
      label: 'Custom Arena',
      description: custom.trim(),
      startUrl: '',
      tags: [],
    });
    setShowCustom(false);
  };

  const isCustomSelected = value?.id === 'custom';

  return (
    <div className="flex flex-col">
      {ARENAS.map((arena) => {
        const selected = value?.id === arena.task.id;
        return (
          <button
            key={arena.task.id}
            onClick={() => { onChange(arena.task); setShowCustom(false); }}
            className="flex items-center gap-3 py-2 px-3 transition-all duration-150 cursor-pointer text-left"
            style={{
              background: selected ? `${HIGHLIGHT_COLOR}12` : 'transparent',
              borderLeft: selected ? `2px solid ${HIGHLIGHT_COLOR}` : '2px solid transparent',
            }}
          >
            <span
              className="font-display text-xs w-3 flex-shrink-0"
              style={{ color: selected ? HIGHLIGHT_COLOR : 'transparent' }}
            >
              ▶
            </span>
            <span
              className="font-display text-[11px] font-bold tracking-wider flex-1"
              style={{
                color: selected ? HIGHLIGHT_COLOR : 'var(--color-text-primary)',
                textShadow: selected ? `0 0 8px ${HIGHLIGHT_COLOR}` : 'none',
              }}
            >
              {arena.name}
            </span>
            <span
              className="font-mono text-[9px] flex-shrink-0"
              style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}
            >
              {arena.subtitle}
            </span>
          </button>
        );
      })}

      {/* Custom arena row */}
      <button
        onClick={handleCustomToggle}
        className="flex items-center gap-3 py-2 px-3 transition-all duration-150 cursor-pointer text-left"
        style={{
          background: isCustomSelected ? `${HIGHLIGHT_COLOR}12` : 'transparent',
          borderLeft: isCustomSelected ? `2px solid ${HIGHLIGHT_COLOR}` : '2px solid transparent',
        }}
      >
        <span
          className="font-display text-xs w-3 flex-shrink-0"
          style={{ color: isCustomSelected ? HIGHLIGHT_COLOR : 'transparent' }}
        >
          ▶
        </span>
        <span
          className="font-display text-[11px] font-bold tracking-wider flex-1"
          style={{
            color: isCustomSelected ? HIGHLIGHT_COLOR : 'var(--color-text-primary)',
            textShadow: isCustomSelected ? `0 0 8px ${HIGHLIGHT_COLOR}` : 'none',
          }}
        >
          CUSTOM ARENA...
        </span>
      </button>

      {/* Custom arena input */}
      {showCustom && (
        <div className="flex gap-2 px-3 py-2 ml-6">
          <input
            type="text"
            value={custom}
            onChange={e => setCustom(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCustomSubmit()}
            placeholder="Describe the task..."
            className="flex-1 px-3 py-1.5 text-xs font-mono outline-none"
            style={{
              background: 'var(--color-bg-deep)',
              border: `1px solid var(--color-border)`,
              color: 'var(--color-text-primary)',
            }}
          />
          <button
            onClick={handleCustomSubmit}
            className="px-3 py-1.5 text-[10px] font-display font-bold tracking-wider"
            style={{ background: HIGHLIGHT_COLOR, color: '#000' }}
          >
            SET
          </button>
        </div>
      )}
    </div>
  );
}
