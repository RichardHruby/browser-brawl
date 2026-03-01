'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DIFFICULTY_COLORS, WINNER_SHORT } from '@/lib/constants';
import { formatDuration, formatDate, formatWinReason } from '@/lib/format';
import type { Difficulty } from '@/types/game';

type Winner = 'attacker' | 'defender';

export default function HistoryPage() {
  const [diffFilter, setDiffFilter] = useState<Difficulty | ''>('');
  const [winnerFilter, setWinnerFilter] = useState<Winner | ''>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isKickingOff, setIsKickingOff] = useState(false);
  const router = useRouter();

  const sessions = useQuery(api.sessions.list, {
    difficulty: diffFilter || undefined,
    winner: winnerFilter || undefined,
    limit: 50,
  });

  const toggleOne = useCallback((gameId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(gameId)) next.delete(gameId);
      else next.add(gameId);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (!sessions) return;
    const allIds = sessions.map((s) => s.gameId);
    const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
    setSelected(allSelected ? new Set() : new Set(allIds));
  }, [sessions, selected]);

  const allVisibleSelected =
    sessions != null &&
    sessions.length > 0 &&
    sessions.every((s) => selected.has(s.gameId));

  const someVisibleSelected =
    sessions != null &&
    sessions.some((s) => selected.has(s.gameId)) &&
    !allVisibleSelected;

  const gameIdsParam = Array.from(selected).join(',');

  return (
    <div
      className="boxy-ui min-h-screen flex flex-col px-6 py-8"
      style={{ background: 'var(--color-bg-deep)' }}
    >
      <div
        className="sticky top-0 z-30 -mx-6 px-6 pt-8 pb-4"
        style={{
          background: 'var(--color-bg-deep)',
          borderBottom: '2px solid var(--color-border)',
        }}
      >
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <h1 className="font-display text-3xl font-black tracking-widest neon-cyan">
              PRIOR TRACES
            </h1>
            <p className="font-game text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
              Past sessions &middot; Training data
            </p>
          </div>
          <div className="flex gap-3 flex-wrap items-center">
            {/* Download Traces — exports selected sessions as ShareGPT JSONL */}
            <div className="relative group/dl">
              <button
                onClick={() => {
                  if (selected.size === 0) return;
                  window.location.href = `/api/export/training?gameIds=${gameIdsParam}`;
                }}
                disabled={selected.size === 0}
                className="font-display text-xs font-bold tracking-widest uppercase px-4 py-2 rounded transition-all duration-200 hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                style={{
                  background: 'var(--color-bg-card)',
                  color: 'var(--color-attacker)',
                  border:
                    selected.size > 0
                      ? '2px solid var(--color-attacker)'
                      : '2px solid var(--color-border)',
                }}
              >
                Download Traces{selected.size > 0 ? ` (${selected.size})` : ''}
              </button>
              <div
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded text-xs font-mono whitespace-nowrap opacity-0 group-hover/dl:opacity-100 transition-opacity duration-200 pointer-events-none z-50"
                style={{
                  background: 'var(--color-bg-card)',
                  color: 'var(--color-attacker)',
                  border: '1px solid var(--color-attacker)',
                  boxShadow: '0 0 10px rgba(0, 255, 255, 0.15)',
                }}
              >
                {selected.size === 0
                  ? 'Select sessions to download'
                  : `Download ${selected.size} session${selected.size !== 1 ? 's' : ''} as ShareGPT JSONL`}
                <div
                  className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0"
                  style={{
                    borderLeft: '6px solid transparent',
                    borderRight: '6px solid transparent',
                    borderTop: '6px solid var(--color-attacker)',
                  }}
                />
              </div>
            </div>
            {/* Kickoff Finetune button with tooltip */}
            <div className="relative group/tooltip">
              <button
                onClick={async () => {
                  if (selected.size === 0 || isKickingOff) return;
                  setIsKickingOff(true);
                  try {
                    const res = await fetch('/api/training/start', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ gameIds: Array.from(selected), textOnly: true }),
                    });
                    const data = await res.json();
                    if (res.ok) {
                      router.push('/training');
                    } else {
                      alert(`Failed to start training: ${data.error || 'Unknown error'}`);
                    }
                  } catch (err) {
                    alert(`Network error: ${err}`);
                  } finally {
                    setIsKickingOff(false);
                  }
                }}
                disabled={selected.size === 0 || isKickingOff}
                className="font-display text-xs font-bold tracking-widest uppercase px-4 py-2 rounded transition-all duration-200 hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                style={{
                  background:
                    selected.size > 0
                      ? 'linear-gradient(135deg, #131325, #1a1a35)'
                      : 'var(--color-bg-card)',
                  color: '#cc44ff',
                  border:
                    selected.size > 0
                      ? '2px solid #cc44ff'
                      : '2px solid var(--color-border)',
                  boxShadow:
                    selected.size > 0
                      ? '0 0 12px rgba(204, 68, 255, 0.3)'
                      : 'none',
                }}
              >
                {isKickingOff ? 'Starting...' : 'Kickoff Finetune'}
              </button>
              <div
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded text-xs font-mono whitespace-nowrap opacity-0 group-hover/tooltip:opacity-100 transition-opacity duration-200 pointer-events-none z-50"
                style={{
                  background: 'var(--color-bg-card)',
                  color: '#cc44ff',
                  border: '1px solid #cc44ff',
                  boxShadow: '0 0 10px rgba(204, 68, 255, 0.25)',
                }}
              >
                {selected.size === 0
                  ? 'Select sessions to kick off a finetune'
                  : `Kick off a finetune pipeline with Qwen2.5 — ${selected.size} session${selected.size !== 1 ? 's' : ''} as ShareGPT JSONL`}
                <div
                  className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0"
                  style={{
                    borderLeft: '6px solid transparent',
                    borderRight: '6px solid transparent',
                    borderTop: '6px solid #cc44ff',
                  }}
                />
              </div>
            </div>
            <Link
              href="/"
              className="font-display text-xs font-bold tracking-widest uppercase px-4 py-2 rounded transition-all duration-200 hover:scale-105"
              style={{
                background: 'var(--color-bg-card)',
                color: 'var(--color-text-secondary)',
                border: '2px solid var(--color-border)',
              }}
            >
              Back to Lobby
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mt-4 flex-wrap">
          <select
            value={diffFilter}
            onChange={(e) => {
              setDiffFilter(e.target.value as Difficulty | '');
              setSelected(new Set());
            }}
            className="font-mono text-xs px-3 py-2 rounded appearance-none cursor-pointer"
            style={{
              background: 'var(--color-bg-card)',
              color: 'var(--color-text-primary)',
              border: '2px solid var(--color-border)',
            }}
          >
            <option value="">All Difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
            <option value="nightmare">Nightmare</option>
          </select>

          <select
            value={winnerFilter}
            onChange={(e) => {
              setWinnerFilter(e.target.value as Winner | '');
              setSelected(new Set());
            }}
            className="font-mono text-xs px-3 py-2 rounded appearance-none cursor-pointer"
            style={{
              background: 'var(--color-bg-card)',
              color: 'var(--color-text-primary)',
              border: '2px solid var(--color-border)',
            }}
          >
            <option value="">All Winners</option>
            <option value="attacker">Attacker Won</option>
            <option value="defender">Defender Won</option>
          </select>

          {sessions && (
            <span className="font-mono text-xs self-center" style={{ color: 'var(--color-text-secondary)' }}>
              {sessions.length} session{sessions.length !== 1 ? 's' : ''}
            </span>
          )}
          {selected.size > 0 && (
            <span className="font-mono text-xs self-center neon-cyan">
              {selected.size} selected
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: 'var(--color-bg-panel)',
          border: '2px solid var(--color-border)',
        }}
      >
        <table className="w-full font-game text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someVisibleSelected;
                  }}
                  onChange={toggleAll}
                  className="accent-[var(--color-attacker)] w-4 h-4 cursor-pointer"
                />
              </th>
              <th className="text-left px-4 py-3 font-mono text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>Date</th>
              <th className="text-left px-4 py-3 font-mono text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>Task</th>
              <th className="text-left px-4 py-3 font-mono text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>Mode</th>
              <th className="text-left px-4 py-3 font-mono text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>Difficulty</th>
              <th className="text-left px-4 py-3 font-mono text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>Winner</th>
              <th className="text-left px-4 py-3 font-mono text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>Reason</th>
              <th className="text-right px-4 py-3 font-mono text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>Health</th>
              <th className="text-right px-4 py-3 font-mono text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>Duration</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {sessions === undefined ? (
              <tr>
                <td colSpan={10} className="text-center py-12 font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                  Loading...
                </td>
              </tr>
            ) : sessions.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-12 font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                  No sessions found
                </td>
              </tr>
            ) : (
              sessions.map((s) => (
                <tr
                  key={s._id}
                  className="transition-colors hover:bg-white/5"
                  style={{
                    borderBottom: '1px solid var(--color-border)',
                    background: selected.has(s.gameId) ? 'rgba(0, 255, 255, 0.04)' : 'transparent',
                  }}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(s.gameId)}
                      onChange={() => toggleOne(s.gameId)}
                      className="accent-[var(--color-attacker)] w-4 h-4 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {formatDate(s.startedAt)}
                  </td>
                  <td className="px-4 py-3 max-w-[200px] truncate" style={{ color: 'var(--color-text-primary)' }}>
                    {s.taskLabel}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs uppercase" style={{ color: 'var(--color-text-secondary)' }}>
                    {s.mode}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="font-mono text-xs px-2 py-0.5 rounded"
                      style={{
                        color: DIFFICULTY_COLORS[s.difficulty as Difficulty] ?? '#888',
                        background: `${DIFFICULTY_COLORS[s.difficulty as Difficulty] ?? '#888'}20`,
                      }}
                    >
                      {s.difficulty}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {s.winner ? (
                      <span className={s.winner === 'attacker' ? 'neon-cyan' : 'neon-red'}>
                        {WINNER_SHORT[s.winner as 'attacker' | 'defender']}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-text-secondary)' }}>—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {formatWinReason(s.winReason)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs" style={{ color: 'var(--color-text-primary)' }}>
                    {s.healthFinal != null ? `${Math.round(s.healthFinal)}%` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {formatDuration(s.durationSeconds)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/history/${s.gameId}`}
                      className="font-mono text-xs px-3 py-1 rounded transition-all duration-200 hover:scale-105"
                      style={{
                        background: 'var(--color-bg-card)',
                        color: 'var(--color-attacker)',
                        border: '2px solid var(--color-attacker)',
                      }}
                    >
                      Replay
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
