// src/combat/polarity.js
// @ts-check
import { POLARITY_CLAMP, POLARITY_SCALAR } from "../config.js";

const POLAR_TYPES = Object.freeze(["order", "growth", "chaos", "decay", "void"]);
const POLAR_TYPE_SET = new Set(POLAR_TYPES);

export const POLAR_OPPOSE = Object.freeze({
  order: Object.freeze(["chaos", "void"]),
  growth: Object.freeze(["decay", "void"]),
  chaos: Object.freeze(["order", "void"]),
  decay: Object.freeze(["growth", "void"]),
  void: Object.freeze(["order", "growth", "chaos", "decay"]),
});

function clampPolarity(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(POLARITY_CLAMP.min, Math.min(POLARITY_CLAMP.max, value));
}

function asNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function mergeGrantRecord(target, payload) {
  if (!payload) return;
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      if (!entry || typeof entry !== "object") continue;
      const type = entry.type || entry.id || entry.element || entry.damageType;
      if (!type || !POLAR_TYPE_SET.has(type)) continue;
      const amount = asNumber(
        entry.amount ?? entry.value ?? entry.rank ?? entry.level ?? entry.flat ?? entry.scalar ?? entry.bias,
      );
      if (!amount) continue;
      target[type] = (target[type] || 0) + amount;
    }
    return;
  }
  if (payload instanceof Map) {
    for (const [type, value] of payload.entries()) {
      if (!POLAR_TYPE_SET.has(type)) continue;
      const amount = asNumber(value);
      if (!amount) continue;
      target[type] = (target[type] || 0) + amount;
    }
    return;
  }
  if (typeof payload !== "object") return;
  for (const type of POLAR_TYPES) {
    if (payload[type] === undefined) continue;
    const amount = asNumber(payload[type]);
    if (!amount) continue;
    target[type] = (target[type] || 0) + amount;
  }
}

function collectGrant(source) {
  const grant = Object.create(null);
  if (!source) return grant;
  const seen = new Set();
  const queue = [];
  const enqueue = (obj) => {
    if (!obj || typeof obj !== "object" || seen.has(obj)) return;
    seen.add(obj);
    queue.push(obj);
  };
  enqueue(source);
  if (source?.polarity) enqueue(source.polarity);
  if (source?.modCache?.polarity) enqueue(source.modCache.polarity);
  if (source?.modCache?.offense?.polarity) enqueue(source.modCache.offense.polarity);
  if (source?.modCache?.defense?.polarity) enqueue(source.modCache.defense.polarity);
  while (queue.length) {
    const obj = queue.shift();
    if (!obj) continue;
    if (obj.grant && obj.grant !== obj) enqueue(obj.grant);
    if (obj.grants && obj.grants !== obj) enqueue(obj.grants);
    mergeGrantRecord(grant, obj.grant ?? obj.grants ?? obj);
  }
  return grant;
}

function mergeVsRecord(target, payload) {
  if (!payload) return;
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      if (!entry || typeof entry !== "object") continue;
      const type = entry.type || entry.id || entry.element || entry.damageType;
      if (!type || !POLAR_TYPE_SET.has(type)) continue;
      const amount = asNumber(
        entry.amount ?? entry.value ?? entry.flat ?? entry.scalar ?? entry.bias ?? entry.percent ?? entry.pct,
      );
      if (!amount) continue;
      target[type] = (target[type] || 0) + amount;
    }
    return;
  }
  if (payload instanceof Map) {
    for (const [type, value] of payload.entries()) {
      if (!POLAR_TYPE_SET.has(type)) continue;
      const amount = asNumber(value);
      if (!amount) continue;
      target[type] = (target[type] || 0) + amount;
    }
    return;
  }
  if (typeof payload !== "object") return;
  for (const type of POLAR_TYPES) {
    if (payload[type] === undefined) continue;
    const amount = asNumber(payload[type]);
    if (!amount) continue;
    target[type] = (target[type] || 0) + amount;
  }
}

function mergeBiasPayload(target, payload) {
  if (!payload && payload !== 0) return;
  if (typeof payload === "number") {
    const value = asNumber(payload);
    if (value) target.base += value;
    return;
  }
  if (Array.isArray(payload)) {
    for (const entry of payload) mergeBiasPayload(target, entry);
    return;
  }
  if (payload instanceof Map) {
    mergeVsRecord(target.vs, payload);
    return;
  }
  if (typeof payload !== "object") return;

  const baseFields = [
    "base",
    "baseMult",
    "baseScalar",
    "baseValue",
    "baseAmount",
    "baseBonus",
    "baseBias",
    "baseAdjust",
    "baseAdjustment",
    "baseResist",
    "baseResistPct",
    "baseResistPercent",
    "flat",
    "value",
    "amount",
    "scalar",
  ];
  for (const field of baseFields) {
    if (payload[field] === undefined) continue;
    const amount = asNumber(payload[field]);
    if (!amount) continue;
    target.base += amount;
  }

  const vsFields = [
    "vs",
    "vsTypes",
    "against",
    "targets",
    "perType",
    "matchups",
    "perPolarity",
    "vsGrant",
  ];
  for (const field of vsFields) {
    if (payload[field] === undefined) continue;
    mergeVsRecord(target.vs, payload[field]);
  }

  if (payload.entries) mergeBiasPayload(target, payload.entries);
  if (payload.bonuses) mergeBiasPayload(target, payload.bonuses);
  if (payload.adjust) mergeBiasPayload(target, payload.adjust);

  mergeVsRecord(target.vs, payload);
}

function collectBias(source, key) {
  const bias = { base: 0, vs: Object.create(null) };
  if (!source) return bias;
  const seen = new Set();
  const queue = [];
  const enqueue = (obj) => {
    if (!obj || typeof obj !== "object" || seen.has(obj)) return;
    seen.add(obj);
    queue.push(obj);
  };
  enqueue(source);
  if (source?.polarity) enqueue(source.polarity);
  if (source?.modCache?.polarity) enqueue(source.modCache.polarity);
  if (key === "onHitBias" && source?.modCache?.offense?.polarity) enqueue(source.modCache.offense.polarity);
  if (key === "defenseBias" && source?.modCache?.defense?.polarity) enqueue(source.modCache.defense.polarity);
  while (queue.length) {
    const obj = queue.shift();
    if (!obj) continue;
    if (obj[key] !== undefined) {
      mergeBiasPayload(bias, obj[key]);
      continue;
    }
    if (key === "onHitBias") {
      if (obj.onHitBias !== undefined) {
        mergeBiasPayload(bias, obj.onHitBias);
        continue;
      }
      if (obj.offense?.onHitBias !== undefined) {
        mergeBiasPayload(bias, obj.offense.onHitBias);
        continue;
      }
    }
    if (key === "defenseBias") {
      if (obj.defenseBias !== undefined) {
        mergeBiasPayload(bias, obj.defenseBias);
        continue;
      }
      if (obj.defense?.defenseBias !== undefined) {
        mergeBiasPayload(bias, obj.defense.defenseBias);
      }
    }
  }
  return bias;
}

function computeOpposition(attGrant, defGrant) {
  let total = 0;
  for (const type of POLAR_TYPES) {
    const attValue = attGrant[type] || 0;
    if (!attValue) continue;
    const oppositions = POLAR_OPPOSE[type];
    if (!oppositions) continue;
    for (const opp of oppositions) {
      const defValue = defGrant[opp] || 0;
      if (!defValue) continue;
      total -= attValue * defValue;
    }
  }
  return total;
}

function applyVsAdjustments(bias, otherGrant) {
  let total = 0;
  for (const [type, amount] of Object.entries(bias.vs)) {
    if (!amount) continue;
    const weight = otherGrant[type];
    if (weight !== undefined) {
      total += amount * (weight || 0);
    } else {
      total += amount;
    }
  }
  return total;
}

export function polarityOnHitScalar(att, def) {
  const attGrant = collectGrant(att);
  const defGrant = collectGrant(def);
  const attBias = collectBias(att, "onHitBias");
  const base = computeOpposition(attGrant, defGrant) * POLARITY_SCALAR;
  const bias = attBias.base + applyVsAdjustments(attBias, defGrant);
  return clampPolarity(base + bias);
}

export function polarityDefScalar(def, att) {
  const defGrant = collectGrant(def);
  const attGrant = collectGrant(att);
  const defBias = collectBias(def, "defenseBias");
  const base = computeOpposition(defGrant, attGrant) * POLARITY_SCALAR;
  const bias = defBias.base + applyVsAdjustments(defBias, attGrant);
  return clampPolarity(base + bias);
}

export function polaritySummary(att, def) {
  const attGrant = collectGrant(att);
  const defGrant = collectGrant(def);
  const attBias = collectBias(att, "onHitBias");
  const defBias = collectBias(def, "defenseBias");
  const onHit = clampPolarity(
    computeOpposition(attGrant, defGrant) * POLARITY_SCALAR
      + attBias.base
      + applyVsAdjustments(attBias, defGrant),
  );
  const defense = clampPolarity(
    computeOpposition(defGrant, attGrant) * POLARITY_SCALAR
      + defBias.base
      + applyVsAdjustments(defBias, attGrant),
  );
  return { attGrant, defGrant, attBias, defBias, onHit, defense };
}
