/**
 * Curated MiniWob++ task list for evaluating fine-tuned browser agents.
 *
 * Tasks selected for relevance to Browser Brawl training data:
 * click, type, form fill, navigation, and multi-step workflows.
 */

export interface MiniwobTask {
  id: string;
  category: 'click' | 'type' | 'form' | 'multi-step' | 'navigation';
  difficulty: 'easy' | 'medium' | 'hard';
  maxSteps: number;
}

export const MINIWOB_TASKS: MiniwobTask[] = [
  // ── Click tasks ─────────────────────────────────────────────────
  { id: 'click-button',           category: 'click', difficulty: 'easy',   maxSteps: 5 },
  { id: 'click-link',             category: 'click', difficulty: 'easy',   maxSteps: 5 },
  { id: 'click-dialog',           category: 'click', difficulty: 'easy',   maxSteps: 8 },
  { id: 'click-dialog-2',         category: 'click', difficulty: 'easy',   maxSteps: 8 },
  { id: 'click-tab-2',            category: 'click', difficulty: 'medium', maxSteps: 10 },
  { id: 'click-checkboxes',       category: 'click', difficulty: 'medium', maxSteps: 15 },
  { id: 'click-collapsible-2',    category: 'click', difficulty: 'medium', maxSteps: 10 },
  { id: 'click-menu',             category: 'click', difficulty: 'medium', maxSteps: 10 },
  { id: 'click-option',           category: 'click', difficulty: 'easy',   maxSteps: 8 },

  // ── Type tasks ──────────────────────────────────────────────────
  { id: 'enter-text',             category: 'type', difficulty: 'easy',   maxSteps: 8 },
  { id: 'enter-text-2',           category: 'type', difficulty: 'easy',   maxSteps: 8 },
  { id: 'enter-password',         category: 'type', difficulty: 'easy',   maxSteps: 8 },
  { id: 'enter-date',             category: 'type', difficulty: 'medium', maxSteps: 10 },
  { id: 'focus-text',             category: 'type', difficulty: 'easy',   maxSteps: 5 },
  { id: 'focus-text-2',           category: 'type', difficulty: 'easy',   maxSteps: 5 },

  // ── Form / login tasks ─────────────────────────────────────────
  { id: 'login-user',             category: 'form', difficulty: 'medium', maxSteps: 12 },
  { id: 'login-user-popup',       category: 'form', difficulty: 'medium', maxSteps: 12 },
  { id: 'search-engine',          category: 'form', difficulty: 'medium', maxSteps: 10 },
  { id: 'use-autocomplete',       category: 'form', difficulty: 'hard',   maxSteps: 15 },

  // ── Multi-step tasks ───────────────────────────────────────────
  { id: 'email-inbox',            category: 'multi-step', difficulty: 'hard', maxSteps: 20 },
  { id: 'social-media',           category: 'multi-step', difficulty: 'hard', maxSteps: 20 },
  { id: 'book-flight',            category: 'multi-step', difficulty: 'hard', maxSteps: 25 },

  // ── Navigation tasks ───────────────────────────────────────────
  { id: 'navigate-tree',          category: 'navigation', difficulty: 'medium', maxSteps: 15 },
  { id: 'choose-date',            category: 'navigation', difficulty: 'medium', maxSteps: 12 },
];

export const TASK_IDS = MINIWOB_TASKS.map(t => t.id);

export function getTask(id: string): MiniwobTask | undefined {
  return MINIWOB_TASKS.find(t => t.id === id);
}

export function getTasksByCategory(category: MiniwobTask['category']): MiniwobTask[] {
  return MINIWOB_TASKS.filter(t => t.category === category);
}

export function getTasksByDifficulty(difficulty: MiniwobTask['difficulty']): MiniwobTask[] {
  return MINIWOB_TASKS.filter(t => t.difficulty === difficulty);
}
