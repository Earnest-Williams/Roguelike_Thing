import { registerStatus } from "./status.js";

// burn: DoT scales with stacks
registerStatus({
  id: "burn",
  label: "Burning",
  harmful: true,
  stacking: "add_stacks",
  tickEvery: 1,
  onTick: ({ target, stacks }) => { target.hp = Math.max(0, target.hp - (1 + stacks)); },
});

// poisoned: independent instances, potency on apply
registerStatus({
  id: "poisoned",
  label: "Poisoned",
  harmful: true,
  stacking: "independent",
  tickEvery: 1,
  onApply: () => ({ potency: 1 }),
  onTick: ({ target, potency }) => { target.hp = Math.max(0, target.hp - Math.max(1, potency)); },
});

// slowed: refresh, affects AP & action speed
registerStatus({
  id: "slowed",
  label: "Slowed",
  harmful: true,
  stacking: "refresh",
  derive: ({ stacks }) => ({ actionSpeedPct: 0.10 * stacks, moveAPDelta: 0.1 * stacks }),
});

// stunned: refresh, hard disable via actionSpeedPct >= 1.0 (your engine can gate actions)
registerStatus({
  id: "stunned",
  label: "Stunned",
  harmful: true,
  stacking: "refresh",
  derive: () => ({ actionSpeedPct: 1.0 }),
});

// haste: refresh, faster actions
registerStatus({
  id: "haste",
  label: "Haste",
  harmful: false,
  stacking: "refresh",
  derive: ({ stacks }) => ({ actionSpeedPct: -0.15 * stacks }),
});
