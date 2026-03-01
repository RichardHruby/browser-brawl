import { runAttackerLoop as runPlaywright } from './attacker-playwright';

/**
 * Run the local attacker loop (Playwright MCP).
 * Browser-use attacker runs through a separate loop in start/route.ts.
 */
export async function runAttackerLoop(gameId: string, signal: AbortSignal): Promise<void> {
  return runPlaywright(gameId, signal);
}
