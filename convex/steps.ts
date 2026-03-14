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
    // Structured labels (controllable defender)
    attackFamily: v.optional(v.string()),
    objective: v.optional(v.string()),
    concealment: v.optional(v.string()),
    authority: v.optional(v.string()),
    placement: v.optional(v.string()),
    agentResponse: v.optional(v.string()),
    judgeReasoning: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert('defenderActions', args);
  },
});

// Update judge verdict on an existing defender action (async, after injection)
export const updateJudgeVerdict = mutation({
  args: {
    gameId: v.string(),
    actionNumber: v.number(),
    agentResponse: v.string(),
    judgeReasoning: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('defenderActions')
      .withIndex('by_gameId', (q) =>
        q.eq('gameId', args.gameId).eq('actionNumber', args.actionNumber),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        agentResponse: args.agentResponse,
        judgeReasoning: args.judgeReasoning,
      });
    }
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
