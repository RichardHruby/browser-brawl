'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { AttackSuite } from '@/lib/attack-spec';

interface TaskOption {
  id: string;
  label: string;
  description: string;
}

const SUITES: { id: AttackSuite; label: string; description: string }[] = [
  { id: 'prompt_injection', label: 'Prompt Injection', description: '4 PI attacks: hidden text, visible redirect, authority banner, attribute payload' },
  { id: 'phishing', label: 'Phishing', description: 'Credential theft modal + session expiry redirect' },
  { id: 'ui_robustness', label: 'UI Robustness', description: 'Legacy disruptions: popup overlay, scroll hijack, button camouflage' },
  { id: 'mixed', label: 'Mixed', description: 'Combination of prompt injection + UI disruptions' },
];

type RunPhase = 'config' | 'running' | 'done';

export default function RedTeamPage() {
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [selectedSuite, setSelectedSuite] = useState<AttackSuite>('prompt_injection');
  const [selectedTask, setSelectedTask] = useState<string>('');
  const [secrets, setSecrets] = useState<{ key: string; value: string }[]>([]);
  const [phase, setPhase] = useState<RunPhase>('config');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch tasks on mount
  useEffect(() => {
    fetch('/api/game/tasks')
      .then(r => r.json())
      .then(data => {
        const t = data.tasks as TaskOption[];
        setTasks(t);
        if (t.length > 0) setSelectedTask(t[0].id);
      })
      .catch(() => {});
  }, []);

  function addSecret() {
    setSecrets(prev => [...prev, { key: '', value: '' }]);
  }

  function removeSecret(index: number) {
    setSecrets(prev => prev.filter((_, i) => i !== index));
  }

  function updateSecret(index: number, field: 'key' | 'value', val: string) {
    setSecrets(prev => prev.map((s, i) => i === index ? { ...s, [field]: val } : s));
  }

  async function handleRun() {
    if (!selectedTask) return;
    setPhase('running');
    setError(null);

    const agentSecrets: Record<string, string> = {};
    for (const s of secrets) {
      if (s.key.trim()) agentSecrets[s.key.trim()] = s.value;
    }

    try {
      const res = await fetch('/api/game/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: selectedTask,
          attackSuite: selectedSuite,
          agentSecrets: Object.keys(agentSecrets).length > 0 ? agentSecrets : undefined,
          difficulty: 'easy',
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const { sessionId: sid } = await res.json();
      setSessionId(sid);
      setPhase('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('config');
    }
  }

  const suiteInfo = SUITES.find(s => s.id === selectedSuite);

  return (
    <div
      className="boxy-ui min-h-screen flex flex-col px-6 py-8"
      style={{ background: 'var(--color-bg-deep)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-black tracking-widest" style={{ color: 'var(--color-defender)' }}>
            RED TEAM
          </h1>
          <p className="font-game text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            Controllable defender &middot; Prompt injection eval
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/history"
            className="font-display text-xs font-bold tracking-widest uppercase px-4 py-2 rounded transition-all duration-200 hover:scale-105"
            style={{
              background: 'var(--color-bg-card)',
              color: 'var(--color-attacker)',
              border: '2px solid var(--color-attacker)',
            }}
          >
            Results
          </Link>
          <Link
            href="/"
            className="font-display text-xs font-bold tracking-widest uppercase px-4 py-2 rounded transition-all duration-200 hover:scale-105"
            style={{
              background: 'var(--color-bg-card)',
              color: 'var(--color-text-secondary)',
              border: '2px solid var(--color-border)',
            }}
          >
            Lobby
          </Link>
        </div>
      </div>

      {/* Config form */}
      <div
        className="max-w-2xl w-full mx-auto rounded-xl p-6 space-y-6"
        style={{ background: 'var(--color-bg-panel)', border: '2px solid var(--color-border)' }}
      >
        {/* Suite picker */}
        <div>
          <label className="font-mono text-xs uppercase tracking-wider block mb-2"
            style={{ color: 'var(--color-text-secondary)' }}>
            Attack Suite
          </label>
          <div className="grid grid-cols-2 gap-2">
            {SUITES.map(suite => (
              <button
                key={suite.id}
                onClick={() => setSelectedSuite(suite.id)}
                className="text-left px-3 py-2 rounded transition-all"
                style={{
                  background: selectedSuite === suite.id ? 'var(--color-defender-dim)' : 'var(--color-bg-card)',
                  border: `2px solid ${selectedSuite === suite.id ? 'var(--color-defender)' : 'var(--color-border)'}`,
                }}
              >
                <span className="font-mono text-sm font-bold block"
                  style={{ color: selectedSuite === suite.id ? 'var(--color-defender)' : 'var(--color-text-primary)' }}>
                  {suite.label}
                </span>
                <span className="font-mono text-[10px] block mt-0.5"
                  style={{ color: 'var(--color-text-secondary)' }}>
                  {suite.description}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Task picker */}
        <div>
          <label className="font-mono text-xs uppercase tracking-wider block mb-2"
            style={{ color: 'var(--color-text-secondary)' }}>
            Target Task
          </label>
          <select
            value={selectedTask}
            onChange={e => setSelectedTask(e.target.value)}
            className="w-full px-3 py-2 rounded font-mono text-sm"
            style={{
              background: 'var(--color-bg-card)',
              color: 'var(--color-text-primary)',
              border: '2px solid var(--color-border)',
            }}
          >
            {tasks.map(t => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Agent secrets */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="font-mono text-xs uppercase tracking-wider"
              style={{ color: 'var(--color-text-secondary)' }}>
              Agent Secrets (optional)
            </label>
            <button
              onClick={addSecret}
              className="font-mono text-xs px-2 py-0.5 rounded transition-all hover:scale-105"
              style={{
                background: 'var(--color-bg-card)',
                color: 'var(--color-attacker)',
                border: '1px solid var(--color-attacker)',
              }}
            >
              + Add
            </button>
          </div>
          <p className="font-mono text-[10px] mb-2" style={{ color: 'var(--color-text-secondary)' }}>
            Credentials appended to attacker prompt for exfiltration testing
          </p>
          {secrets.map((s, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input
                placeholder="key (e.g. email)"
                value={s.key}
                onChange={e => updateSecret(i, 'key', e.target.value)}
                className="flex-1 px-2 py-1 rounded font-mono text-xs"
                style={{
                  background: 'var(--color-bg-card)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border)',
                }}
              />
              <input
                placeholder="value (e.g. test@co.com)"
                value={s.value}
                onChange={e => updateSecret(i, 'value', e.target.value)}
                className="flex-1 px-2 py-1 rounded font-mono text-xs"
                style={{
                  background: 'var(--color-bg-card)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border)',
                }}
              />
              <button
                onClick={() => removeSecret(i)}
                className="font-mono text-xs px-2 rounded"
                style={{ color: 'var(--color-health-low)', border: '1px solid var(--color-border)' }}
              >
                x
              </button>
            </div>
          ))}
        </div>

        {/* Suite info */}
        {suiteInfo && (
          <div className="px-3 py-2 rounded" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
            <span className="font-mono text-[10px] block" style={{ color: 'var(--color-text-secondary)' }}>
              Suite: <span style={{ color: 'var(--color-defender)' }}>{suiteInfo.label}</span> &middot; No health decay &middot; Pure eval mode
            </span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="px-3 py-2 rounded font-mono text-xs"
            style={{ background: '#ef444415', color: '#ef4444', border: '1px solid #ef444430' }}>
            {error}
          </div>
        )}

        {/* Run button */}
        <button
          onClick={handleRun}
          disabled={phase === 'running' || !selectedTask}
          className="w-full font-display text-sm font-bold tracking-widest uppercase px-6 py-3 rounded transition-all duration-200 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: phase === 'running' ? 'var(--color-bg-card)' : 'var(--color-defender)',
            color: phase === 'running' ? 'var(--color-text-secondary)' : '#000',
            border: `2px solid ${phase === 'running' ? 'var(--color-border)' : 'var(--color-defender)'}`,
          }}
        >
          {phase === 'running' ? 'Starting...' : 'Run Eval'}
        </button>

        {/* Post-run links */}
        {phase === 'done' && sessionId && (
          <div className="flex gap-3">
            <Link
              href={`/history/${sessionId}`}
              className="flex-1 text-center font-display text-xs font-bold tracking-widest uppercase px-4 py-2 rounded transition-all duration-200 hover:scale-105"
              style={{
                background: 'var(--color-bg-card)',
                color: 'var(--color-attacker)',
                border: '2px solid var(--color-attacker)',
              }}
            >
              View Results
            </Link>
            <button
              onClick={() => { setPhase('config'); setSessionId(null); }}
              className="flex-1 font-display text-xs font-bold tracking-widest uppercase px-4 py-2 rounded transition-all duration-200 hover:scale-105"
              style={{
                background: 'var(--color-bg-card)',
                color: 'var(--color-text-secondary)',
                border: '2px solid var(--color-border)',
              }}
            >
              Run Another
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
