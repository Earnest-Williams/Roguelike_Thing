// src/combat/resolve.js
// @ts-check
import { DebugBus } from "../../js/debug/debug-bus.js";
import { logAttackStep, noteAttackStep } from "./debug-log.js";
import { applyStatuses, tryApplyHaste } from "./status.js";
import { applyOutgoingScaling, noteUseGain } from "./attunement.js";
import { polarityDefenseMult, polarityOffenseMult } from "./polarity.js";
import { spendResources, applyOnKillResourceGain } from "./resources.js";
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
  ctx.attacker = attacker;
  ctx.defender = defender;
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
  ctx.packets = packetsIn;
  const onHitStatuses = [];
  const log = (d) => {
    logAttackStep(attacker, d);
    noteAttackStep(attacker, d);
  };

  const defenderHpBefore = Number.isFinite(defender?.res?.hp)
    ? defender.res.hp
    : Number.isFinite(defender?.hp)
    ? defender.hp
    : null;

  ctx.defenderHpBefore = defenderHpBefore;

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
  packets = applyBrands(attacker, packets, onHitStatuses);
  log({ step: "brands", packets });
  pushStep("brands", packets);

  packets = applyAffinities(attacker, packets);
  log({ step: "affinities", packets });
  pushStep("affinities", packets);

  const polOff = polarityOffenseMult(attacker, defender);
  const polDef = polarityDefenseMult(defender, attacker);

  packets = applyPolarityAttack(packets, polOff);
  log({ step: "polarity_attack", packets });
  pushStep("polarity_attack", packets);

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
  }

  const defended = applyDefense(defender, packets, polDef);
  log({ step: "defense", packets: defended });
  pushStep("defense", defended);

  const scalar = Number.isFinite(ctx.damageScalar) ? Math.max(0, ctx.damageScalar) : 1;
  const packetsAfterDefense = collapseByType(defended, scalar);
  ctx.packetsAfterDefense = packetsAfterDefense;
  const totalDamage = Object.values(packetsAfterDefense).reduce((a, b) => a + b, 0);
  debugData.afterDefense = clone(packetsAfterDefense);
  debugData.totalDamage = totalDamage;
  debugData.defenderHp.after = Number.isFinite(defender?.res?.hp)
    ? defender.res.hp
    : Number.isFinite(defender?.hp)
    ? defender.hp
    : debugData.defenderHp.after;

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

  ctx.packetsAfterDefense = packetsAfterDefense;
  ctx.totalDamage = totalDamage;
  ctx.appliedStatuses = appliedStatuses;
  const outcome = finalizeAttack(ctx, resolveAttack);

  pushStep("finalize", ctx.packetsAfterDefense);

  if (outcome?.hooks) {
    debugData.hooks = clone(outcome.hooks);
    if (outcome.hooks.echo?.result?.packetsAfterDefense && !debugData.echo) {
      debugData.echo = clone(outcome.hooks.echo);
    }
  }

  debugData.defenderHp.after = getDefenderHp(defender, debugData.defenderHp.after);

  DebugBus.emit({ type: "attack", payload: debugData });

  return {
    packetsAfterDefense,
    totalDamage,
    appliedStatuses,
    echo: outcome?.echo || null,
  };
}

function getDefenderHp(defender, fallback) {
  if (Number.isFinite(defender?.res?.hp)) return defender.res.hp;
  if (Number.isFinite(defender?.hp)) return defender.hp;
  return fallback;
}

function isDefenderDown(defender) {
  if (!defender) return false;
  if (Number.isFinite(defender?.res?.hp)) return defender.res.hp <= 0;
  if (Number.isFinite(defender?.hp)) return defender.hp <= 0;
  return false;
}

function finalizeAttack(ctx, resolveFn) {
  const attacker = ctx?.attacker;
  const defender = ctx?.defender;

  if (attacker) {
    applyOutgoingScaling(attacker, ctx);
  }

  const totalDamage = Number(ctx?.totalDamage || 0);
  if (defender && Number.isFinite(totalDamage) && totalDamage > 0) {
    if (Number.isFinite(defender?.res?.hp)) {
      defender.res.hp = Math.max(0, defender.res.hp - totalDamage);
      if (defender.resources && Number.isFinite(defender.resources.hp)) {
        defender.resources.hp = defender.res.hp;
      }
      if (Number.isFinite(defender.hp)) {
        defender.hp = defender.res.hp;
      }
    } else if (Number.isFinite(defender?.hp)) {
      defender.hp = Math.max(0, defender.hp - totalDamage);
    }
  }

  if (attacker) {
    const usedTypes = new Set();
    for (const [type, dealt] of Object.entries(ctx?.packetsAfterDefense || {})) {
      if (Number.isFinite(dealt) && dealt > 0) {
        usedTypes.add(type);
      }
    }
    if (usedTypes.size) {
      noteUseGain(attacker, usedTypes);
    }
  }

  const temporal = attacker?.modCache?.temporal || Object.create(null);
  const resource = attacker?.modCache?.resource || Object.create(null);
  const echoCfg = temporal.echo || null;

  const defenderWasAlive = Number.isFinite(ctx?.defenderHpBefore)
    ? ctx.defenderHpBefore > 0
    : true;
  const killedNow = defenderWasAlive && isDefenderDown(defender) && totalDamage > 0;

  let hasteSummary = null;
  let resourceGains = null;
  if (killedNow) {
    const allowOnKill = echoCfg?.allowOnKill ?? true;
    const eligible = !ctx?.isEcho || allowOnKill;
    if (eligible) {
      if (temporal.onKillHaste) {
        const hasteApplied = tryApplyHaste(attacker, temporal.onKillHaste);
        if (hasteApplied) {
          hasteSummary = {
            statusId: hasteApplied.id,
            stacks: hasteApplied.stacks,
            duration: Number.isFinite(hasteApplied.endsAt)
              ? Math.max(0, hasteApplied.endsAt - (attacker?.turn ?? 0))
              : undefined,
            potency: hasteApplied.potency,
          };
        }
      }
      if (resource.onKillGain) {
        resourceGains = applyOnKillResourceGain(attacker, resource.onKillGain);
      }
    }
  }

  let echoResult = null;
  if (attacker && echoCfg && !ctx?.isEcho) {
    echoResult = rollEchoOnce(attacker, ctx, resolveFn);
  }

  const hooks = {};
  if (hasteSummary) hooks.hasteApplied = hasteSummary;
  if (resourceGains) hooks.resourceGains = resourceGains;
  if (echoResult) hooks.echo = echoResult;

  if (attacker) {
    noteAttackStep(attacker, {
      step: "finalize",
      packetsAfterDefense: ctx?.packetsAfterDefense || {},
      totalDamage: ctx?.totalDamage,
      killed: killedNow,
    });
  }

  return {
    packetsAfterDefense: ctx?.packetsAfterDefense || {},
    totalDamage: ctx?.totalDamage || totalDamage,
    appliedStatuses: ctx?.appliedStatuses || [],
    echo: echoResult,
    hooks,
  };
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
