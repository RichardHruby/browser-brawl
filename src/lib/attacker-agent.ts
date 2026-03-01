import { getSession } from './game-session-store';
import { runAttackerLoop as runPlaywright } from './attacker-playwright';
import { runAttackerLoop as runBrowserbase } from './attacker-stagehand';

/**
 * Run the local attacker loop based on the selected attacker type.
 * Browser-use attacker runs through a separate loop in start/route.ts.
 */
export async function runAttackerLoop(gameId: string, signal: AbortSignal): Promise<void> {
  const session = getSession(gameId);
  if (!session) return;

  if (session.attackerType === 'browserbase') {
    return runBrowserbase(gameId, signal);
  }

  return runPlaywright(gameId, signal);
}
