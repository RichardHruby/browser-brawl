import { mutation, query, httpAction } from './_generated/server';
import { v } from 'convex/values';

// ── Mutations ────────────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    experimentName: v.string(),
    gameIds: v.array(v.string()),
    gameCount: v.number(),
    textOnly: v.boolean(),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert('trainingJobs', {
      ...args,
      status: 'preparing',
      startedAt: new Date().toISOString(),
    });
  },
});

export const updateStatus = mutation({
  args: {
    experimentName: v.string(),
    status: v.union(
      v.literal('preparing'),
      v.literal('uploading'),
      v.literal('training'),
      v.literal('merging'),
      v.literal('deploying'),
      v.literal('ready'),
      v.literal('failed'),
    ),
    currentStep: v.optional(v.number()),
    totalSteps: v.optional(v.number()),
    currentLoss: v.optional(v.number()),
    error: v.optional(v.string()),
    serveUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query('trainingJobs')
      .withIndex('by_experimentName', (q) => q.eq('experimentName', args.experimentName))
      .unique();
    if (!job) return;

    const updates: Record<string, unknown> = { status: args.status };
    if (args.currentStep !== undefined) updates.currentStep = args.currentStep;
    if (args.totalSteps !== undefined) updates.totalSteps = args.totalSteps;
    if (args.currentLoss !== undefined) updates.currentLoss = args.currentLoss;
    if (args.error !== undefined) updates.error = args.error;
    if (args.serveUrl !== undefined) updates.serveUrl = args.serveUrl;
    if (args.status === 'ready' || args.status === 'failed') {
      updates.completedAt = new Date().toISOString();
    }

    await ctx.db.patch(job._id, updates);
  },
});

export const setTrainingData = mutation({
  args: {
    experimentName: v.string(),
    trainingDataStorageId: v.id('_storage'),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query('trainingJobs')
      .withIndex('by_experimentName', (q) => q.eq('experimentName', args.experimentName))
      .unique();
    if (!job) return;
    await ctx.db.patch(job._id, { trainingDataStorageId: args.trainingDataStorageId });
  },
});

// ── Queries ──────────────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    const jobs = await ctx.db.query('trainingJobs').order('desc').collect();
    return jobs;
  },
});

export const get = query({
  args: { experimentName: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query('trainingJobs')
      .withIndex('by_experimentName', (q) => q.eq('experimentName', args.experimentName))
      .unique();
  },
});

export const getTrainingDataUrl = query({
  args: { experimentName: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query('trainingJobs')
      .withIndex('by_experimentName', (q) => q.eq('experimentName', args.experimentName))
      .unique();
    if (!job?.trainingDataStorageId) return null;
    return ctx.storage.getUrl(job.trainingDataStorageId);
  },
});
