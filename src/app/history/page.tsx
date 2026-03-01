'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useCallback, useState } from 'react';
import Link from 'next/link';
import { DIFFICULTY_COLORS, WINNER_SHORT } from '@/lib/constants';
import { formatDuration, formatDate, formatWinReason, formatModel } from '@/lib/format';
import type { Difficulty } from '@/types/game';

type Winner = 'attacker' | 'defender';

export default function HistoryPage() {
  const [diffFilter, setDiffFilter] = useState<Difficulty | ''>('');
  const [winnerFilter, setWinnerFilter] = useState<Winner | ''>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  return (
    <div
      className="boxy-ui min-h-screen flex flex-col"
      style={{ background: 'var(--color-bg-deep)' }}
    >
      {/* Compact header */}
      <div
        className="sticky top-0 z-30 px-6 py-3"
        style={{
          background: 'var(--color-bg-panel)',
          borderBottom: '2px solid var(--color-border)',
        }}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="font-display text-xs font-bold tracking-widest uppercase px-3 py-1.5 transition-all duration-200 hover:scale-105"
              style={{
                background: 'var(--color-bg-card)',
                color: 'var(--color-text-secondary)',
                border: '2px solid var(--color-border)',
              }}
            >
              &larr; Lobby
            </Link>
            <h1 className="font-display text-xl font-black tracking-widest neon-cyan">
              PRIOR TRACES
            </h1>
            {sessions && (
              <span className="font-mono text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                {sessions.length} session{sessions.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <select
              value={diffFilter}
              onChange={(e) => {
                setDiffFilter(e.target.value as Difficulty | '');
                setSelected(new Set());
              }}
              className="font-mono text-xs px-3 py-1.5 appearance-none cursor-pointer"
              style={{
                background: 'var(--color-bg-card)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border)',
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
              className="font-mono text-xs px-3 py-1.5 appearance-none cursor-pointer"
              style={{
                background: 'var(--color-bg-card)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border)',
              }}
            >
              <option value="">All Winners</option>
              <option value="attacker">Attacker Won</option>
              <option value="defender">Defender Won</option>
            </select>

            {selected.size > 0 && (
              <span className="font-mono text-xs neon-cyan">
                {selected.size} selected
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 px-6 py-4">
        <table className="w-full font-game text-sm">
          <thead>
            <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
              <th className="w-10 px-3 py-2">
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
              <th className="text-left px-3 py-2 font-mono text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>Date</th>
              <th className="text-left px-3 py-2 font-mono text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>Task</th>
              <th className="text-left px-3 py-2 font-mono text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>Attacker</th>
              <th className="text-left px-3 py-2 font-mono text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>Difficulty</th>
              <th className="text-left px-3 py-2 font-mono text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>Winner</th>
              <th className="text-left px-3 py-2 font-mono text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>Reason</th>
              <th className="text-right px-3 py-2 font-mono text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>HP</th>
              <th className="text-right px-3 py-2 font-mono text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>Time</th>
              <th className="px-3 py-2"></th>
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
                  className="transition-colors hover:bg-white/5 cursor-pointer"
                  onClick={() => window.location.href = `/history/${s.gameId}`}
                  style={{
                    borderBottom: '1px solid var(--color-border)',
                    background: selected.has(s.gameId) ? 'rgba(0, 255, 255, 0.04)' : 'transparent',
                  }}
                >
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(s.gameId)}
                      onChange={() => toggleOne(s.gameId)}
                      className="accent-[var(--color-attacker)] w-4 h-4 cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {formatDate(s.startedAt)}
                  </td>
                  <td className="px-3 py-2 max-w-[180px] truncate" style={{ color: 'var(--color-text-primary)' }}>
                    {s.taskLabel}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                        {formatModel(s.attackerModel)}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className="font-mono text-[10px] px-1.5 py-0.5"
                      style={{
                        color: DIFFICULTY_COLORS[s.difficulty as Difficulty] ?? '#888',
                        background: `${DIFFICULTY_COLORS[s.difficulty as Difficulty] ?? '#888'}20`,
                      }}
                    >
                      {s.difficulty}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {s.winner ? (
                      <span className={`font-mono text-xs ${s.winner === 'attacker' ? 'neon-cyan' : 'neon-red'}`}>
                        {WINNER_SHORT[s.winner as 'attacker' | 'defender']}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-text-secondary)' }}>—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {formatWinReason(s.winReason)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs" style={{ color: 'var(--color-text-primary)' }}>
                    {s.healthFinal != null ? `${Math.round(s.healthFinal)}%` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {formatDuration(s.durationSeconds)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/history/${s.gameId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-mono text-[10px] px-2 py-1 transition-all duration-200 hover:scale-105"
                      style={{
                        color: 'var(--color-attacker)',
                        border: '1px solid var(--color-attacker)',
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
