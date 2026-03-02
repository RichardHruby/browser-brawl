'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { use, useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { Difficulty } from '@/types/game';
import { DIFFICULTY_COLORS, WINNER_SHORT, ATTACKER_TYPE_COLORS } from '@/lib/constants';
import { formatDuration, formatModel, formatWinReason } from '@/lib/format';
import { HealthBar } from '@/components/arena/HealthBar';

function ScreenshotViewer({ storageId }: { storageId: Id<'_storage'> | undefined }) {
  const url = useQuery(api.screenshots.getUrl, storageId ? { storageId } : 'skip');
  if (!url) return null;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Screenshot"
        className="w-full rounded"
        style={{ border: '2px solid var(--color-border)' }}
      />
    </>
  );
}

interface RecordingData {
  fps: number;
  duration: number;
  frameCount: number;
  frames: { t: number; d: string }[];
}

function toDisplayString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatJsonInput(value: unknown): string {
  if (typeof value !== 'string') return toDisplayString(value);
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

type DomElement = {
  tag: string;
  text: string;
  id?: string;
  pos: { x: number; y: number; w: number; h: number };
};

function parseDomElements(snapshot: unknown): DomElement[] {
  if (typeof snapshot !== 'string') return [];

  try {
    const parsed = JSON.parse(snapshot);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((entry) => {
      const node = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
      const posRaw = (node.pos && typeof node.pos === 'object' ? node.pos : {}) as Record<string, unknown>;
      const toNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

      return {
        tag: toDisplayString(node.tag) || 'node',
        text: toDisplayString(node.text),
        id: node.id == null ? undefined : toDisplayString(node.id),
        pos: {
          x: toNum(posRaw.x),
          y: toNum(posRaw.y),
          w: toNum(posRaw.w),
          h: toNum(posRaw.h),
        },
      };
    });
  } catch {
    return [];
  }
}

function ScreencastPlayer({ storageId }: { storageId: Id<'_storage'> }) {
  const url = useQuery(api.screenshots.getUrl, { storageId });
  const [recording, setRecording] = useState<RecordingData | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!url) return;
    fetch(url)
      .then(r => r.json())
      .then(data => setRecording(data as RecordingData))
      .catch(() => {});
  }, [url]);

  const advanceFrame = useCallback(() => {
    if (!recording) return;
    setFrameIndex(prev => {
      const next = prev + 1;
      if (next >= recording.frames.length) {
        setPlaying(false);
        return prev;
      }
      return next;
    });
  }, [recording]);

  useEffect(() => {
    if (!playing || !recording || frameIndex >= recording.frames.length - 1) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    const currentFrame = recording.frames[frameIndex];
    const nextFrame = recording.frames[frameIndex + 1];
    const delay = (nextFrame.t - currentFrame.t) / speed;

    timerRef.current = setTimeout(advanceFrame, Math.max(delay, 16));
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [playing, frameIndex, recording, speed, advanceFrame]);

  if (!recording) {
    return (
      <div className="flex items-center justify-center py-8 font-mono text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        Loading recording...
      </div>
    );
  }

  const frame = recording.frames[frameIndex];
  const elapsed = frame ? (frame.t / 1000).toFixed(1) : '0.0';
  const total = (recording.duration / 1000).toFixed(1);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 min-h-0 rounded overflow-hidden" style={{ border: '2px solid var(--color-border)' }}>
        {frame && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:image/jpeg;base64,${frame.d}`}
              alt={`Frame ${frameIndex + 1}`}
              className="w-full h-full object-contain"
            />
          </>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 pt-3 shrink-0">
        <button
          onClick={() => setPlaying(!playing)}
          className="font-display text-xs font-bold tracking-widest uppercase px-3 py-1.5 transition-all duration-200 hover:scale-105"
          style={{ background: 'var(--color-bg-card)', color: 'var(--color-attacker)', border: '2px solid var(--color-attacker)' }}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={() => { setFrameIndex(Math.max(0, frameIndex - 1)); setPlaying(false); }}
          className="font-mono text-xs px-2 py-1.5 transition-colors"
          style={{ background: 'var(--color-bg-card)', color: 'var(--color-text-primary)', border: '2px solid var(--color-border)' }}
        >
          Prev
        </button>
        <button
          onClick={() => { setFrameIndex(Math.min(recording.frames.length - 1, frameIndex + 1)); setPlaying(false); }}
          className="font-mono text-xs px-2 py-1.5 transition-colors"
          style={{ background: 'var(--color-bg-card)', color: 'var(--color-text-primary)', border: '2px solid var(--color-border)' }}
        >
          Next
        </button>

        {[1, 2, 4].map(s => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            className="font-mono text-[10px] px-2 py-1 transition-colors"
            style={{
              background: speed === s ? 'var(--color-attacker)' : 'var(--color-bg-card)',
              color: speed === s ? '#000' : 'var(--color-text-secondary)',
              border: '2px solid var(--color-border)',
            }}
          >
            {s}x
          </button>
        ))}

        <input
          type="range"
          min={0}
          max={recording.frames.length - 1}
          value={frameIndex}
          onChange={(e) => { setFrameIndex(Number(e.target.value)); setPlaying(false); }}
          className="flex-1"
        />

        <span className="font-mono text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
          {elapsed}s / {total}s ({frameIndex + 1}/{recording.frameCount})
        </span>
      </div>
    </div>
  );
}

export default function ReplayPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = use(params);
  const session = useQuery(api.sessions.get, { gameId });
  const steps = useQuery(api.steps.getStepsForSession, { gameId });
  const actions = useQuery(api.steps.getActionsForSession, { gameId });
  const healthTimeline = useQuery(api.health.getTimeline, { gameId });

  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [selectedAction, setSelectedAction] = useState<number | null>(null);

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-deep)' }}>
        <span className="font-mono" style={{ color: 'var(--color-text-secondary)' }}>Loading...</span>
      </div>
    );
  }

  if (session === null) {
    return (
      <div className="boxy-ui min-h-screen flex flex-col items-center justify-center gap-6 px-6" style={{ background: 'var(--color-bg-deep)' }}>
        <span className="font-mono text-lg" style={{ color: 'var(--color-text-secondary)' }}>Session not found</span>
        <Link href="/history" className="font-display text-xs font-bold tracking-widest uppercase px-4 py-2 transition-all duration-200 hover:scale-105 neon-cyan"
          style={{ background: 'var(--color-bg-card)', border: '2px solid var(--color-border)' }}>
          Back to History
        </Link>
      </div>
    );
  }

  const diffColor = DIFFICULTY_COLORS[session.difficulty as Difficulty];
  const attackerColor = ATTACKER_TYPE_COLORS['playwright-mcp'];
  const selectedStepData = selectedStep != null ? steps?.find(s => s.stepNumber === selectedStep) : null;
  const selectedActionData = selectedAction != null ? actions?.find(a => a.actionNumber === selectedAction) : null;
  const selectedDomElements = selectedStepData ? parseDomElements(selectedStepData.domSnapshot) : [];

  return (
    <div className="boxy-ui flex flex-col h-screen" style={{ background: 'var(--color-bg-deep)' }}>
      {/* Header — mirrors ArenaHeader layout */}
      <div className="flex flex-col gap-1 shrink-0 px-4 py-2"
        style={{ borderBottom: '2px solid var(--color-border)', background: 'var(--color-bg-panel)' }}>

        {/* Top row: attacker | center info | defender */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/history"
              className="font-display text-xs font-bold tracking-widest uppercase px-3 py-1.5 transition-all duration-200 hover:scale-105"
              style={{ background: 'var(--color-bg-card)', color: 'var(--color-text-secondary)', border: '2px solid var(--color-border)' }}>
              &larr;
            </Link>
            <span className="font-display text-xs font-bold tracking-widest neon-cyan">
              ⚔ ATTACKER
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 border"
              style={{ color: attackerColor, background: `${attackerColor}1f`, borderColor: `${attackerColor}88` }}>
              {formatModel(session.attackerModel)}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs font-mono truncate max-w-xs"
              style={{ color: 'var(--color-text-secondary)' }}>
              {session.taskLabel}
            </span>
            {session.durationSeconds != null && (
              <span className="font-display text-sm font-bold tabular-nums"
                style={{ color: 'var(--color-text-primary)' }}>
                {formatDuration(session.durationSeconds)}
              </span>
            )}
            {session.winner && (
              <span className={`font-mono text-xs px-2 py-0.5 border ${session.winner === 'attacker' ? 'neon-cyan' : 'neon-red'}`}
                style={{
                  borderColor: session.winner === 'attacker' ? 'var(--color-attacker)' : 'var(--color-defender)',
                  background: session.winner === 'attacker' ? 'rgba(0, 212, 255, 0.1)' : 'rgba(255, 0, 60, 0.1)',
                }}>
                {WINNER_SHORT[session.winner as 'attacker' | 'defender']} — {formatWinReason(session.winReason)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="font-display text-xs font-bold tracking-widest neon-red">
              DEFENDER 🛡
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 border uppercase"
              style={{ color: diffColor, background: `${diffColor}18`, borderColor: `${diffColor}66` }}>
              {session.difficulty}
            </span>
          </div>
        </div>

        {/* Health bar row */}
        <HealthBar health={session.healthFinal ?? 100} variant="static" />

        {/* Health timeline markers */}
        {healthTimeline && healthTimeline.length > 0 && (
          <div className="flex gap-1.5 flex-wrap px-4">
            {healthTimeline.map((h, i) => (
              <span key={i} className="font-mono text-[9px] px-1 py-0.5" style={{
                background: 'var(--color-bg-card)',
                color: h.delta < 0 ? 'var(--color-health-low)' : 'var(--color-health-high)',
              }}>
                {h.delta > 0 ? '+' : ''}{h.delta} ({h.cause})
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Three-column layout — matches ArenaScreen's flex flex-1 gap-2 p-2 */}
      <main className="flex flex-1 gap-2 p-2 overflow-hidden min-h-0">
        {/* Left: Attacker Steps — matches AttackerPanel chrome */}
        <div className="flex flex-col h-full w-72 shrink-0 rounded overflow-hidden"
          style={{ border: `2px solid ${attackerColor}66`, background: 'var(--color-bg-panel)' }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{ borderBottom: `2px solid ${attackerColor}33` }}>
            <span className="font-display text-sm font-bold tracking-widest"
              style={{ color: attackerColor, textShadow: `0 0 8px ${attackerColor}` }}>
              ATTACKER
            </span>
          </div>

          {/* Feed */}
          <div className="flex-1 overflow-y-auto px-3 py-2 feed-scroll">
            {steps?.map((step) => (
              <button
                key={step._id}
                onClick={() => { setSelectedStep(step.stepNumber); setSelectedAction(null); }}
                className="w-full text-left mb-2 transition-colors"
                style={{
                  background: selectedStep === step.stepNumber ? `${attackerColor}18` : 'transparent',
                }}
              >
                <div className="flex items-start gap-2">
                  <span className="text-xs font-mono shrink-0 mt-0.5"
                    style={{ color: attackerColor, opacity: 0.6 }}>
                    {String(step.stepNumber).padStart(2, '0')}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-mono leading-relaxed block truncate"
                      style={{ color: 'var(--color-text-mono)' }}>
                      {toDisplayString(step.description)}
                    </span>
                    {step.toolName && (
                      <span className="font-mono text-[10px] px-1.5 py-0.5 mt-0.5 inline-block" style={{
                        background: `${attackerColor}18`,
                        color: attackerColor,
                      }}>
                        {toDisplayString(step.toolName)}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 shrink-0 text-xs font-mono"
            style={{ borderTop: `1px solid ${attackerColor}33`, color: 'var(--color-text-secondary)' }}>
            {steps?.length ?? 0} step{(steps?.length ?? 0) !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Center: Detail viewer / Screencast — matches BrowserFrame chrome */}
        <div className="relative flex-1 min-w-0 flex flex-col rounded overflow-hidden"
          style={{ border: '2px solid var(--color-border)', background: '#111' }}>

          {/* Browser chrome bar */}
          <div className="flex items-center gap-2 px-3 py-2 shrink-0"
            style={{ background: 'var(--color-bg-panel)', borderBottom: '2px solid var(--color-border)' }}>
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ background: '#ff5f57' }} />
              <div className="w-3 h-3 rounded-full" style={{ background: '#febc2e' }} />
              <div className="w-3 h-3 rounded-full" style={{ background: '#28c840' }} />
            </div>
            <div className="flex-1 rounded px-3 py-0.5"
              style={{ background: 'var(--color-bg-card)' }}>
              {selectedStepData ? (
                <span className="font-mono text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                  Step #{selectedStepData.stepNumber}: {toDisplayString(selectedStepData.toolName) || 'Text Response'}
                </span>
              ) : selectedActionData ? (
                <span className="font-mono text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                  Disruption #{selectedActionData.actionNumber}: {toDisplayString(selectedActionData.disruptionName)}
                </span>
              ) : (
                <span className="font-mono text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                  Session Recording
                </span>
              )}
            </div>
            <div className="text-xs font-mono" style={{ color: 'var(--color-text-secondary)', opacity: 0.7 }}>
              ● REPLAY
            </div>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-y-auto feed-scroll p-4" style={{ background: 'var(--color-bg-deep)' }}>
            {selectedStepData ? (
              <div className="space-y-4">
                <h2 className="font-display text-lg font-bold neon-cyan">
                  Step #{selectedStepData.stepNumber}: {toDisplayString(selectedStepData.toolName) || 'Text Response'}
                </h2>
                <div className="font-game text-sm" style={{ color: 'var(--color-text-primary)' }}>
                  {toDisplayString(selectedStepData.description)}
                </div>

                {selectedStepData.screenshotBeforeId && (
                  <div>
                    <h3 className="font-mono text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                      Page State (Before)
                    </h3>
                    <ScreenshotViewer storageId={selectedStepData.screenshotBeforeId} />
                  </div>
                )}

                {selectedStepData.toolInput && (
                  <div>
                    <h3 className="font-mono text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                      Tool Input
                    </h3>
                    <pre className="font-mono text-xs p-3 overflow-x-auto code-block">
                      {formatJsonInput(selectedStepData.toolInput)}
                    </pre>
                  </div>
                )}

                {selectedStepData.toolResultSummary && (
                  <div>
                    <h3 className="font-mono text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                      Result
                    </h3>
                    <pre className="font-mono text-xs p-3 overflow-x-auto whitespace-pre-wrap code-block" style={{ maxHeight: '300px' }}>
                      {toDisplayString(selectedStepData.toolResultSummary)}
                    </pre>
                  </div>
                )}

                {selectedStepData.domSnapshot && (
                  <div>
                    <h3 className="font-mono text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                      DOM Snapshot ({selectedDomElements.length} elements)
                    </h3>
                    <div className="max-h-64 overflow-y-auto feed-scroll" style={{
                      background: 'var(--color-bg-card)',
                      border: '2px solid var(--color-border)',
                    }}>
                      {selectedDomElements.map((el, i) => (
                        <div key={i} className="px-3 py-1.5 font-mono text-[11px] flex gap-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <span style={{ color: 'var(--color-attacker)' }}>&lt;{el.tag}&gt;</span>
                          {el.id && <span style={{ color: 'var(--color-status-thinking)' }}>#{el.id}</span>}
                          <span className="truncate flex-1" style={{ color: 'var(--color-text-primary)' }}>{el.text || '(empty)'}</span>
                          <span style={{ color: 'var(--color-text-secondary)' }}>{el.pos.x},{el.pos.y}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : selectedActionData ? (
              <div className="space-y-4">
                <h2 className="font-display text-lg font-bold neon-red">
                  Disruption #{selectedActionData.actionNumber}: {toDisplayString(selectedActionData.disruptionName)}
                </h2>
                <div className="font-game text-sm" style={{ color: 'var(--color-text-primary)' }}>
                  {toDisplayString(selectedActionData.description)}
                </div>

                <div className="flex gap-3">
                  <span className="font-mono text-xs px-2 py-0.5" style={{
                    background: selectedActionData.success ? 'var(--color-defender-dim)' : 'rgba(100, 100, 100, 0.15)',
                    color: selectedActionData.success ? 'var(--color-defender)' : 'var(--color-text-secondary)',
                  }}>
                    {selectedActionData.success ? 'HIT' : 'MISS'}
                  </span>
                  <span className="font-mono text-xs" style={{ color: 'var(--color-health-low)' }}>
                    -{selectedActionData.healthDamage} HP
                  </span>
                </div>

                <div>
                  <h3 className="font-mono text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                    Reasoning
                  </h3>
                  <p className="font-game text-sm p-3" style={{
                    background: 'var(--color-bg-card)',
                    color: 'var(--color-text-primary)',
                    border: '2px solid var(--color-border)',
                  }}>
                    {toDisplayString(selectedActionData.reasoning)}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {selectedActionData.screenshotBeforeId && (
                    <div>
                      <h3 className="font-mono text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-secondary)' }}>Before</h3>
                      <ScreenshotViewer storageId={selectedActionData.screenshotBeforeId} />
                    </div>
                  )}
                  {selectedActionData.screenshotAfterId && (
                    <div>
                      <h3 className="font-mono text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-secondary)' }}>After</h3>
                      <ScreenshotViewer storageId={selectedActionData.screenshotAfterId} />
                    </div>
                  )}
                </div>

                {selectedActionData.injectionPayload && (
                  <div>
                    <h3 className="font-mono text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                      Injection Payload
                    </h3>
                    <pre className="font-mono text-xs p-3 overflow-x-auto whitespace-pre-wrap code-block" style={{ maxHeight: '400px' }}>
                      {toDisplayString(selectedActionData.injectionPayload)}
                    </pre>
                  </div>
                )}

                {selectedActionData.domSnapshot && (
                  <div>
                    <h3 className="font-mono text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                      DOM Snapshot
                    </h3>
                    <pre className="font-mono text-xs p-3 overflow-x-auto whitespace-pre-wrap code-block" style={{ maxHeight: '300px' }}>
                      {toDisplayString(selectedActionData.domSnapshot)}
                    </pre>
                  </div>
                )}
              </div>
            ) : session.recordingStorageId ? (
              <ScreencastPlayer storageId={session.recordingStorageId} />
            ) : (
              <div className="flex items-center justify-center h-full font-mono text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                Select a step or action to view details
              </div>
            )}
          </div>
        </div>

        {/* Right: Defender Actions — matches DefenderPanel chrome */}
        <div className="flex flex-col h-full w-72 shrink-0 rounded overflow-hidden"
          style={{ border: '2px solid var(--color-defender-border)', background: 'var(--color-bg-panel)' }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{ borderBottom: '2px solid var(--color-defender-dim)' }}>
            <span className="font-display text-sm font-bold tracking-widest neon-red">
              DEFENDER
            </span>
          </div>

          {/* Feed */}
          <div className="flex-1 overflow-y-auto px-3 py-2 feed-scroll">
            {actions?.map((action) => (
              <button
                key={action._id}
                onClick={() => { setSelectedAction(action.actionNumber); setSelectedStep(null); }}
                className="w-full text-left mb-1.5 transition-colors"
              >
                <div
                  className="flex items-center gap-1.5 px-2 py-1 rounded"
                  style={{
                    background: selectedAction === action.actionNumber
                      ? 'rgba(255,0,60,0.15)'
                      : action.success ? 'rgba(255,0,60,0.1)' : 'rgba(255,255,255,0.03)',
                    borderLeft: action.success
                      ? '2px solid var(--color-defender)'
                      : '2px solid var(--color-border)',
                  }}
                >
                  <span className="text-xs font-mono shrink-0 neon-red">#{action.actionNumber}</span>
                  <span className="text-xs font-mono truncate flex-1"
                    style={{ color: action.success ? 'var(--color-defender)' : 'var(--color-text-secondary)' }}>
                    {toDisplayString(action.disruptionName)}
                  </span>
                  {action.success ? (
                    <span className="shrink-0 text-[10px] font-mono font-bold"
                      style={{ color: 'var(--color-health-low)' }}>
                      -{action.healthDamage}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[10px] font-mono"
                      style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }}>
                      BLOCKED
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 shrink-0 text-xs font-mono"
            style={{ borderTop: '1px solid var(--color-defender-dim)', color: 'var(--color-text-secondary)' }}>
            {actions?.filter(a => a.success).length ?? 0} disruptions landed
          </div>
        </div>
      </main>
    </div>
  );
}
