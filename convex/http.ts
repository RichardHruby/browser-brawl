import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { api } from './_generated/api';

const http = httpRouter();

/**
 * POST /api/training-status
 *
 * Called by Modal training function to update job status in real-time.
 * Body: { experimentName, status, currentStep?, totalSteps?, currentLoss?, error?, serveUrl? }
 */
http.route({
  path: '/api/training-status',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();

    await ctx.runMutation(api.training.updateStatus, {
      experimentName: body.experimentName,
      status: body.status,
      currentStep: body.currentStep,
      totalSteps: body.totalSteps,
      currentLoss: body.currentLoss,
      error: body.error,
      serveUrl: body.serveUrl,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }),
});

export default http;
