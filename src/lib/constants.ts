import type { Difficulty, AttackerStatus, DefenderStatus, AttackerType } from '@/types/game';

// ── Difficulty colors (canonical neon palette) ──

export const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  easy:      '#00ff88',
  medium:    '#ffaa00',
  hard:      '#ff6600',
  nightmare: '#ff003c',
};

// ── Agent status labels & colors ──

export const ATTACKER_STATUS_LABELS: Record<AttackerStatus, string> = {
  idle:     'IDLE',
  thinking: 'THINKING',
  acting:   'ACTING',
  complete: 'DONE',
  failed:   'FAILED',
};

// Raw hex values (not CSS vars) because these are used with hex opacity suffixes
// in badge backgrounds/borders (e.g. `${color}22`, `${color}44`).
export const ATTACKER_STATUS_COLORS: Record<AttackerStatus, string> = {
  idle:     '#6e6e99',
  thinking: '#ffaa00',
  acting:   '#00d4ff',
  complete: '#00ff88',
  failed:   '#ff2200',
};

export const DEFENDER_STATUS_LABELS: Record<DefenderStatus, string> = {
  idle:         'IDLE',
  plotting:     'PLOTTING',
  striking:     'STRIKING',
  cooling_down: 'COOLING',
};

// Raw hex values (not CSS vars) because these are used with hex opacity suffixes
// in badge backgrounds/borders (e.g. `${color}22`, `${color}44`).
export const DEFENDER_STATUS_COLORS: Record<DefenderStatus, string> = {
  idle:         '#6e6e99',
  plotting:     '#cc44ff',
  striking:     '#ff003c',
  cooling_down: '#ffaa00',
};

// ── Attacker type labels & colors (must match lobby fighter cards) ──

export const ATTACKER_TYPE_LABELS: Record<AttackerType, string> = {
  'playwright-mcp': 'Playwright MCP',
  'stagehand':      'Stagehand',
  'browser-use':    'Browser-Use',
  'finetuned':      'Custom Model',
};

export const ATTACKER_TYPE_COLORS: Record<AttackerType, string> = {
  'playwright-mcp': '#22cc44',
  'browser-use':    '#dd8800',
  'stagehand':      '#ccaa00',
  'finetuned':      '#aa44ff',
};

// ── Win reason labels ──

export const REASON_LABELS: Record<string, string> = {
  task_complete:   'Task completed successfully',
  health_depleted: 'Attacker health depleted',
  aborted:         'Battle aborted',
};

// ── Winner labels (compact, for tables) ──

export const WINNER_SHORT: Record<'attacker' | 'defender', string> = {
  attacker: 'Attacker',
  defender: 'Defender',
};

// ── Disruption icons ──

export const DISRUPTION_ICONS: Record<string, string> = {
  'popup-overlay':        '🪤',
  'fake-loading-spinner': '⏳',
  'button-camouflage':    '👻',
  'scroll-hijack':        '🌀',
  'modal-dialog':         '💬',
  'element-removal':      '💀',
  'animation-flood':      '⚡',
  'coordinated-assault':  '☠️',
  'custom-injection':     '🎯',
};
