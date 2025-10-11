// src/content/statuses.js
// Additional status definitions layered on top of the base registry.

export const EXTRA_STATUSES = {
  chilled: {
    id: "chilled",
    stacking: "max",
    tickEvery: 0,
    duration: 3,
    derive(ctx, d) {
      d.temporal.actionSpeedPct = (d.temporal.actionSpeedPct || 0) - 0.15 * ctx.stacks;
      return d;
    },
  },
};

