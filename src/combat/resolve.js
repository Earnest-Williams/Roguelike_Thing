// src/combat/resolve.js
// @ts-check
import { DebugBus } from "../../js/debug/debug-bus.js";
import { logAttackStep } from "./debug-log.js";
import { addStatus, applyStatuses } from "./status.js";
import { applyOutgoingScaling, gainAttunement } from "./attunement.js";
import { polarityOnHitScalar, polarityDefScalar } from "./polarity.js";
import { rand } from "./rng.js";

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
  const pushStep = (step, packets) => {
    debugData.steps.push({ step, packets: clone(packets) });
  };

  let packets = applyConversions(attacker, packetsIn);
  log({ step: "conversions", packets });
  pushStep("conversions", packets);
  packets = applyBrands(attacker, packets, onHitStatuses);
  log({ step: "brands", packets });
  pushStep("brands", packets);

  applyOutgoingScaling({ attacker, packets, target: defender });
  log({ step: "attunement", packets });
  pushStep("attunement", packets);

  packets = applyAffinities(attacker, packets);
  log({ step: "affinities", packets });
  pushStep("affinities", packets);

  packets = applyPolarityAttack(attacker, defender, packets);
  log({ step: "polarity_attack", packets });
  pushStep("polarity_attack", packets);

  const defended = applyDefense(defender, packets);
  log({ step: "defense", packets: defended });
  pushStep("defense", defended);

  const scalar = Number.isFinite(ctx.damageScalar) ? Math.max(0, ctx.damageScalar) : 1;
  const packetsAfterDefense = collapseByType(defended, scalar);
  const totalDamage = Object.values(packetsAfterDefense).reduce((a, b) => a + b, 0);
  if (defender?.res) {
    defender.res.hp = Math.max(0, defender.res.hp - totalDamage);
  }
  debugData.afterDefense = clone(packetsAfterDefense);
  debugData.totalDamage = totalDamage;
  debugData.defenderHp.after = Number.isFinite(defender?.res?.hp)
    ? defender.res.hp
    : Number.isFinite(defender?.hp)
    ? defender.hp
    : debugData.defenderHp.after;

  if (defender?.res?.hp === 0 && attacker?.modCache?.temporal?.onKillHaste) {
    const hk = attacker.modCache.temporal.onKillHaste;
    addStatus(attacker, "haste", {
      duration: hk.duration ?? 2,
      potency: hk.potency ?? 1,
    });
  }

  let echo = null;
  if (attacker?.modCache?.temporal?.echo && attacker.modCache.temporal.echo.percent > 0) {
    const echoCfg = attacker.modCache.temporal.echo;
    const randomFn = typeof ctx?.rng === "function" ? ctx.rng : (typeof rand === "function" ? rand : Math.random);
    const chance = Math.min(1, Math.max(0, echoCfg.chance ?? 0));
    if (randomFn() < chance) {
      const scaled = {};
      let echoTotal = 0;
      for (const [type, amt] of Object.entries(packetsAfterDefense)) {
        const v = Math.floor(Number(amt) * echoCfg.percent);
        if (v > 0) {
          scaled[type] = v;
          echoTotal += v;
        }
      }
      if (echoTotal > 0 && defender?.res) {
        defender.res.hp = Math.max(0, defender.res.hp - echoTotal);
        echo = { packets: scaled, total: echoTotal };
        debugData.echo = clone(echo);
        debugData.defenderHp.after = Number.isFinite(defender?.res?.hp)
          ? defender.res.hp
          : Number.isFinite(defender?.hp)
          ? defender.hp
          : debugData.defenderHp.after;
      }
    }
  }

  if (attacker) {
    for (const [type, amt] of Object.entries(packetsAfterDefense)) {
      if (!amt || amt <= 0) continue;
      gainAttunement(attacker, type);
    }
  }

  const attempts = [...onHitStatuses, ...(ctx.statusAttempts || [])];
  const appliedStatuses = attempts.length
    ? applyStatuses({ statusAttempts: attempts }, attacker, defender, ctx.turn)
    : [];

  debugData.statusAttempts = clone(attempts);
  debugData.appliedStatuses = clone(appliedStatuses);

  DebugBus.emit({ type: "attack", payload: debugData });

  return { packetsAfterDefense, totalDamage, appliedStatuses, echo };
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

function applyPolarityAttack(attacker, defender, packets) {
  const s = polarityOnHitScalar(attacker, defender);
  return packets.map((p) => ({ ...p, amount: Math.floor(p.amount * s) }));
}

function applyDefense(defender, packets) {
  const imm = defender?.modCache?.immunities || new Set();
  const res = defender?.modCache?.resists || {};
  const scalar = polarityDefScalar(defender);
  const out = [];
  for (const p of packets) {
    if (imm.has(p.type)) continue;
    const r = Math.min(0.95, Math.max(0, res[p.type] || 0));
    const amt = Math.floor(p.amount * (1 - r) * scalar);
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
