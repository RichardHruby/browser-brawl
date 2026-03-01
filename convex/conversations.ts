import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

export const record = mutation({
  args: {
    gameId: v.string(),
    stepNumber: v.number(),
    messages: v.string(),
    toolDefinitions: v.optional(v.string()),
    timestamp: v.string(),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert('conversations', args);
  },
});

export const getForSession = query({
  args: { gameId: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query('conversations')
      .withIndex('by_gameId', (q) => q.eq('gameId', args.gameId))
      .collect();
  },
});

export const getLatestForSession = query({
  args: { gameId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('conversations')
      .withIndex('by_gameId', (q) => q.eq('gameId', args.gameId))
      .order('desc')
      .take(1);
    return rows[0] ?? null;
  },
});
