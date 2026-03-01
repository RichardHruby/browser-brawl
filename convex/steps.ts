import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

export const recordAttackerStep = mutation({
  args: {
    gameId: v.string(),
    stepNumber: v.number(),
    toolName: v.optional(v.string()),
    toolInput: v.optional(v.string()),
    toolResultSummary: v.optional(v.string()),
    description: v.string(),
    agentStatus: v.string(),
    timestamp: v.string(),
    screenshotBeforeId: v.optional(v.id('_storage')),
    screenshotAfterId: v.optional(v.id('_storage')),
    domSnapshot: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert('attackerSteps', args);
  },
});

export const recordDefenderAction = mutation({
  args: {
    gameId: v.string(),
    actionNumber: v.number(),
    disruptionId: v.string(),
    disruptionName: v.string(),
    description: v.string(),
    healthDamage: v.number(),
    success: v.boolean(),
    reasoning: v.string(),
    timestamp: v.string(),
    injectionPayload: v.optional(v.string()),
    domSnapshot: v.optional(v.string()),
    screenshotBeforeId: v.optional(v.id('_storage')),
    screenshotAfterId: v.optional(v.id('_storage')),
    attackerStepAtTime: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert('defenderActions', args);
  },
});

export const getStepsForSession = query({
  args: { gameId: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query('attackerSteps')
      .withIndex('by_gameId', (q) => q.eq('gameId', args.gameId))
      .collect();
  },
});

export const getActionsForSession = query({
  args: { gameId: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query('defenderActions')
      .withIndex('by_gameId', (q) => q.eq('gameId', args.gameId))
      .collect();
  },
});

export const listAllActions = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const results = await ctx.db.query('defenderActions').order('desc').collect();
    return results.slice(0, args.limit ?? 5000);
  },
});

export const setAttackerStepScreenshots = mutation({
  args: {
    gameId: v.string(),
    stepNumber: v.number(),
    screenshotBeforeId: v.optional(v.id('_storage')),
    screenshotAfterId: v.optional(v.id('_storage')),
  },
  handler: async (ctx, args) => {
    const step = await ctx.db
      .query('attackerSteps')
      .withIndex('by_gameId', (q) => q.eq('gameId', args.gameId).eq('stepNumber', args.stepNumber))
      .first();
    if (!step) return null;

    const patch: { screenshotBeforeId?: typeof args.screenshotBeforeId; screenshotAfterId?: typeof args.screenshotAfterId } = {};
    if (args.screenshotBeforeId !== undefined) patch.screenshotBeforeId = args.screenshotBeforeId;
    if (args.screenshotAfterId !== undefined) patch.screenshotAfterId = args.screenshotAfterId;
    if (Object.keys(patch).length === 0) return step._id;

    await ctx.db.patch(step._id, patch);
    return step._id;
  },
});

export const setDefenderActionScreenshots = mutation({
  args: {
    gameId: v.string(),
    actionNumber: v.number(),
    screenshotBeforeId: v.optional(v.id('_storage')),
    screenshotAfterId: v.optional(v.id('_storage')),
  },
  handler: async (ctx, args) => {
    const action = await ctx.db
      .query('defenderActions')
      .withIndex('by_gameId', (q) => q.eq('gameId', args.gameId).eq('actionNumber', args.actionNumber))
      .first();
    if (!action) return null;

    const patch: { screenshotBeforeId?: typeof args.screenshotBeforeId; screenshotAfterId?: typeof args.screenshotAfterId } = {};
    if (args.screenshotBeforeId !== undefined) patch.screenshotBeforeId = args.screenshotBeforeId;
    if (args.screenshotAfterId !== undefined) patch.screenshotAfterId = args.screenshotAfterId;
    if (Object.keys(patch).length === 0) return action._id;

    await ctx.db.patch(action._id, patch);
    return action._id;
  },
});
