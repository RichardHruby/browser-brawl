'use client';

import { useQuery, useMutation } from 'convex/react';
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
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistStatus, setWaitlistStatus] = useState<'idle' | 'submitting' | 'success'>('idle');
  const joinWaitlist = useMutation(api.waitlist.join);

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
      className="boxy-ui min-h-screen flex flex-col"
      style={{ background: 'var(--color-bg-deep)' }}
    >
      {/* Compact sticky header */}
      <div
        className="sticky top-0 z-30 px-6 py-3"
        style={{
          background: 'var(--color-bg-panel)',
          borderBottom: '2px solid var(--color-border)',
        }}
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Left: nav + title */}
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

          {/* Right: filters + action buttons */}
          <div className="flex items-center gap-3 flex-wrap">
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
                  border: selected.size > 0 ? '2px solid var(--color-attacker)' : '2px solid var(--color-border)',
                }}
              >
                Download Traces{selected.size > 0 ? ` (${selected.size})` : ''}
              </button>
              <div
                className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-2 rounded text-xs font-mono whitespace-nowrap opacity-0 group-hover/dl:opacity-100 transition-opacity duration-200 pointer-events-none z-50"
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
                  className="absolute bottom-full left-1/2 -translate-x-1/2 w-0 h-0"
                  style={{
                    borderLeft: '6px solid transparent',
                    borderRight: '6px solid transparent',
                    borderBottom: '6px solid var(--color-attacker)',
                  }}
                />
              </div>
            </div>

            {/* Kickoff Finetune button — opens waitlist modal */}
            <div className="relative group/tooltip">
              <button
                onClick={() => {
                  if (selected.size === 0) return;
                  setShowWaitlist(true);
                }}
                disabled={selected.size === 0}
                className="font-display text-xs font-bold tracking-widest uppercase px-4 py-2 rounded transition-all duration-200 hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                style={{
                  background: selected.size > 0 ? 'linear-gradient(135deg, #131325, #1a1a35)' : 'var(--color-bg-card)',
                  color: '#cc44ff',
                  border: selected.size > 0 ? '2px solid #cc44ff' : '2px solid var(--color-border)',
                  boxShadow: selected.size > 0 ? '0 0 12px rgba(204, 68, 255, 0.3)' : 'none',
                }}
              >
                Kickoff Finetune
              </button>
              <div
                className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-2 rounded text-xs font-mono whitespace-nowrap opacity-0 group-hover/tooltip:opacity-100 transition-opacity duration-200 pointer-events-none z-50"
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
                  className="absolute bottom-full left-1/2 -translate-x-1/2 w-0 h-0"
                  style={{
                    borderLeft: '6px solid transparent',
                    borderRight: '6px solid transparent',
                    borderBottom: '6px solid #cc44ff',
                  }}
                />
              </div>
            </div>

            <Link
              href="/training"
              className="font-display text-xs font-bold tracking-widest uppercase px-4 py-2 rounded transition-all duration-200 hover:scale-105"
              style={{
                background: 'var(--color-bg-card)',
                color: '#cc44ff',
                border: '2px solid #cc44ff',
              }}
            >
              Fine Tuning Runs
            </Link>
          </div>
        </div>
      </div>

      {/* Waitlist modal */}
      {showWaitlist && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => {
            if (waitlistStatus !== 'submitting') {
              setShowWaitlist(false);
              setWaitlistEmail('');
              setWaitlistStatus('idle');
            }
          }}
        >
          <div
            className="w-full max-w-md p-8"
            style={{
              background: 'var(--color-bg-panel)',
              border: '2px solid #cc44ff44',
              boxShadow: '0 0 40px rgba(204, 68, 255, 0.08)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {waitlistStatus === 'success' ? (
              <div className="text-center flex flex-col items-center gap-6">
                <h2
                  className="font-display text-2xl font-black tracking-[0.2em] uppercase"
                  style={{
                    color: '#cc44ff',
                    textShadow: '0 0 16px rgba(204, 68, 255, 0.6)',
                  }}
                >
                  YOU&apos;RE ON THE LIST
                </h2>
                <p
                  className="font-game text-base leading-relaxed"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  We&apos;ll email you when fine-tuning and Bring Your Own Model are available.
                </p>
                <button
                  onClick={() => {
                    setShowWaitlist(false);
                    setWaitlistEmail('');
                    setWaitlistStatus('idle');
                  }}
                  className="font-display text-xs font-bold tracking-[0.3em] uppercase px-6 py-3 transition-all duration-200 hover:scale-105"
                  style={{
                    color: '#cc44ff',
                    border: '2px solid #cc44ff',
                    background: 'rgba(204, 68, 255, 0.08)',
                  }}
                >
                  CLOSE
                </button>
              </div>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!waitlistEmail.trim()) return;
                  setWaitlistStatus('submitting');
                  try {
                    await joinWaitlist({ email: waitlistEmail.trim(), source: 'history-finetune' });
                    setWaitlistStatus('success');
                  } catch {
                    setWaitlistStatus('success');
                  }
                }}
                className="flex flex-col gap-6"
              >
                <div className="text-center">
                  <h2
                    className="font-display text-2xl font-black tracking-[0.15em] uppercase mb-3"
                    style={{
                      color: '#cc44ff',
                      textShadow: '0 0 16px rgba(204, 68, 255, 0.6)',
                    }}
                  >
                    EARLY ACCESS
                  </h2>
                  <p
                    className="font-game text-base leading-relaxed"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    Fine-tuning pipeline &amp; Bring Your Own Model are coming soon.
                    <br />
                    Get notified when they go live.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="waitlist-modal-email"
                    className="font-mono text-[10px] tracking-wider"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    EMAIL ADDRESS
                  </label>
                  <input
                    id="waitlist-modal-email"
                    type="email"
                    required
                    autoFocus
                    value={waitlistEmail}
                    onChange={(e) => setWaitlistEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3 py-2.5 font-mono text-sm transition-all duration-200 outline-none"
                    style={{
                      background: 'var(--color-bg-deep)',
                      border: '1px solid #aa44ff55',
                      color: 'var(--color-text-primary)',
                      boxShadow: waitlistEmail ? '0 0 8px #aa44ff33' : 'none',
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={waitlistStatus === 'submitting' || !waitlistEmail.trim()}
                  className="w-full px-6 py-3 font-display text-sm font-black tracking-[0.3em] uppercase transition-all duration-300 cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
                  style={{
                    background: 'linear-gradient(135deg, rgba(204, 68, 255, 0.15), rgba(170, 68, 255, 0.08))',
                    border: '2px solid #cc44ff',
                    color: '#cc44ff',
                    boxShadow: '0 0 20px rgba(204, 68, 255, 0.2)',
                  }}
                >
                  {waitlistStatus === 'submitting' ? 'JOINING...' : 'JOIN WAITLIST'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

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
