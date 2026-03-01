'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import Link from 'next/link';
import { useState } from 'react';
import { formatDuration } from '@/lib/format';

type JobStatus = 'preparing' | 'uploading' | 'training' | 'merging' | 'deploying' | 'ready' | 'failed';

const STATUS_COLORS: Record<JobStatus, string> = {
  preparing: '#f59e0b',
  uploading: '#f59e0b',
  training: '#3b82f6',
  merging: '#8b5cf6',
  deploying: '#8b5cf6',
  ready: '#22c55e',
  failed: '#ef4444',
};

const STATUS_LABELS: Record<JobStatus, string> = {
  preparing: 'Preparing data...',
  uploading: 'Uploading to Modal...',
  training: 'Training',
  merging: 'Merging LoRA weights...',
  deploying: 'Deploying model...',
  ready: 'Ready',
  failed: 'Failed',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="font-mono text-[10px] px-1.5 py-0.5 rounded transition-all duration-200 shrink-0"
      style={{
        background: copied ? '#cc44ff20' : 'transparent',
        color: copied ? '#cc44ff' : 'var(--color-text-secondary)',
        border: `1px solid ${copied ? '#cc44ff' : 'var(--color-border)'}`,
      }}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export default function TrainingPage() {
  const jobs = useQuery(api.training.list);

  return (
    <div
      className="boxy-ui min-h-screen flex flex-col px-6 py-8"
      style={{ background: 'var(--color-bg-deep)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-black tracking-widest" style={{ color: '#cc44ff' }}>
            TRAINING EXPERIMENTS
          </h1>
          <p className="font-game text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            Fine-tuning pipeline &middot; Qwen2.5-3B
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
            Traces
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

      {/* Jobs list */}
      {jobs === undefined ? (
        <div className="text-center py-20 font-mono" style={{ color: 'var(--color-text-secondary)' }}>
          Loading...
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-20">
          <p className="font-mono text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            No training experiments yet.
          </p>
          <p className="font-mono text-xs mt-2" style={{ color: 'var(--color-text-secondary)' }}>
            Select games on the{' '}
            <Link href="/history" className="neon-cyan underline">traces page</Link>
            {' '}and click &quot;Kickoff Finetune&quot;.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => {
            const status = job.status as JobStatus;
            const color = STATUS_COLORS[status] ?? '#888';
            const isActive = status === 'training' || status === 'merging' || status === 'preparing' || status === 'uploading' || status === 'deploying';
            const progress = job.totalSteps && job.currentStep
              ? Math.round((job.currentStep / job.totalSteps) * 100)
              : null;

            return (
              <div
                key={job._id}
                className="rounded-xl p-5 transition-all"
                style={{
                  background: 'var(--color-bg-panel)',
                  border: `2px solid ${isActive ? color : 'var(--color-border)'}`,
                  boxShadow: isActive ? `0 0 20px ${color}30` : 'none',
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left: name + status */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <h2 className="font-mono text-sm font-bold truncate" style={{ color: 'var(--color-text-primary)' }}>
                        {job.experimentName}
                      </h2>
                      <span
                        className="font-mono text-xs px-2 py-0.5 rounded shrink-0"
                        style={{ color, background: `${color}20` }}
                      >
                        {isActive && (
                          <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 animate-pulse" style={{ background: color }} />
                        )}
                        {STATUS_LABELS[status]}
                      </span>
                    </div>

                    {/* Meta row */}
                    <div className="flex gap-4 mt-2 font-mono text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                      <span>{job.gameCount} game{job.gameCount !== 1 ? 's' : ''}</span>
                      <span>{job.textOnly ? 'Qwen2.5-3B-Instruct' : 'Qwen2.5-VL-3B-Instruct'}</span>
                      <span>{timeAgo(job.startedAt)}</span>
                      {job.completedAt && (
                        <span>
                          Completed {timeAgo(job.completedAt)}
                        </span>
                      )}
                    </div>

                    {/* Progress bar */}
                    {status === 'training' && progress !== null && (
                      <div className="mt-3">
                        <div className="flex justify-between font-mono text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                          <span>Step {job.currentStep} / {job.totalSteps}</span>
                          {job.currentLoss != null && <span>Loss: {job.currentLoss}</span>}
                        </div>
                        <div
                          className="h-1.5 rounded-full overflow-hidden"
                          style={{ background: 'var(--color-bg-card)' }}
                        >
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${progress}%`,
                              background: `linear-gradient(90deg, ${color}, #cc44ff)`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Error message */}
                    {status === 'failed' && job.error && (
                      <div
                        className="mt-3 font-mono text-xs p-2 rounded"
                        style={{ background: '#ef444415', color: '#ef4444', border: '1px solid #ef444430' }}
                      >
                        {job.error}
                      </div>
                    )}
                  </div>

                  {/* Right: output info */}
                  {status === 'ready' && (
                    <div className="flex flex-col gap-2 shrink-0 max-w-[420px]">
                      {job.serveUrl && (
                        <div
                          className="font-mono text-xs p-2 rounded"
                          style={{ background: '#cc44ff10', border: '1px solid #cc44ff30' }}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold" style={{ color: '#cc44ff' }}>Serve URL</span>
                            <CopyButton text={job.serveUrl} />
                          </div>
                          <div className="break-all" style={{ color: 'var(--color-text-primary)' }}>{job.serveUrl}</div>
                          <div className="mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                            First request cold-starts (~2min)
                          </div>
                        </div>
                      )}
                      <div
                        className="font-mono text-xs p-2 rounded"
                        style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                      >
                        <div className="font-bold mb-1" style={{ color: 'var(--color-text-secondary)' }}>Model path</div>
                        <div style={{ color: 'var(--color-text-primary)' }}>
                          /checkpoints/experiments/{job.experimentName}/merged_model
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
