// src/combat/polarity.js
// @ts-check
import { POLARITY_CLAMP, POLARITY_SCALAR } from "../config.js";

const POLAR_TYPES = Object.freeze(["order", "growth", "chaos", "decay", "void"]);
const POLAR_TYPE_SET = new Set(POLAR_TYPES);

export const POLAR_OPPOSE = Object.freeze({
  order: Object.freeze(["chaos", "void"]),
  growth: Object.freeze(["decay", "void"]),
  chaos: Object.freeze(["order", "growth"]),
  decay: Object.freeze(["growth", "order"]),
  void: Object.freeze(["order", "growth"]),
});

function makeZeroVector() {
  const out = Object.create(null);
  for (const type of POLAR_TYPES) out[type] = 0;
  return out;
}

/**
 * Normalize any polarity payload (object/map/array/string) to a non-negative vector with L1 norm = 1.
 * @param {any} input
 */
export function normalizePolarity(input = {}) {
  const out = makeZeroVector();
  const add = (type, value) => {
    if (!POLAR_TYPE_SET.has(type)) return;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return;
    out[type] += amount;
  };

  if (typeof input === "string") {
    add(input, 1);
  } else if (Array.isArray(input)) {
    for (const entry of input) {
      if (!entry) continue;
      const type = entry.type || entry.id || entry.element || entry.damageType;
      const value = entry.amount ?? entry.value ?? entry.flat ?? entry.scalar ?? entry.bias;
      add(String(type || ""), value);
    }
  } else if (input instanceof Map) {
    for (const [type, value] of input.entries()) {
      add(String(type || ""), value);
    }
  } else if (typeof input === "object" && input) {
    for (const key of Object.keys(input)) {
      add(String(key), input[key]);
    }
  }

  let total = 0;
  for (const type of POLAR_TYPES) {
    total += out[type];
  }
  if (total <= 0) {
    return makeZeroVector();
  }
  const normalized = makeZeroVector();
  for (const type of POLAR_TYPES) {
    normalized[type] = out[type] / total;
  }
  return normalized;
}

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
  if (source?.polarityRaw) {
    enqueue(source.polarityRaw);
  } else if (source?.polarity) {
    enqueue(source.polarity);
  }
  if (source?.polarityVector && source.polarityVector !== source.polarityRaw && source.polarityVector !== source.polarity) {
    enqueue(source.polarityVector);
  }
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

function clampScore(score) {
  if (!Number.isFinite(score)) return 0;
  if (score > 1) return 1;
  if (score < -1) return -1;
  return score;
}

export function polarityAlignmentScore(att, def) {
  const scalar = polarityOnHitScalar(att, def);
  const cap = Math.max(Math.abs(POLARITY_CLAMP.max || 0.5), Math.abs(POLARITY_CLAMP.min || 0.5)) || 0.5;
  if (!cap) return 0;
  return clampScore((scalar || 0) / cap);
}

export function polarityOffenseMult(attPol, defPol, cap = 0.5) {
  const score = polarityAlignmentScore(attPol, defPol);
  const clamped = Math.max(-cap, Math.min(cap, score * cap));
  return Math.max(0, 1 + clamped);
}

export function polarityDefenseMult(defPol, attPol, cap = 0.5) {
  const score = polarityAlignmentScore(attPol, defPol);
  const clamped = Math.max(-cap, Math.min(cap, -score * cap));
  return Math.max(0, 1 + clamped);
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
  const attVector = normalizePolarity(attGrant);
  const defVector = normalizePolarity(defGrant);
  return {
    attGrant,
    defGrant,
    attBias,
    defBias,
    onHit,
    defense,
    offenseMult: polarityOffenseMult(att, def),
    defenseMult: polarityDefenseMult(def, att),
    attVector,
    defVector,
  };
}
