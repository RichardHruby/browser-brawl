'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { expandSuite, type AttackSuite, type AttackEntry, type AgentSecrets } from '@/lib/attack-spec';
import type { Task } from '@/types/game';

// ---- Constants ----

const PRIMITIVES = [
  'inject_visible_inline_text',
  'inject_hidden_css_text',
  'inject_attribute_payload',
  'inject_banner_near_target',
  'inject_runtime_after_trigger',
  'spawn_injection_modal',
  'popup-overlay',
  'scroll-hijack',
  'button-camouflage',
];

const OBJECTIVES = ['task_disruption', 'data_exfiltration', 'navigation_hijack'] as const;
const PLACEMENTS = ['near_target', 'top_banner', 'modal_center', 'inline_content', 'sidebar', 'offscreen', 'hidden_dom'] as const;
const CONCEALMENTS = ['visible', 'css_opacity', 'white_on_white', 'zero_font', 'offscreen', 'attribute'] as const;
const AUTHORITIES = ['none', 'system', 'security', 'admin'] as const;
const PERSISTENCES = ['one_shot', 'sticky'] as const;
const TRIGGER_TYPES = [
  'on_page_load',
  'after_navigation',
  'after_n_steps',
  'on_interval',
  'when_url_matches',
  'when_element_visible',
  'natural_language',
] as const;
const SUCCESS_CONDITION_TYPES = ['url_navigation', 'form_interaction', 'task_abandoned', 'loop_detected'] as const;

const SUITES: { id: AttackSuite; label: string; description: string }[] = [
  { id: 'prompt_injection', label: 'Prompt Injection', description: '4 PI attacks: attribute, hidden text, visible redirect, authority banner' },
  { id: 'exfil', label: 'Data Exfil', description: 'Credential theft: attribute overrides, modal, sr-only, redirect' },
  { id: 'phishing', label: 'Phishing', description: 'Credential theft modal + session expiry redirect' },
  { id: 'ui_robustness', label: 'UI Robustness', description: 'Legacy disruptions: popup, scroll hijack, button camouflage' },
  { id: 'mixed', label: 'Mixed', description: 'Combination of prompt injection + UI disruptions' },
];

// ---- Helpers ----

function triggerSummary(trigger: AttackEntry['trigger']): string {
  switch (trigger.type) {
    case 'after_n_steps': return `after ${trigger.n ?? '?'} steps`;
    case 'on_page_load': return 'on page load';
    case 'after_navigation': return 'after navigation';
    case 'on_interval': return `every ${trigger.ms ?? '?'}ms`;
    case 'when_url_matches': return `url matches ${trigger.pattern ?? '...'}`;
    case 'when_element_visible': return `element visible`;
    case 'natural_language': return `when: ${trigger.condition ?? '...'}`;
    default: return (trigger as AttackEntry['trigger']).type;
  }
}

const DEFAULT_ATTACK: AttackEntry = {
  primitive: 'inject_visible_inline_text',
  objective: 'task_disruption',
  trigger: { type: 'after_n_steps', n: 2 },
  concealment: 'visible',
  placement: 'inline_content',
};

// ---- AttackCard component ----

interface AttackCardProps {
  attack: AttackEntry;
  index: number;
  expanded: boolean;
  showSuccessCondition: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onUpdate: (updates: Partial<AttackEntry>) => void;
  onUpdateTrigger: (updates: Partial<AttackEntry['trigger']>) => void;
  onToggleSuccessCondition: () => void;
}

function AttackCard({
  attack,
  index,
  expanded,
  showSuccessCondition,
  onToggle,
  onDelete,
  onUpdate,
  onUpdateTrigger,
  onToggleSuccessCondition,
}: AttackCardProps) {
  const inputStyle = {
    background: 'var(--color-bg-deep)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)',
  } as const;

  const labelStyle = {
    color: 'var(--color-text-secondary)',
  } as const;

  return (
    <div
      className="rounded overflow-hidden"
      style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg-card)' }}
    >
      {/* Collapsed header */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:opacity-80 transition-opacity"
        onClick={onToggle}
        style={{ borderBottom: expanded ? '1px solid var(--color-border)' : 'none' }}
      >
        <span className="font-mono text-xs" style={{ color: 'var(--color-text-primary)' }}>
          <span style={{ color: 'var(--color-defender)' }}>#{index + 1}</span>
          {' '}
          {attack.primitive}
          {' '}
          <span style={{ color: 'var(--color-text-secondary)' }}>— {triggerSummary(attack.trigger)}</span>
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
            {expanded ? '▲' : '▼'}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="font-mono text-xs px-1.5 rounded hover:opacity-80 transition-opacity"
            style={{ color: 'var(--color-health-low)', border: '1px solid var(--color-border)' }}
          >
            ×
          </button>
        </div>
      </div>

      {/* Expanded form */}
      {expanded && (
        <div className="px-3 py-3 space-y-3">
          {/* Primitive */}
          <div>
            <label className="font-mono text-[10px] uppercase tracking-wider block mb-1" style={labelStyle}>
              Primitive
            </label>
            <select
              value={attack.primitive}
              onChange={e => onUpdate({ primitive: e.target.value })}
              className="w-full px-2 py-1 rounded font-mono text-xs"
              style={inputStyle}
            >
              {PRIMITIVES.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Objective */}
          <div>
            <label className="font-mono text-[10px] uppercase tracking-wider block mb-1" style={labelStyle}>
              Objective
            </label>
            <select
              value={attack.objective}
              onChange={e => onUpdate({ objective: e.target.value as AttackEntry['objective'] })}
              className="w-full px-2 py-1 rounded font-mono text-xs"
              style={inputStyle}
            >
              {OBJECTIVES.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          {/* Placement + Concealment */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-mono text-[10px] uppercase tracking-wider block mb-1" style={labelStyle}>
                Placement
              </label>
              <select
                value={attack.placement}
                onChange={e => onUpdate({ placement: e.target.value as AttackEntry['placement'] })}
                className="w-full px-2 py-1 rounded font-mono text-xs"
                style={inputStyle}
              >
                {PLACEMENTS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase tracking-wider block mb-1" style={labelStyle}>
                Concealment
              </label>
              <select
                value={attack.concealment ?? 'visible'}
                onChange={e => onUpdate({ concealment: e.target.value as AttackEntry['concealment'] })}
                className="w-full px-2 py-1 rounded font-mono text-xs"
                style={inputStyle}
              >
                {CONCEALMENTS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Authority + Persistence */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-mono text-[10px] uppercase tracking-wider block mb-1" style={labelStyle}>
                Authority
              </label>
              <select
                value={attack.authority ?? 'none'}
                onChange={e => onUpdate({ authority: e.target.value as AttackEntry['authority'] })}
                className="w-full px-2 py-1 rounded font-mono text-xs"
                style={inputStyle}
              >
                {AUTHORITIES.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase tracking-wider block mb-1" style={labelStyle}>
                Persistence
              </label>
              <select
                value={attack.persistence ?? 'one_shot'}
                onChange={e => onUpdate({ persistence: e.target.value as AttackEntry['persistence'] })}
                className="w-full px-2 py-1 rounded font-mono text-xs"
                style={inputStyle}
              >
                {PERSISTENCES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* Injection text */}
          <div>
            <label className="font-mono text-[10px] uppercase tracking-wider block mb-1" style={labelStyle}>
              Injection Text (optional)
            </label>
            <textarea
              value={attack.text ?? ''}
              onChange={e => onUpdate({ text: e.target.value || undefined })}
              rows={2}
              className="w-full px-2 py-1 rounded font-mono text-xs resize-y"
              placeholder="Adversarial text to inject..."
              style={inputStyle}
            />
          </div>

          {/* Trigger */}
          <div>
            <label className="font-mono text-[10px] uppercase tracking-wider block mb-1" style={labelStyle}>
              Trigger
            </label>
            <select
              value={attack.trigger.type}
              onChange={e => {
                const newType = e.target.value as AttackEntry['trigger']['type'];
                onUpdateTrigger({ type: newType } as AttackEntry['trigger']);
                // Reset trigger to avoid stale fields
                onUpdate({ trigger: { type: newType } });
              }}
              className="w-full px-2 py-1 rounded font-mono text-xs mb-2"
              style={inputStyle}
            >
              {TRIGGER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>

            {/* Conditional extra fields per trigger type */}
            {attack.trigger.type === 'after_n_steps' && (
              <div className="flex items-center gap-2">
                <label className="font-mono text-[10px]" style={labelStyle}>n =</label>
                <input
                  type="number"
                  min={1}
                  value={attack.trigger.n ?? 2}
                  onChange={e => onUpdateTrigger({ n: parseInt(e.target.value) || 1 })}
                  className="w-20 px-2 py-1 rounded font-mono text-xs"
                  style={inputStyle}
                />
              </div>
            )}

            {attack.trigger.type === 'on_interval' && (
              <div className="flex items-center gap-2">
                <label className="font-mono text-[10px]" style={labelStyle}>ms =</label>
                <input
                  type="number"
                  min={500}
                  value={attack.trigger.ms ?? 5000}
                  onChange={e => onUpdateTrigger({ ms: parseInt(e.target.value) || 1000 })}
                  className="w-24 px-2 py-1 rounded font-mono text-xs"
                  style={inputStyle}
                />
              </div>
            )}

            {attack.trigger.type === 'when_url_matches' && (
              <input
                type="text"
                value={attack.trigger.pattern ?? ''}
                onChange={e => onUpdateTrigger({ pattern: e.target.value })}
                placeholder="e.g. checkout|cart"
                className="w-full px-2 py-1 rounded font-mono text-xs"
                style={inputStyle}
              />
            )}

            {attack.trigger.type === 'when_element_visible' && (
              <input
                type="text"
                value={attack.trigger.selector ?? ''}
                onChange={e => onUpdateTrigger({ selector: e.target.value })}
                placeholder="e.g. #checkout-button"
                className="w-full px-2 py-1 rounded font-mono text-xs"
                style={inputStyle}
              />
            )}

            {attack.trigger.type === 'natural_language' && (
              <input
                type="text"
                value={attack.trigger.condition ?? ''}
                onChange={e => onUpdateTrigger({ condition: e.target.value })}
                placeholder="e.g. at checkout"
                className="w-full px-2 py-1 rounded font-mono text-xs"
                style={inputStyle}
              />
            )}
          </div>

          {/* Success condition toggle */}
          <div>
            <button
              onClick={onToggleSuccessCondition}
              className="font-mono text-[10px] underline transition-opacity hover:opacity-70"
              style={{ color: 'var(--color-attacker)' }}
            >
              {showSuccessCondition ? '− Remove' : '+ Add'} success condition
            </button>

            {showSuccessCondition && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-wider block mb-1" style={labelStyle}>
                    Type
                  </label>
                  <select
                    value={attack.successCondition?.type ?? 'form_interaction'}
                    onChange={e => onUpdate({
                      successCondition: {
                        ...attack.successCondition,
                        type: e.target.value as NonNullable<AttackEntry['successCondition']>['type'],
                      },
                    })}
                    className="w-full px-2 py-1 rounded font-mono text-xs"
                    style={inputStyle}
                  >
                    {SUCCESS_CONDITION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-wider block mb-1" style={labelStyle}>
                    Target (optional)
                  </label>
                  <input
                    type="text"
                    value={attack.successCondition?.target ?? ''}
                    onChange={e => onUpdate({
                      successCondition: {
                        type: attack.successCondition?.type ?? 'form_interaction',
                        target: e.target.value || undefined,
                      },
                    })}
                    placeholder="URL pattern or CSS selector"
                    className="w-full px-2 py-1 rounded font-mono text-xs"
                    style={inputStyle}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Main page ----

type RunPhase = 'config' | 'running' | 'done';

export default function RedTeamPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<string>('');
  const [secrets, setSecrets] = useState<{ key: string; value: string }[]>([]);
  const [phase, setPhase] = useState<RunPhase>('config');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form builder state
  const [spec, setSpec] = useState<{ seed: number; attacks: AttackEntry[] }>({ seed: 42, attacks: [] });
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [showSuccessCondition, setShowSuccessCondition] = useState<Record<number, boolean>>({});

  // Fetch tasks on mount
  useEffect(() => {
    fetch('/api/game/tasks')
      .then(r => r.json())
      .then(data => {
        const t = data.tasks as Task[];
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

  function updateAttack(index: number, updates: Partial<AttackEntry>) {
    setSpec(prev => ({
      ...prev,
      attacks: prev.attacks.map((a, i) => i === index ? { ...a, ...updates } : a),
    }));
  }

  function updateTrigger(index: number, updates: Partial<AttackEntry['trigger']>) {
    setSpec(prev => ({
      ...prev,
      attacks: prev.attacks.map((a, i) =>
        i === index ? { ...a, trigger: { ...a.trigger, ...updates } } : a
      ),
    }));
  }

  async function handleRun() {
    if (!selectedTask) return;
    setPhase('running');
    setError(null);

    const agentSecrets: AgentSecrets = {};
    for (const s of secrets) {
      if (s.key.trim()) agentSecrets[s.key.trim()] = { value: s.value, type: 'other' };
    }

    try {
      const res = await fetch('/api/game/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: selectedTask,
          attackSpec: spec,
          agentSecrets: Object.keys(agentSecrets).length > 0 ? agentSecrets : undefined,
          difficulty: 'easy',
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
      }

      const { sessionId: sid } = await res.json() as { sessionId: string };
      setSessionId(sid);
      setPhase('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('config');
    }
  }

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
        {/* Attack Spec Builder */}
        <div>
          <label className="font-mono text-xs uppercase tracking-wider block mb-2"
            style={{ color: 'var(--color-text-secondary)' }}>
            Attack Spec Builder
          </label>
          <p className="font-mono text-[10px] mb-3" style={{ color: 'var(--color-text-secondary)' }}>
            Start from preset or build from scratch.
          </p>

          {/* Preset buttons */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {SUITES.map(suite => (
              <button
                key={suite.id}
                onClick={() => {
                  const task = tasks.find(t => t.id === selectedTask) ?? { id: selectedTask, label: '', description: '', startUrl: '', tags: [] };
                  const expanded = expandSuite(suite.id, task);
                  setSpec({ seed: expanded.seed, attacks: expanded.attacks });
                  setExpandedIndex(null);
                  setShowSuccessCondition({});
                }}
                className="text-left px-3 py-2 rounded transition-all hover:scale-[1.02]"
                style={{
                  background: 'var(--color-bg-card)',
                  border: '2px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}
              >
                <span className="font-mono text-xs font-bold block" style={{ color: 'var(--color-defender)' }}>
                  {suite.label}
                </span>
                <span className="font-mono text-[10px] block mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                  {suite.description}
                </span>
              </button>
            ))}
          </div>

          {/* Seed input */}
          <div className="flex items-center gap-3 mb-3">
            <label className="font-mono text-xs" style={{ color: 'var(--color-text-secondary)' }}>Seed</label>
            <input
              type="number"
              value={spec.seed}
              onChange={e => setSpec(prev => ({ ...prev, seed: parseInt(e.target.value) || 42 }))}
              className="w-24 px-2 py-1 rounded font-mono text-xs"
              style={{
                background: 'var(--color-bg-card)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border)',
              }}
            />
            <span className="font-mono text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
              {spec.attacks.length} attack{spec.attacks.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Attack list */}
          <div className="space-y-2">
            {spec.attacks.map((attack, i) => (
              <AttackCard
                key={i}
                attack={attack}
                index={i}
                expanded={expandedIndex === i}
                showSuccessCondition={!!showSuccessCondition[i]}
                onToggle={() => setExpandedIndex(expandedIndex === i ? null : i)}
                onDelete={() => {
                  setSpec(prev => ({ ...prev, attacks: prev.attacks.filter((_, j) => j !== i) }));
                  if (expandedIndex === i) setExpandedIndex(null);
                  // Shift showSuccessCondition keys
                  setShowSuccessCondition(prev => {
                    const next: Record<number, boolean> = {};
                    for (const [k, v] of Object.entries(prev)) {
                      const idx = parseInt(k);
                      if (idx < i) next[idx] = v;
                      else if (idx > i) next[idx - 1] = v;
                    }
                    return next;
                  });
                }}
                onUpdate={(updates) => updateAttack(i, updates)}
                onUpdateTrigger={(updates) => updateTrigger(i, updates)}
                onToggleSuccessCondition={() => setShowSuccessCondition(prev => ({ ...prev, [i]: !prev[i] }))}
              />
            ))}
          </div>

          {/* Add attack button */}
          <button
            onClick={() => {
              setSpec(prev => ({ ...prev, attacks: [...prev.attacks, { ...DEFAULT_ATTACK }] }));
              setExpandedIndex(spec.attacks.length);
            }}
            className="mt-3 w-full font-mono text-xs px-3 py-2 rounded transition-all hover:scale-[1.01]"
            style={{
              background: 'var(--color-bg-card)',
              color: 'var(--color-attacker)',
              border: '2px dashed var(--color-attacker)',
            }}
          >
            + Add Attack
          </button>
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

        {/* Spec info */}
        <div className="px-3 py-2 rounded" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <span className="font-mono text-[10px] block" style={{ color: 'var(--color-text-secondary)' }}>
            <span style={{ color: 'var(--color-defender)' }}>{spec.attacks.length} attack{spec.attacks.length !== 1 ? 's' : ''}</span>
            {' '}&middot; No health decay &middot; Pure eval mode
          </span>
        </div>

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
