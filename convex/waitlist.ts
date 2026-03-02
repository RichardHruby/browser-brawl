import { mutation } from './_generated/server';
import { v } from 'convex/values';

export const join = mutation({
  args: {
    email: v.string(),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('waitlist')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .unique();
    if (existing) return existing._id;

    return ctx.db.insert('waitlist', {
      email: args.email,
      joinedAt: new Date().toISOString(),
      source: args.source,
    });
  },
});
