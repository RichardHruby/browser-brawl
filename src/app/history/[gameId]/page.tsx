'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { use, useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import type { Id } from '../../../../convex/_generated/dataModel';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function ScreenshotViewer({ storageId }: { storageId: Id<'_storage'> | undefined }) {
  const url = useQuery(api.screenshots.getUrl, storageId ? { storageId } : 'skip');
  if (!url) return null;
  return (
    <img
      src={url}
      alt="Screenshot"
      className="w-full rounded-lg"
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
      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
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
          className="font-mono text-xs px-3 py-1.5 rounded"
          style={{ background: 'var(--color-bg-card)', color: 'var(--color-attacker)', border: '1px solid var(--color-attacker)' }}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={() => { setFrameIndex(Math.max(0, frameIndex - 1)); setPlaying(false); }}
          className="font-mono text-xs px-2 py-1.5 rounded"
          style={{ background: 'var(--color-bg-card)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}
        >
          Prev
        </button>
        <button
          onClick={() => { setFrameIndex(Math.min(recording.frames.length - 1, frameIndex + 1)); setPlaying(false); }}
          className="font-mono text-xs px-2 py-1.5 rounded"
          style={{ background: 'var(--color-bg-card)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}
        >
          Next
        </button>

        {/* Speed selector */}
        {[1, 2, 4].map(s => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            className="font-mono text-[10px] px-2 py-1 rounded"
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
        <Link href="/history" className="font-mono text-sm neon-cyan">Back to History</Link>
      </div>
    );
  }

  const selectedStepData = selectedStep != null ? steps?.find(s => s.stepNumber === selectedStep) : null;
  const selectedActionData = selectedAction != null ? actions?.find(a => a.actionNumber === selectedAction) : null;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg-deep)' }}>
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div>
          <div className="flex items-center gap-4">
            <Link href="/history" className="font-mono text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              &larr; History
            </Link>
            <h1 className="font-display text-xl font-black tracking-wider neon-cyan">
              {session.taskLabel}
            </h1>
          </div>
          <div className="flex gap-4 mt-1 font-mono text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            <span>ID: {session.gameId}</span>
            <span>{session.mode}</span>
            <span style={{ color: session.difficulty === 'easy' ? '#22c55e' : session.difficulty === 'nightmare' ? '#a855f7' : '#f59e0b' }}>
              {session.difficulty}
            </span>
            <span>
              Winner: <span className={session.winner === 'attacker' ? 'neon-cyan' : 'neon-red'}>
                {session.winner === 'attacker' ? 'Mouse' : session.winner === 'defender' ? 'Cat' : '—'}
              </span>
            </span>
            <span>{session.winReason?.replace(/_/g, ' ')}</span>
            {session.durationSeconds && <span>{session.durationSeconds}s</span>}
            {session.healthFinal != null && <span>HP: {Math.round(session.healthFinal)}%</span>}
          </div>
        </div>
      </div>

      {/* Health bar */}
      {healthTimeline && healthTimeline.length > 0 && (
        <div className="px-6 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs" style={{ color: 'var(--color-text-secondary)' }}>Health:</span>
            <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'var(--color-bg-card)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${session.healthFinal ?? 100}%`,
                  background: (session.healthFinal ?? 100) > 50 ? '#22c55e' : (session.healthFinal ?? 100) > 20 ? '#f59e0b' : '#ef4444',
                }}
              />
            </div>
            <span className="font-mono text-xs" style={{ color: 'var(--color-text-primary)' }}>
              {Math.round(session.healthFinal ?? 100)}%
            </span>
          </div>
          {/* Health timeline markers */}
          <div className="flex gap-2 mt-2 flex-wrap">
            {healthTimeline.map((h, i) => (
              <span key={i} className="font-mono text-[10px] px-1.5 py-0.5 rounded" style={{
                background: 'var(--color-bg-card)',
                color: h.delta < 0 ? '#ef4444' : '#22c55e',
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
        <div className="w-80 flex-shrink-0 overflow-y-auto feed-scroll" style={{ borderRight: '1px solid var(--color-border)' }}>
          <div className="px-4 py-3 font-mono text-xs uppercase tracking-wider sticky top-0" style={{
            color: 'var(--color-attacker)',
            background: 'var(--color-bg-deep)',
            borderBottom: '1px solid var(--color-border)',
          }}>
            Attacker Steps ({steps?.length ?? 0})
          </div>
          {steps?.map((step) => (
            <button
              key={step._id}
              onClick={() => { setSelectedStep(step.stepNumber); setSelectedAction(null); }}
              className="w-full text-left px-4 py-3 transition-colors"
              style={{
                borderBottom: '1px solid var(--color-border)',
                background: selectedStep === step.stepNumber ? 'rgba(0,212,255,0.1)' : 'transparent',
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
                  background: 'rgba(0,212,255,0.15)',
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
                  <pre className="font-mono text-xs p-3 rounded-lg overflow-x-auto" style={{
                    background: 'var(--color-bg-card)',
                    color: 'var(--color-text-primary)',
                    border: '1px solid var(--color-border)',
                  }}>
                    {(() => { try { return JSON.stringify(JSON.parse(selectedStepData.toolInput!), null, 2); } catch { return selectedStepData.toolInput; } })()}
                  </pre>
                </div>
              )}

              {selectedStepData.toolResultSummary && (
                <div>
                  <h3 className="font-mono text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                    Result
                  </h3>
                  <pre className="font-mono text-xs p-3 rounded-lg overflow-x-auto whitespace-pre-wrap" style={{
                    background: 'var(--color-bg-card)',
                    color: 'var(--color-text-primary)',
                    border: '1px solid var(--color-border)',
                    maxHeight: '300px',
                  }}>
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
                  <div className="max-h-64 overflow-y-auto feed-scroll rounded-lg" style={{
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border)',
                  }}>
                    {(JSON.parse(selectedStepData.domSnapshot) as Array<{ tag: string; text: string; id?: string; pos: { x: number; y: number; w: number; h: number } }>).map((el, i) => (
                      <div key={i} className="px-3 py-1.5 font-mono text-[11px] flex gap-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <span style={{ color: 'var(--color-attacker)' }}>&lt;{el.tag}&gt;</span>
                        {el.id && <span style={{ color: '#f59e0b' }}>#{el.id}</span>}
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
                  background: selectedActionData.success ? 'rgba(239,68,68,0.2)' : 'rgba(100,100,100,0.2)',
                  color: selectedActionData.success ? '#ef4444' : '#888',
                }}>
                  {selectedActionData.success ? 'HIT' : 'MISS'}
                </span>
                <span className="font-mono text-xs" style={{ color: '#ef4444' }}>
                  -{selectedActionData.healthDamage} HP
                </span>
              </div>

              {/* Reasoning */}
              <div>
                <h3 className="font-mono text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                  Reasoning
                </h3>
                <p className="font-game text-sm p-3 rounded-lg" style={{
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
                  <pre className="font-mono text-xs p-3 rounded-lg overflow-x-auto whitespace-pre-wrap" style={{
                    background: 'var(--color-bg-card)',
                    color: 'var(--color-text-primary)',
                    border: '1px solid var(--color-border)',
                    maxHeight: '400px',
                  }}>
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
                  <pre className="font-mono text-xs p-3 rounded-lg overflow-x-auto whitespace-pre-wrap" style={{
                    background: 'var(--color-bg-card)',
                    color: 'var(--color-text-primary)',
                    border: '1px solid var(--color-border)',
                    maxHeight: '300px',
                  }}>
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
        <div className="w-80 flex-shrink-0 overflow-y-auto feed-scroll" style={{ borderLeft: '1px solid var(--color-border)' }}>
          <div className="px-4 py-3 font-mono text-xs uppercase tracking-wider sticky top-0" style={{
            color: 'var(--color-defender)',
            background: 'var(--color-bg-deep)',
            borderBottom: '1px solid var(--color-border)',
          }}>
            Defender Actions ({actions?.length ?? 0})
          </div>
          {actions?.map((action) => (
            <button
              key={action._id}
              onClick={() => { setSelectedAction(action.actionNumber); setSelectedStep(null); }}
              className="w-full text-left px-4 py-3 transition-colors"
              style={{
                borderBottom: '1px solid var(--color-border)',
                background: selectedAction === action.actionNumber ? 'rgba(255,0,60,0.1)' : 'transparent',
              }}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs neon-red">#{action.actionNumber}</span>
                <span className="font-mono text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                  {formatTime(action.timestamp)}
                </span>
                <span className="font-mono text-[10px] px-1 rounded" style={{
                  color: action.success ? '#ef4444' : '#666',
                  background: action.success ? 'rgba(239,68,68,0.15)' : 'rgba(100,100,100,0.1)',
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
