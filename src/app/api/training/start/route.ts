import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import {
  convertTrajectory,
  toOpenAIMessages,
  type RawTrajectory,
} from '@/lib/training-converter';

export async function POST(request: Request) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return Response.json({ error: 'NEXT_PUBLIC_CONVEX_URL not configured' }, { status: 500 });
  }

  const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (!convexSiteUrl) {
    return Response.json({ error: 'NEXT_PUBLIC_CONVEX_SITE_URL not configured' }, { status: 500 });
  }

  const modalTrainUrl = process.env.MODAL_TRAIN_ENDPOINT;
  if (!modalTrainUrl) {
    return Response.json(
      {
        error:
          'MODAL_TRAIN_ENDPOINT not set. Deploy the training endpoint first: ' +
          'modal deploy scripts/modal_train_pipeline.py',
      },
      { status: 500 },
    );
  }

  let body: { gameIds?: string[]; textOnly?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const gameIds = body.gameIds?.filter(Boolean);
  if (!gameIds || gameIds.length === 0) {
    return Response.json({ error: 'gameIds array required' }, { status: 400 });
  }

  const textOnly = body.textOnly ?? true;
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
  const experimentName = `${textOnly ? 'text' : 'vlm'}-${ts}`;

  const client = new ConvexHttpClient(convexUrl);

  // 1. Create job record
  await client.mutation(api.training.create, {
    experimentName,
    gameIds,
    gameCount: gameIds.length,
    textOnly,
  });

  try {
    // 2. Fetch and convert training data (same pattern as /api/export/training)
    const openaiLines: string[] = [];

    for (const gameId of gameIds) {
      const session = await client.query(api.sessions.get, { gameId });
      if (!session) continue;

      const conversation = await client.query(
        api.conversations.getLatestForSession,
        { gameId },
      );
      if (!conversation) continue;

      const [steps, actions] = await Promise.all([
        client.query(api.steps.getStepsForSession, { gameId }),
        client.query(api.steps.getActionsForSession, { gameId }),
      ]);

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
        steps: steps.map((s: { stepNumber: number; toolName?: string; screenshotBeforeId?: string }) => ({
          stepNumber: s.stepNumber,
          toolName: s.toolName,
          screenshotBeforeId: s.screenshotBeforeId,
        })),
        defenderActions: actions.map((a: { actionNumber: number; disruptionId: string; disruptionName: string; description: string }) => ({
          actionNumber: a.actionNumber,
          disruptionId: a.disruptionId,
          disruptionName: a.disruptionName,
          description: a.description,
        })),
      };

      // ShareGPT → OpenAI Messages (trim incomplete trailing turns)
      const sharegpt = convertTrajectory(trajectory, 1);
      if (!sharegpt) continue;
      const openai = toOpenAIMessages(sharegpt);
      openaiLines.push(JSON.stringify(openai));
    }

    if (openaiLines.length === 0) {
      await client.mutation(api.training.updateStatus, {
        experimentName,
        status: 'failed',
        error: 'No valid training data found for selected sessions',
      });
      return Response.json(
        { error: 'No valid training data found', experimentName },
        { status: 404 },
      );
    }

    // 3. Upload JSONL to Convex file storage
    await client.mutation(api.training.updateStatus, {
      experimentName,
      status: 'uploading',
    });

    const jsonlBlob = new Blob([openaiLines.join('\n') + '\n'], {
      type: 'application/jsonl',
    });

    const uploadUrl = await client.mutation(api.screenshots.generateUploadUrl);
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/jsonl' },
      body: jsonlBlob,
    });
    if (!uploadRes.ok) {
      throw new Error(`Failed to upload training data: ${uploadRes.status}`);
    }
    const { storageId } = await uploadRes.json() as { storageId: Id<'_storage'> };

    await client.mutation(api.training.setTrainingData, {
      experimentName,
      trainingDataStorageId: storageId,
    });

    // 4. Get the download URL for Modal
    const dataUrl = await client.query(api.training.getTrainingDataUrl, {
      experimentName,
    });

    if (!dataUrl) {
      throw new Error('Failed to get training data download URL');
    }

    // 5. Call Modal training endpoint
    await client.mutation(api.training.updateStatus, {
      experimentName,
      status: 'training',
    });

    // Fire-and-forget: Modal endpoint kicks off async training
    // and calls back to Convex HTTP endpoint with status updates
    fetch(modalTrainUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data_url: dataUrl,
        experiment_name: experimentName,
        text_only: textOnly,
        convex_site_url: convexSiteUrl,
      }),
    }).catch((err) => {
      console.error(`[training] Failed to call Modal: ${err}`);
    });

    return Response.json({
      experimentName,
      gameCount: openaiLines.length,
      status: 'training',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[training] Error: ${message}`);

    await client.mutation(api.training.updateStatus, {
      experimentName,
      status: 'failed',
      error: message,
    }).catch(() => {});

    return Response.json({ error: message, experimentName }, { status: 500 });
  }
}
