// src/combat/resolve.js
// @ts-check
import { DebugBus } from "../../js/debug/debug-bus.js";
import { logAttackStep, noteAttackStep } from "./debug-log.js";
import { applyStatuses, tryApplyHaste } from "./status.js";
import { applyOutgoingScaling, noteUseGain } from "./attunement.js";
import { polarityDefenseMult, polarityOffenseMult } from "./polarity.js";
import { spendResources } from "./resources.js";
import { rollEchoOnce } from "./time.js";

const clone = (value) => {
  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch (err) {
    // fall through to JSON strategy
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (err) {
    return value;
  }
};

export function resolveAttack(ctx) {
  const { attacker, defender } = ctx;
  const tags = ctx?.tags instanceof Set ? ctx.tags : Array.isArray(ctx?.tags) ? ctx.tags : [];

  if (attacker?.resources) {
    let baseCosts = ctx?.baseCosts;
    if (baseCosts === undefined) baseCosts = { stamina: 2 };
    if (baseCosts && Object.keys(baseCosts).length > 0) {
      spendResources(attacker, baseCosts, tags);
    }
  }
  const baseAcc = Number.isFinite(ctx?.baseAccuracy) ? Number(ctx.baseAccuracy) : 0;
  const accBonus = attacker?.statusDerived?.accuracyFlat || 0;
  const finalAcc = Math.max(0, baseAcc + accBonus);
  ctx.finalAccuracy = finalAcc;
  const packetsIn = (ctx.packets || []).map((p) => ({ ...p }));
  const onHitStatuses = [];
  const log = (d) => logAttackStep(attacker, d);

  const defenderHpBefore = Number.isFinite(defender?.res?.hp)
    ? defender.res.hp
    : Number.isFinite(defender?.hp)
    ? defender.hp
    : null;

  const debugData = {
    turn: ctx.turn ?? attacker?.turn ?? defender?.turn ?? 0,
    attacker: attacker?.id ?? attacker?.name ?? null,
    defender: defender?.id ?? defender?.name ?? null,
    inputs: { packets: clone(packetsIn) },
    steps: [],
    defenderHp: { before: defenderHpBefore, after: defenderHpBefore },
  };
  debugData.accuracy = { base: baseAcc, bonus: accBonus, final: finalAcc };
  const pushStep = (step, packets) => {
    debugData.steps.push({ step, packets: clone(packets) });
  };

  let packets = applyConversions(attacker, packetsIn);
  log({ step: "conversions", packets });
  pushStep("conversions", packets);
  noteAttackStep(attacker, { stage: "conversions", packets: clone(packets) });
  packets = applyBrands(attacker, packets, onHitStatuses);
  log({ step: "brands", packets });
  pushStep("brands", packets);
  noteAttackStep(attacker, { stage: "brands", packets: clone(packets) });

  applyOutgoingScaling({ attacker, packets, target: defender });
  log({ step: "attunement", packets });
  pushStep("attunement", packets);
  noteAttackStep(attacker, { stage: "attunement", packets: clone(packets) });

  packets = applyAffinities(attacker, packets);
  log({ step: "affinities", packets });
  pushStep("affinities", packets);
  noteAttackStep(attacker, { stage: "affinities", packets: clone(packets) });

  const polOff = polarityOffenseMult(attacker, defender);
  const polDef = polarityDefenseMult(defender, attacker);

  packets = applyPolarityAttack(packets, polOff);
  log({ step: "polarity_attack", packets });
  pushStep("polarity_attack", packets);
  noteAttackStep(attacker, { stage: "polarity_attack", packets: clone(packets) });

  const sdMult = 1 + (attacker?.statusDerived?.damagePct || 0);
  const mcMult = attacker?.modCache?.dmgMult ?? 1;
  const outgoingMult = Math.max(0, sdMult * mcMult);
  if (outgoingMult !== 1) {
    packets = packets.map((pkt) => {
      if (!pkt || !pkt.type) return pkt;
      const amount = Math.max(0, Number(pkt.amount) || 0);
      return { ...pkt, amount: amount * outgoingMult };
    });
    log({ step: "status_damage", packets });
    pushStep("status_damage", packets);
    noteAttackStep(attacker, { stage: "status_damage", packets: clone(packets) });
  }

  const defended = applyDefense(defender, packets, polDef);
  log({ step: "defense", packets: defended });
  pushStep("defense", defended);
  noteAttackStep(attacker, { stage: "defense", packets: clone(defended) });

  const scalar = Number.isFinite(ctx.damageScalar) ? Math.max(0, ctx.damageScalar) : 1;
  const packetsAfterDefense = collapseByType(defended, scalar);
  ctx.packetsAfterDefense = packetsAfterDefense;
  const totalDamage = Object.values(packetsAfterDefense).reduce((a, b) => a + b, 0);
  noteAttackStep(attacker, { stage: "after_defense_collapse", packets: clone(packetsAfterDefense) });
  debugData.afterDefense = clone(packetsAfterDefense);
  debugData.totalDamage = totalDamage;

  const onHitList = ctx?.skipOnHitStatuses ? [] : onHitStatuses;
  const ctxAttempts = Array.isArray(ctx?.statusAttempts)
    ? ctx.statusAttempts
    : ctx?.statusAttempts
    ? [ctx.statusAttempts]
    : [];
  const attempts = [...onHitList, ...ctxAttempts];
  const appliedStatuses = attempts.length
    ? applyStatuses({ statusAttempts: attempts }, attacker, defender, ctx.turn)
    : [];

  debugData.statusAttempts = clone(attempts);
  debugData.appliedStatuses = clone(appliedStatuses);

  ctx.totalDamage = totalDamage;
  ctx.appliedStatuses = appliedStatuses;
  const outcome = finalizeAttack(ctx);

  debugData.defenderHp.after = getDefenderHp(defender, debugData.defenderHp.after);
  if (outcome.echo && !debugData.echo) {
    debugData.echo = clone(outcome.echo);
  }
  if (outcome.hasteApplied || outcome.resourceGains) {
    debugData.hooks = clone({
      hasteApplied: outcome.hasteApplied,
      resourceGains: outcome.resourceGains,
    });
  }

  DebugBus.emit({ type: "attack", payload: debugData });

  return outcome;
}

function finalizeAttack(ctx) {
  const attacker = ctx?.attacker || null;
  const defender = ctx?.defender || null;
  const packetsAfterDefense = ctx?.packetsAfterDefense || Object.create(null);
  const totalDamage = Number(ctx?.totalDamage || 0);
  const appliedStatuses = Array.isArray(ctx?.appliedStatuses)
    ? ctx.appliedStatuses
    : [];

  if (defender) {
    if (Number.isFinite(defender?.res?.hp)) {
      defender.res.hp = Math.max(0, defender.res.hp - totalDamage);
    } else if (Number.isFinite(defender?.hp)) {
      defender.hp = Math.max(0, defender.hp - totalDamage);
    }
  }

  if (attacker) {
    for (const [type, dealt] of Object.entries(packetsAfterDefense)) {
      const amount = Number(dealt);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      noteUseGain(attacker, type);
    }
  }

  const allowOnKill = ctx?.allowOnKill !== undefined ? Boolean(ctx.allowOnKill) : true;
  const killed = allowOnKill ? isDefenderDown(defender) : false;

  let hasteApplied = null;
  let resourceGains = null;
  if (killed && attacker) {
    hasteApplied = applyOnKillHaste(attacker, attacker.modCache?.temporal?.onKillHaste);
    resourceGains = applyOnKillResourceGain(attacker, attacker.modCache?.resource?.onKillGain);
  }

  let echo = null;
  if (!ctx?.isEcho && attacker) {
    const echoCtx = { ...ctx, allowOnKill: undefined };
    echo = rollEchoOnce(attacker, echoCtx, resolveAttack);
  }

  return {
    packetsAfterDefense,
    totalDamage,
    appliedStatuses,
    hasteApplied,
    resourceGains,
    echo,
  };
}

function getDefenderHp(defender, fallback) {
  if (Number.isFinite(defender?.res?.hp)) return defender.res.hp;
  if (Number.isFinite(defender?.hp)) return defender.hp;
  return fallback;
}

function applyOnKillHaste(attacker, hasteCfg) {
  if (!attacker || !hasteCfg) return null;
  if (!canGrantOnKillHaste(attacker, hasteCfg)) return null;

  const statusId = String(hasteCfg.statusId || hasteCfg.status || hasteCfg.id || "haste");
  const stacksRaw = pickNumber(hasteCfg.stacks, hasteCfg.stack, hasteCfg.amount, hasteCfg.value);
  const stacks = Number.isFinite(stacksRaw) ? Math.max(1, Math.floor(stacksRaw)) : 1;
  const durationRaw = pickNumber(
    hasteCfg.duration,
    hasteCfg.turns,
    hasteCfg.baseDuration,
    hasteCfg.time,
    hasteCfg.length,
  );
  const duration = Number.isFinite(durationRaw) ? Math.max(1, Math.floor(durationRaw)) : 1;
  const potency = pickNumber(hasteCfg.potency, hasteCfg.power, hasteCfg.strength);

  const applied = tryApplyHaste(attacker, duration, {
    statusId,
    stacks,
    potency,
    source: "onKillHaste",
  });
  if (!applied) return null;

  stampOnKillHasteICD(attacker, hasteCfg);
  return applied;
}

function applyOnKillResourceGain(attacker, gains) {
  if (!attacker || !gains || typeof gains !== "object") return null;
  attacker.resources = attacker.resources || Object.create(null);
  attacker.resources.pools = attacker.resources.pools || Object.create(null);
  attacker.res = attacker.res || attacker.resources;
  const pools = attacker.resources.pools;
  const applied = Object.create(null);

  for (const [pool, raw] of Object.entries(gains)) {
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount === 0) continue;
    if (pool === "hp") {
      const before = Number(attacker.res?.hp ?? attacker.hp ?? 0);
      const max = Number.isFinite(attacker.max?.hp) ? attacker.max.hp : before;
      const after = Math.max(0, Math.min(max, before + amount));
      if (attacker.res) attacker.res.hp = after;
      attacker.hp = after;
      const delta = after - before;
      if (delta !== 0) applied[pool] = delta;
      continue;
    }

    if (!pools[pool]) {
      pools[pool] = {
        cur: 0,
        max: Math.max(0, amount),
        regenPerTurn: 0,
        spendMultipliers: {},
        minToUse: 0,
      };
    }
    const bucket = pools[pool];
    const before = Number(bucket.cur ?? 0);
    const max = Number.isFinite(bucket.max) ? bucket.max : before;
    const after = Math.max(0, Math.min(max, before + amount));
    bucket.cur = after;
    if (attacker.res && pool in attacker.res) {
      attacker.res[pool] = after;
    }
    if (attacker.resources && pool in attacker.resources) {
      attacker.resources[pool] = after;
    }
    if (pool === "stamina" && typeof attacker.stamina === "number") {
      attacker.stamina = after;
    } else if (pool === "mana" && typeof attacker.mana === "number") {
      attacker.mana = after;
    }
    const delta = after - before;
    if (delta !== 0) applied[pool] = delta;
  }

  return Object.keys(applied).length ? applied : null;
}

function pickNumber(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return NaN;
}

function canGrantOnKillHaste(actor, cfg) {
  if (!actor || !cfg) return false;
  const nowTurn = Number.isFinite(actor.turn) ? actor.turn : 0;
  const state = ensureHasteCtl(actor);
  if (cfg.oncePerTurn && state.lastTurn === nowTurn) return false;
  if (Number.isFinite(cfg.cooldownTurns)) {
    const cd = Math.max(0, Math.floor(cfg.cooldownTurns));
    if (nowTurn < state.nextReadyAt) return false;
    state.cooldown = cd;
  }
  return true;
}

function stampOnKillHasteICD(actor, cfg) {
  if (!actor || !cfg) return;
  const state = ensureHasteCtl(actor);
  const nowTurn = Number.isFinite(actor.turn) ? actor.turn : 0;
  state.lastTurn = nowTurn;
  if (Number.isFinite(cfg.cooldownTurns)) {
    const cd = Math.max(0, Math.floor(cfg.cooldownTurns));
    state.nextReadyAt = nowTurn + cd;
  }
}

function ensureHasteCtl(actor) {
  if (!actor._onKillHasteCtl || typeof actor._onKillHasteCtl !== "object") {
    actor._onKillHasteCtl = { lastTurn: -Infinity, nextReadyAt: -Infinity, cooldown: 0 };
  }
  return actor._onKillHasteCtl;
}

function isDefenderDown(defender) {
  if (!defender) return false;
  if (Number.isFinite(defender?.res?.hp)) return defender.res.hp <= 0;
  if (Number.isFinite(defender?.hp)) return defender.hp <= 0;
  return false;
}

// --- helper functions ---

function applyConversions(actor, packets) {
  const convs = actor?.modCache?.offense?.conversions || [];
  if (!convs.length) return packets;
  const out = [];
  for (const pkt of packets) {
    let remaining = pkt.amount;
    for (const c of convs) {
      const sourceType =
        typeof c.from === "string"
          ? c.from
          : typeof c.source === "string"
          ? c.source
          : null;
      if (sourceType && pkt.type !== sourceType) {
        continue;
      }
      const pctRaw =
        typeof c.pct === "number" && Number.isFinite(c.pct)
          ? c.pct
          : typeof c.percent === "number" && Number.isFinite(c.percent)
          ? c.percent
          : NaN;
      if (!Number.isFinite(pctRaw) || pctRaw <= 0 || pctRaw > 1) {
        continue;
      }
      const take = Math.floor(pkt.amount * pctRaw);
      if (take > 0) {
        const toType =
          typeof c.to === "string"
            ? c.to
            : typeof c.into === "string"
            ? c.into
            : pkt.type;
        out.push({ type: toType, amount: take });
        remaining -= take;
      }
    }
    if (remaining > 0) out.push({ type: pkt.type, amount: remaining });
  }
  return out;
}

function applyBrands(actor, packets, onHitStatuses) {
  const offenseBrands = actor?.modCache?.offense?.brands || [];
  // Exclude brands with kind === "brand" here because those are already included in offenseBrands.
  // Only include other types of brands (e.g., temporary or special brands) in extraBrands.
  const extraBrands = Array.isArray(actor?.modCache?.brands)
    ? actor.modCache.brands.filter((b) => b && b.kind !== "brand")
    : [];
  const brands = [...offenseBrands, ...extraBrands];
  return packets.map((pkt) => {
    let amt = pkt.amount;
    for (const b of brands) {
      if (!b) continue;
      const matchType = typeof b.type === "string" ? b.type : null;
      if (matchType && matchType !== pkt.type) continue;

      const flatBonus = Number(b.flat ?? b.amount ?? 0) || 0;
      if (flatBonus) amt += flatBonus;

      const pctBonus =
        typeof b.pct === "number" && Number.isFinite(b.pct)
          ? b.pct
          : typeof b.percent === "number" && Number.isFinite(b.percent)
          ? b.percent
          : 0;
      if (pctBonus) amt = Math.floor(amt * (1 + pctBonus));

      if (Array.isArray(b.onHitStatuses)) onHitStatuses.push(...b.onHitStatuses);
    }
    return { ...pkt, amount: amt };
  });
}

function applyAffinities(actor, packets) {
  const aff = actor?.modCache?.affinities || {};
  return packets.map((p) => {
    const bonus = aff[p.type] || 0;
    return bonus ? { ...p, amount: Math.floor(p.amount * (1 + bonus)) } : p;
  });
}

function applyPolarityAttack(packets, scalar) {
  if (!Number.isFinite(scalar) || scalar === 1) return packets;
  return packets.map((p) => ({ ...p, amount: Math.floor(p.amount * scalar) }));
}

function applyDefense(defender, packets, polarityScalar) {
  const imm = defender?.modCache?.immunities || new Set();
  const res = defender?.modCache?.resists || {};
  const statusRes = defender?.statusDerived?.resistsPct || {};
  const out = [];
  for (const p of packets) {
    if (imm.has(p.type)) continue;
    const baseResist = Number(res[p.type] || 0);
    const derivedResist = Number(statusRes[p.type] || 0);
    const totalResist = Math.max(-1, Math.min(0.95, baseResist + derivedResist));
    let amt = Math.floor(p.amount * (1 - totalResist));
    if (Number.isFinite(polarityScalar) && polarityScalar !== 1) {
      amt = Math.floor(amt * polarityScalar);
    }
    if (amt > 0) out.push({ type: p.type, amount: amt });
  }
  return out;
}

function collapseByType(packets, scalar) {
  const out = {};
  for (const p of packets) {
    const k = p.type;
    out[k] = (out[k] || 0) + Math.floor(p.amount * scalar);
  }
  return out;
}
