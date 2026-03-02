/**
 * Extract training data from Convex.
 *
 * Pulls successful game conversations + metadata and writes raw JSONL
 * (one trajectory per line) to stdout or a file.
 *
 * Usage:
 *   npx tsx scripts/extract-training-data.ts                     # all successful games
 *   npx tsx scripts/extract-training-data.ts --game dCM7YB1y8s   # single game
 *   npx tsx scripts/extract-training-data.ts -o data/raw.jsonl   # write to file
 */

import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
import type { Id } from '../convex/_generated/dataModel';
import * as fs from 'fs';
import * as path from 'path';

// ── CLI args ───────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

const GAME_ID = flag('--game');
const OUTPUT_FILE = flag('-o') || flag('--output');
const CONVEX_URL =
  process.env.NEXT_PUBLIC_CONVEX_URL ||
  'https://standing-lark-465.convex.cloud';

// ── Types ──────────────────────────────────────────────────────────

interface RawTrajectory {
  gameId: string;
  task: {
    description: string;
    startUrl?: string;
    difficulty: string;
  };
  winner: string;
  winReason: string;
  durationMs: number;
  messages: unknown[]; // full Anthropic messages array
  toolDefinitions: unknown[]; // Anthropic tool schemas
  steps: {
    stepNumber: number;
    toolName?: string;
    screenshotBeforeId?: string;
    screenshotUrl?: string;
  }[];
  defenderActions: {
    actionNumber: number;
    disruptionId: string;
    disruptionName: string;
    description: string;
  }[];
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  const client = new ConvexHttpClient(CONVEX_URL);
  console.error(`[extract] Connected to Convex: ${CONVEX_URL}`);

  // 1. Get game sessions
  let sessions: Array<{
    _id: string;
    gameId: string;
    taskDescription?: string;
    taskStartUrl?: string;
    difficulty?: string;
    winner?: string;
    winReason?: string;
    durationSeconds?: number;
  }>;

  if (GAME_ID) {
    // Single game mode
    const session = await client.query(api.sessions.get, {
      gameId: GAME_ID,
    });
    if (!session) {
      console.error(`[extract] Game ${GAME_ID} not found`);
      process.exit(1);
    }
    sessions = [session];
    console.error(`[extract] Single game mode: ${GAME_ID}`);
  } else {
    // All successful games
    sessions = await client.query(api.sessions.listSuccessful, {});
    console.error(`[extract] Found ${sessions.length} successful games`);
  }

  // 2. Process each session
  const trajectories: RawTrajectory[] = [];

  for (const session of sessions) {
    const gameId = session.gameId;
    console.error(`[extract] Processing game ${gameId}...`);

    // Fetch latest conversation (the last row has the complete conversation)
    const conversation = await client.query(
      api.conversations.getLatestForSession,
      { gameId },
    );

    if (!conversation) {
      console.error(`[extract]   SKIP — no conversation data for ${gameId}`);
      continue;
    }

    // Fetch attacker steps (for screenshot IDs)
    const steps = await client.query(api.steps.getStepsForSession, { gameId });

    // Fetch defender actions
    const actions = await client.query(api.steps.getActionsForSession, {
      gameId,
    });

    // Fetch screenshot URLs for steps that have them
    const stepsWithScreenshots = await Promise.all(
      steps.map(async (step) => {
        let screenshotUrl: string | undefined;
        if (step.screenshotBeforeId) {
          try {
            screenshotUrl = await client.query(api.screenshots.getUrl, {
              storageId: step.screenshotBeforeId as Id<'_storage'>,
            }) ?? undefined;
          } catch {
            // screenshot may have been deleted
          }
        }
        return {
          stepNumber: step.stepNumber,
          toolName: step.toolName,
          screenshotBeforeId: step.screenshotBeforeId,
          screenshotUrl,
        };
      }),
    );

    // Parse the stored JSON
    let messages: unknown[];
    let toolDefinitions: unknown[];
    try {
      messages = JSON.parse(conversation.messages);
      toolDefinitions = conversation.toolDefinitions
        ? JSON.parse(conversation.toolDefinitions)
        : [];
    } catch (e) {
      console.error(
        `[extract]   SKIP — failed to parse conversation JSON for ${gameId}: ${e}`,
      );
      continue;
    }

    const trajectory: RawTrajectory = {
      gameId,
      task: {
        description: session.taskDescription || 'unknown',
        startUrl: session.taskStartUrl,
        difficulty: session.difficulty || 'medium',
      },
      winner: session.winner || 'unknown',
      winReason: session.winReason || 'unknown',
      durationMs: session.durationSeconds ? session.durationSeconds * 1000 : 0,
      messages,
      toolDefinitions,
      steps: stepsWithScreenshots,
      defenderActions: actions.map((a) => ({
        actionNumber: a.actionNumber,
        disruptionId: a.disruptionId,
        disruptionName: a.disruptionName,
        description: a.description,
      })),
    };

    trajectories.push(trajectory);
    console.error(
      `[extract]   OK — ${messages.length} messages, ${steps.length} steps, ${actions.length} defender actions`,
    );
  }

  // 3. Output
  const output = trajectories
    .map((t) => JSON.stringify(t))
    .join('\n');

  if (OUTPUT_FILE) {
    const dir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, output + '\n');
    console.error(
      `[extract] Wrote ${trajectories.length} trajectories to ${OUTPUT_FILE}`,
    );
  } else {
    process.stdout.write(output + '\n');
  }

  console.error(`[extract] Done. ${trajectories.length} trajectories extracted.`);
}

main().catch((e) => {
  console.error('[extract] Fatal error:', e);
  process.exit(1);
});
