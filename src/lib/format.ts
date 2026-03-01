import { REASON_LABELS } from './constants';

/**
 * Format seconds as "Xm Ys" or "Xs" for display.
 */
export function formatDuration(seconds: number | undefined): string {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/**
 * Format ISO timestamp as "HH:MM:SS" for step/action timestamps.
 */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Format ISO timestamp as "Mon DD, HH:MM" for session list.
 */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get the hex color for health based on current value.
 * Returns raw hex (not CSS var) so it can be used with hex opacity suffixes.
 */
export function getHealthColor(health: number): string {
  if (health > 50) return '#00ff88';
  if (health > 20) return '#ffaa00';
  return '#ff2200';
}

/**
 * Format a win reason string for display.
 */
export function formatWinReason(reason: string | null | undefined): string {
  if (!reason) return '—';
  return REASON_LABELS[reason] ?? reason.replace(/_/g, ' ');
}

const MODEL_DISPLAY: Record<string, string> = {
  'claude-sonnet-4-20250514': 'Sonnet 4',
  'claude-haiku-4-5-20251001': 'Haiku 4.5',
  'claude-opus-4-20250514': 'Opus 4',
};

export function formatModel(model: string | undefined): string {
  if (!model) return '—';
  return MODEL_DISPLAY[model] ?? model;
}
