'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useState } from 'react';
import Link from 'next/link';
import { DIFFICULTY_COLORS, WINNER_SHORT } from '@/lib/constants';
import { formatDuration, formatDate, formatWinReason } from '@/lib/format';
import type { Difficulty } from '@/types/game';

type Winner = 'attacker' | 'defender';

export default function HistoryPage() {
  const [diffFilter, setDiffFilter] = useState<Difficulty | ''>('');
  const [winnerFilter, setWinnerFilter] = useState<Winner | ''>('');

  const sessions = useQuery(api.sessions.list, {
    difficulty: diffFilter || undefined,
    winner: winnerFilter || undefined,
    limit: 50,
  });

  return (
    <div
      className="min-h-screen flex flex-col px-6 py-8"
      style={{ background: 'var(--color-bg-deep)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-black tracking-widest neon-cyan">
            PRIOR TRACES
          </h1>
          <p className="font-game text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            Past sessions &middot; Training data
          </p>
        </div>
        <div className="flex gap-3">
          <a
            href="/api/export/sessions"
            download
            className="font-display text-xs font-bold tracking-widest uppercase px-4 py-2 rounded transition-all duration-200 hover:scale-105"
            style={{
              background: 'var(--color-bg-card)',
              color: 'var(--color-attacker)',
              border: '1px solid var(--color-border)',
            }}
          >
            Export Sessions
          </a>
          <a
            href="/api/export/disruptions"
            download
            className="font-display text-xs font-bold tracking-widest uppercase px-4 py-2 rounded transition-all duration-200 hover:scale-105"
            style={{
              background: 'var(--color-bg-card)',
              color: 'var(--color-defender)',
              border: '1px solid var(--color-border)',
            }}
          >
            Export Disruptions
          </a>
          <Link
            href="/"
            className="font-display text-xs font-bold tracking-widest uppercase px-4 py-2 rounded transition-all duration-200 hover:scale-105"
            style={{
              background: 'var(--color-bg-card)',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
            }}
          >
            Back to Lobby
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <select
          value={diffFilter}
          onChange={(e) => setDiffFilter(e.target.value as Difficulty | '')}
          className="font-mono text-xs px-3 py-2 rounded appearance-none cursor-pointer"
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
          onChange={(e) => setWinnerFilter(e.target.value as Winner | '')}
          className="font-mono text-xs px-3 py-2 rounded appearance-none cursor-pointer"
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

        {sessions && (
          <span className="font-mono text-xs self-center" style={{ color: 'var(--color-text-secondary)' }}>
            {sessions.length} session{sessions.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: 'var(--color-bg-panel)',
          border: '1px solid var(--color-border)',
        }}
      >
        <table className="w-full font-game text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
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
                <td colSpan={9} className="text-center py-12 font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                  Loading...
                </td>
              </tr>
            ) : sessions.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-12 font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                  No sessions found
                </td>
              </tr>
            ) : (
              sessions.map((s) => (
                <tr
                  key={s._id}
                  className="transition-colors hover:bg-white/5"
                  style={{ borderBottom: '1px solid var(--color-border)' }}
                >
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
