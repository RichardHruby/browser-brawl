'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { use, useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { Difficulty } from '@/types/game';
import { DIFFICULTY_COLORS, WINNER_SHORT } from '@/lib/constants';
import { formatTime, formatDuration, formatWinReason } from '@/lib/format';
import { HealthBar } from '@/components/arena/HealthBar';

function ScreenshotViewer({ storageId }: { storageId: Id<'_storage'> | undefined }) {
  const url = useQuery(api.screenshots.getUrl, storageId ? { storageId } : 'skip');
  if (!url) return null;
  return (
    <img
      src={url}
      alt="Screenshot"
      className="w-full rounded"
      style={{ border: '1px solid var(--color-border)' }}
    />
  );
}

interface RecordingData {
  fps: number;
  duration: number;
  frameCount: number;
  frames: { t: number; d: string }[];
}

function ScreencastPlayer({ storageId }: { storageId: Id<'_storage'> }) {
  const url = useQuery(api.screenshots.getUrl, { storageId });
  const [recording, setRecording] = useState<RecordingData | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch and parse recording data
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

  // Playback timer
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
    <div className="space-y-3">
      <div className="rounded overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
        {frame && (
          <img
            src={`data:image/jpeg;base64,${frame.d}`}
            alt={`Frame ${frameIndex + 1}`}
            className="w-full"
          />
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setPlaying(!playing)}
          className="font-display text-xs font-bold tracking-widest uppercase px-3 py-1.5 rounded transition-all duration-200 hover:scale-105"
          style={{ background: 'var(--color-bg-card)', color: 'var(--color-attacker)', border: '1px solid var(--color-attacker)' }}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={() => { setFrameIndex(Math.max(0, frameIndex - 1)); setPlaying(false); }}
          className="font-mono text-xs px-2 py-1.5 rounded transition-colors"
          style={{ background: 'var(--color-bg-card)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}
        >
          Prev
        </button>
        <button
          onClick={() => { setFrameIndex(Math.min(recording.frames.length - 1, frameIndex + 1)); setPlaying(false); }}
          className="font-mono text-xs px-2 py-1.5 rounded transition-colors"
          style={{ background: 'var(--color-bg-card)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}
        >
          Next
        </button>

        {/* Speed selector */}
        {[1, 2, 4].map(s => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            className="font-mono text-[10px] px-2 py-1 rounded transition-colors"
            style={{
              background: speed === s ? 'var(--color-attacker)' : 'var(--color-bg-card)',
              color: speed === s ? '#000' : 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
            }}
          >
            {s}x
          </button>
        ))}

        {/* Scrubber */}
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
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: 'var(--color-bg-deep)' }}>
        <span className="font-mono text-lg" style={{ color: 'var(--color-text-secondary)' }}>Session not found</span>
        <Link href="/history" className="font-display text-xs font-bold tracking-widest uppercase px-4 py-2 rounded transition-all duration-200 hover:scale-105 neon-cyan"
          style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          Back to History
        </Link>
      </div>
    );
  }

  const diffColor = DIFFICULTY_COLORS[session.difficulty as Difficulty];
  const selectedStepData = selectedStep != null ? steps?.find(s => s.stepNumber === selectedStep) : null;
  const selectedActionData = selectedAction != null ? actions?.find(a => a.actionNumber === selectedAction) : null;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg-deep)' }}>
      {/* Header — matches arena header style */}
      <div className="px-4 py-3 flex items-center justify-between shrink-0"
        style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-panel)' }}>
        <div className="flex items-center gap-4">
          <Link href="/history"
            className="font-display text-xs font-bold tracking-widest uppercase px-3 py-1.5 rounded transition-all duration-200 hover:scale-105"
            style={{ background: 'var(--color-bg-card)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
            &larr; HISTORY
          </Link>
          <h1 className="font-display text-lg font-black tracking-wider neon-cyan">
            {session.taskLabel}
          </h1>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          <span>{session.mode}</span>
          <span className="px-1.5 py-0.5 rounded uppercase text-[10px]"
            style={{ color: diffColor, background: `${diffColor}18` }}>
            {session.difficulty}
          </span>
          {session.winner && (
            <span>
              Winner: <span className={session.winner === 'attacker' ? 'neon-cyan' : 'neon-red'}>
                {WINNER_SHORT[session.winner as 'attacker' | 'defender']}
              </span>
            </span>
          )}
          <span>{formatWinReason(session.winReason)}</span>
          {session.durationSeconds && <span>{formatDuration(session.durationSeconds)}</span>}
        </div>
      </div>

      {/* Health bar */}
      {healthTimeline && healthTimeline.length > 0 && (
        <div className="px-4 py-2 shrink-0" style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-panel)' }}>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs" style={{ color: 'var(--color-text-secondary)' }}>HP</span>
            <HealthBar health={session.healthFinal ?? 100} variant="static" />
          </div>
          {/* Health timeline markers */}
          <div className="flex gap-2 mt-1.5 flex-wrap">
            {healthTimeline.map((h, i) => (
              <span key={i} className="font-mono text-[10px] px-1.5 py-0.5 rounded" style={{
                background: 'var(--color-bg-card)',
                color: h.delta < 0 ? 'var(--color-health-low)' : 'var(--color-health-high)',
              }}>
                {h.delta > 0 ? '+' : ''}{h.delta} ({h.cause})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Three-column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Attacker Steps */}
        <div className="w-80 flex-shrink-0 overflow-y-auto feed-scroll"
          style={{ borderRight: '1px solid var(--color-border)', background: 'var(--color-bg-panel)' }}>
          <div className="px-4 py-3 font-display text-xs font-bold tracking-widest sticky top-0 shrink-0"
            style={{
              background: 'var(--color-bg-panel)',
              borderBottom: '1px solid var(--color-attacker-border)',
            }}>
            <span className="neon-cyan">⚔ ATTACKER STEPS</span>
            <span className="font-mono text-[10px] ml-2" style={{ color: 'var(--color-text-secondary)' }}>
              ({steps?.length ?? 0})
            </span>
          </div>
          {steps?.map((step) => (
            <button
              key={step._id}
              onClick={() => { setSelectedStep(step.stepNumber); setSelectedAction(null); }}
              className="w-full text-left px-4 py-3 transition-colors"
              style={{
                borderBottom: '1px solid var(--color-border)',
                background: selectedStep === step.stepNumber ? 'var(--color-attacker-dim)' : 'transparent',
              }}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs neon-cyan">#{step.stepNumber}</span>
                <span className="font-mono text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                  {formatTime(step.timestamp)}
                </span>
              </div>
              <div className="font-game text-sm mt-1 truncate" style={{ color: 'var(--color-text-primary)' }}>
                {step.description}
              </div>
              {step.toolName && (
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded mt-1 inline-block" style={{
                  background: 'var(--color-attacker-dim)',
                  color: 'var(--color-attacker)',
                }}>
                  {step.toolName}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Center: Detail viewer */}
        <div className="flex-1 overflow-y-auto feed-scroll p-6">
          {selectedStepData ? (
            <div className="space-y-4">
              <h2 className="font-display text-lg font-bold neon-cyan">
                Step #{selectedStepData.stepNumber}: {selectedStepData.toolName ?? 'Text Response'}
              </h2>
              <div className="font-game text-sm" style={{ color: 'var(--color-text-primary)' }}>
                {selectedStepData.description}
              </div>

              {/* Screenshot */}
              {selectedStepData.screenshotBeforeId && (
                <div>
                  <h3 className="font-mono text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                    Page State (Before)
                  </h3>
                  <ScreenshotViewer storageId={selectedStepData.screenshotBeforeId} />
                </div>
              )}

              {/* Tool details */}
              {selectedStepData.toolInput && (
                <div>
                  <h3 className="font-mono text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                    Tool Input
                  </h3>
                  <pre className="font-mono text-xs p-3 rounded overflow-x-auto code-block">
                    {(() => { try { return JSON.stringify(JSON.parse(selectedStepData.toolInput!), null, 2); } catch { return selectedStepData.toolInput; } })()}
                  </pre>
                </div>
              )}

              {selectedStepData.toolResultSummary && (
                <div>
                  <h3 className="font-mono text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                    Result
                  </h3>
                  <pre className="font-mono text-xs p-3 rounded overflow-x-auto whitespace-pre-wrap code-block" style={{ maxHeight: '300px' }}>
                    {selectedStepData.toolResultSummary}
                  </pre>
                </div>
              )}

              {/* DOM Snapshot */}
              {selectedStepData.domSnapshot && (
                <div>
                  <h3 className="font-mono text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                    DOM Snapshot ({JSON.parse(selectedStepData.domSnapshot).length} elements)
                  </h3>
                  <div className="max-h-64 overflow-y-auto feed-scroll rounded" style={{
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border)',
                  }}>
                    {(JSON.parse(selectedStepData.domSnapshot) as Array<{ tag: string; text: string; id?: string; pos: { x: number; y: number; w: number; h: number } }>).map((el, i) => (
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
                Disruption #{selectedActionData.actionNumber}: {selectedActionData.disruptionName}
              </h2>
              <div className="font-game text-sm" style={{ color: 'var(--color-text-primary)' }}>
                {selectedActionData.description}
              </div>

              <div className="flex gap-3">
                <span className="font-mono text-xs px-2 py-0.5 rounded" style={{
                  background: selectedActionData.success ? 'var(--color-defender-dim)' : 'rgba(100, 100, 100, 0.15)',
                  color: selectedActionData.success ? 'var(--color-defender)' : 'var(--color-text-secondary)',
                }}>
                  {selectedActionData.success ? 'HIT' : 'MISS'}
                </span>
                <span className="font-mono text-xs" style={{ color: 'var(--color-health-low)' }}>
                  -{selectedActionData.healthDamage} HP
                </span>
              </div>

              {/* Reasoning */}
              <div>
                <h3 className="font-mono text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                  Reasoning
                </h3>
                <p className="font-game text-sm p-3 rounded" style={{
                  background: 'var(--color-bg-card)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border)',
                }}>
                  {selectedActionData.reasoning}
                </p>
              </div>

              {/* Before/After Screenshots */}
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

              {/* Injection Payload */}
              {selectedActionData.injectionPayload && (
                <div>
                  <h3 className="font-mono text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                    Injection Payload
                  </h3>
                  <pre className="font-mono text-xs p-3 rounded overflow-x-auto whitespace-pre-wrap code-block" style={{ maxHeight: '400px' }}>
                    {selectedActionData.injectionPayload}
                  </pre>
                </div>
              )}

              {/* DOM Snapshot */}
              {selectedActionData.domSnapshot && (
                <div>
                  <h3 className="font-mono text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                    DOM Snapshot
                  </h3>
                  <pre className="font-mono text-xs p-3 rounded overflow-x-auto whitespace-pre-wrap code-block" style={{ maxHeight: '300px' }}>
                    {selectedActionData.domSnapshot}
                  </pre>
                </div>
              )}
            </div>
          ) : session.recordingStorageId ? (
            <div className="space-y-4">
              <h2 className="font-display text-lg font-bold neon-cyan">Session Recording</h2>
              <ScreencastPlayer storageId={session.recordingStorageId} />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full font-mono text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Select a step or action to view details
            </div>
          )}
        </div>

        {/* Right: Defender Actions */}
        <div className="w-80 flex-shrink-0 overflow-y-auto feed-scroll"
          style={{ borderLeft: '1px solid var(--color-border)', background: 'var(--color-bg-panel)' }}>
          <div className="px-4 py-3 font-display text-xs font-bold tracking-widest sticky top-0 shrink-0"
            style={{
              background: 'var(--color-bg-panel)',
              borderBottom: '1px solid var(--color-defender-border)',
            }}>
            <span className="neon-red">DEFENDER ACTIONS 🛡</span>
            <span className="font-mono text-[10px] ml-2" style={{ color: 'var(--color-text-secondary)' }}>
              ({actions?.length ?? 0})
            </span>
          </div>
          {actions?.map((action) => (
            <button
              key={action._id}
              onClick={() => { setSelectedAction(action.actionNumber); setSelectedStep(null); }}
              className="w-full text-left px-4 py-3 transition-colors"
              style={{
                borderBottom: '1px solid var(--color-border)',
                background: selectedAction === action.actionNumber ? 'var(--color-defender-dim)' : 'transparent',
              }}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs neon-red">#{action.actionNumber}</span>
                <span className="font-mono text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                  {formatTime(action.timestamp)}
                </span>
                <span className="font-mono text-[10px] px-1 rounded" style={{
                  color: action.success ? 'var(--color-defender)' : 'var(--color-text-secondary)',
                  background: action.success ? 'var(--color-defender-dim)' : 'rgba(100, 100, 100, 0.1)',
                }}>
                  {action.success ? 'HIT' : 'MISS'}
                </span>
              </div>
              <div className="font-game text-sm mt-1 truncate" style={{ color: 'var(--color-text-primary)' }}>
                {action.disruptionName}
              </div>
              <div className="font-game text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-secondary)' }}>
                {action.reasoning}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
