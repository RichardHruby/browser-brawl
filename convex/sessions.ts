import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

export const create = mutation({
  args: {
    gameId: v.string(),
    taskId: v.string(),
    taskLabel: v.string(),
    taskDescription: v.string(),
    taskStartUrl: v.string(),
    difficulty: v.union(
      v.literal('easy'),
      v.literal('medium'),
      v.literal('hard'),
      v.literal('nightmare'),
    ),
    mode: v.union(v.literal('realtime'), v.literal('turnbased')),
    startedAt: v.string(),
    attackerModel: v.string(),
    defenderModel: v.string(),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert('sessions', {
      ...args,
      phase: 'arena',
    });
  },
});

export const finalize = mutation({
  args: {
    gameId: v.string(),
    winner: v.union(v.literal('attacker'), v.literal('defender')),
    winReason: v.union(
      v.literal('task_complete'),
      v.literal('health_depleted'),
      v.literal('aborted'),
    ),
    healthFinal: v.number(),
    durationSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query('sessions')
      .withIndex('by_gameId', (q) => q.eq('gameId', args.gameId))
      .unique();
    if (!session) return;

    await ctx.db.patch(session._id, {
      phase: 'game_over',
      winner: args.winner,
      winReason: args.winReason,
      healthFinal: args.healthFinal,
      durationSeconds: args.durationSeconds,
      endedAt: new Date().toISOString(),
    });
  },
});

export const list = query({
  args: {
    limit: v.optional(v.number()),
    difficulty: v.optional(
      v.union(
        v.literal('easy'),
        v.literal('medium'),
        v.literal('hard'),
        v.literal('nightmare'),
      ),
    ),
    winner: v.optional(v.union(v.literal('attacker'), v.literal('defender'))),
  },
  handler: async (ctx, args) => {
    const q = ctx.db.query('sessions').order('desc');
    const results = await q.collect();

    let filtered = results;
    if (args.difficulty) {
      filtered = filtered.filter((s) => s.difficulty === args.difficulty);
    }
    if (args.winner) {
      filtered = filtered.filter((s) => s.winner === args.winner);
    }

    const limit = args.limit ?? 50;
    return filtered.slice(0, limit);
  },
});

export const setRecording = mutation({
  args: {
    gameId: v.string(),
    recordingStorageId: v.id('_storage'),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query('sessions')
      .withIndex('by_gameId', (q) => q.eq('gameId', args.gameId))
      .unique();
    if (!session) return;

    await ctx.db.patch(session._id, {
      recordingStorageId: args.recordingStorageId,
    });
  },
});

export const get = query({
  args: { gameId: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query('sessions')
      .withIndex('by_gameId', (q) => q.eq('gameId', args.gameId))
      .unique();
  },
});

/** Bulk export for training data extraction — returns up to `limit` successful sessions */
export const listSuccessful = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const results = await ctx.db.query('sessions').order('desc').collect();
    const successful = results.filter(
      (s) => s.winner === 'attacker' && s.winReason === 'task_complete',
    );
    return successful.slice(0, args.limit ?? 1000);
  },
});
