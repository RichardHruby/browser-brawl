import { getSession } from './game-session-store';
import { runAttackerLoop as runPlaywright } from './attacker-playwright';
import { runAttackerLoop as runStagehand } from './attacker-stagehand';

/**
 * Run the attacker agent loop using the selected mode.
 * Delegates to either Playwright MCP or Stagehand implementation.
 */
export async function runAttackerLoop(gameId: string, signal: AbortSignal): Promise<void> {
  const session = getSession(gameId);
  if (!session) return;

  if (session.attackerMode === 'stagehand') {
    return runStagehand(gameId, signal);
  }
  return runPlaywright(gameId, signal);
}
