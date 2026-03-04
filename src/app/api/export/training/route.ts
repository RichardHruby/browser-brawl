import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../../convex/_generated/api';
import {
  convertTrajectory,
  type RawTrajectory,
} from '@/lib/training-converter';

export async function GET(request: Request) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return new Response('NEXT_PUBLIC_CONVEX_URL not configured', { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const gameIdsParam = searchParams.get('gameIds');

  if (!gameIdsParam) {
    return new Response('gameIds parameter required', { status: 400 });
  }

  const gameIds = gameIdsParam.split(',').filter(Boolean);
  if (gameIds.length === 0) {
    return new Response('No gameIds provided', { status: 400 });
  }

  // Allow overriding winner filter for export/inspection
  const includeAll = searchParams.get('includeAll') === 'true';

  const client = new ConvexHttpClient(convexUrl);
  const results: string[] = [];

  for (const gameId of gameIds) {
    try {
      // Fetch session
      const session = await client.query(api.sessions.get, { gameId });
      if (!session) continue;

      // Fetch conversation (latest row has full message history)
      const conversation = await client.query(
        api.conversations.getLatestForSession,
        { gameId },
      );
      if (!conversation) continue;

      // Fetch steps and actions
      const [steps, actions] = await Promise.all([
        client.query(api.steps.getStepsForSession, { gameId }),
        client.query(api.steps.getActionsForSession, { gameId }),
      ]);

      // Parse conversation JSON
      let messages: unknown[];
      let toolDefinitions: unknown[];
      try {
        messages = JSON.parse(conversation.messages);
        toolDefinitions = conversation.toolDefinitions
          ? JSON.parse(conversation.toolDefinitions)
          : [];
      } catch {
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
        messages: messages as RawTrajectory['messages'],
        toolDefinitions: toolDefinitions as RawTrajectory['toolDefinitions'],
        steps: steps.map((s) => ({
          stepNumber: s.stepNumber,
          toolName: s.toolName,
          screenshotBeforeId: s.screenshotBeforeId,
        })),
        defenderActions: actions.map((a) => ({
          actionNumber: a.actionNumber,
          disruptionId: a.disruptionId,
          disruptionName: a.disruptionName,
          description: a.description,
        })),
      };

      const converted = convertTrajectory(trajectory, {
        requireAttackerWin: !includeAll,
      });
      if (converted) {
        results.push(JSON.stringify(converted));
      }
    } catch {
      // Skip sessions that fail — silently
      continue;
    }
  }

  if (results.length === 0) {
    return new Response('No valid training data found for selected sessions', {
      status: 404,
    });
  }

  return new Response(results.join('\n') + '\n', {
    headers: {
      'Content-Type': 'application/jsonl',
      'Content-Disposition': `attachment; filename="browser-brawl-training-${results.length}sessions.jsonl"`,
    },
  });
}
