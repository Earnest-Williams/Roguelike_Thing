// src/combat/resolve.js
// @ts-check
import { DEFAULT_MARTIAL_DAMAGE_TYPE } from "../../js/constants.js";
import { applyOneStatusAttempt, rebuildStatusDerived, tryApplyHaste } from "./status.js";
import { applyOnKillResourceGain } from "./resources.js";
import { noteUseGain } from "./attunement.js";
import { polarityOffenseScalar, polarityDefenseScalar } from "./polarity.js";
import { clamp01 } from "../utils/number.js";
import { consolidatedResists } from "./defense-merge.js";
import { showAttackDebug } from "../ui/debug-panel.js";

/**
 * @typedef {{ type:string, amount:number, __isBase?:boolean }} Packet
 * @typedef {{
 *   attacker:any,
 *   defender:any,
 *   turn:number,
 *   prePackets: Packet[],
 *   packetsAfterOffense: (Packet[] & Record<string, number>) & { byType?: Record<string, number> },
 *   packetsAfterDefense: (Packet[] & Record<string, number>) & { byType?: Record<string, number> },
 *   statusAttempts: Array<Record<string, any>>,
 *   totalDamage:number,
 *   appliedStatuses:any[],
 *   hooks?: Record<string, any>,
 *   echo?: { triggered:boolean, totalDamage?:number, fraction?:number, chance?:number, allowOnKill?:boolean, result?:AttackContext|null }|null,
 *   rng?: (()=>number)|null,
 *   isEcho?: boolean,
 *   hpBefore?: number,
 *   hpAfter?: number,
 * }} AttackContext
 */

/**
 * Resolve an attack using either the new options signature or the legacy context payload.
 * @param {any} arg0
 * @param {any} [arg1]
 * @param {any} [arg2]
 * @returns {AttackContext}
 */
export function resolveAttack(arg0, arg1, arg2) {
  const looksLikeLegacy = !!(arg0 && typeof arg0 === "object" && arg0.attacker && arg0.defender && arg1 === undefined);
  if (arguments.length === 1 || looksLikeLegacy) {
    return resolveAttackFromLegacyContext(/** @type {{ attacker:any, defender:any }} */ (arg0));
  }
  return resolveAttackCore(arg0, arg1, arg2 || {});
}

/**
 * Compatibility bridge for the old resolveAttack({ attacker, defender, ... }) signature.
 * @param {{ attacker:any, defender:any, [key:string]:any }} legacy
 */
function resolveAttackFromLegacyContext(legacy) {
  if (!legacy) throw new Error("resolveAttack requires a context");
  const attacker = legacy.attacker;
  const defender = legacy.defender;
  if (!attacker || !defender) {
    throw new Error("resolveAttack context must include attacker and defender");
  }

  const options = {
    turn: legacy.turn,
    rng: legacy.rng,
    isEcho: legacy.isEcho,
    base: legacy.attack?.base ?? legacy.base ?? legacy.physicalBase ?? 0,
    type: legacy.attack?.type ?? legacy.type,
    prePackets: legacy.prePackets ?? legacy.packets,
    statusAttempts: legacy.statusAttempts,
    conversions: legacy.conversions,
    brands: legacy.brands,
    damageScalar: legacy.damageScalar,
    skipOnHitStatuses: legacy.skipOnHitStatuses,
  };

  if (Array.isArray(legacy.packets) && legacy.packets.length) {
    options.base = 0;
  }

  return resolveAttackCore(attacker, defender, options);
}

/**
 * Core resolve pipeline. Builds an AttackContext and mutates defender state accordingly.
 * @param {any} attacker
 * @param {any} defender
 * @param {any} opts
 * @returns {AttackContext}
 */
function resolveAttackCore(attacker, defender, opts = {}) {
  if (!attacker || !defender) {
    throw new Error("resolveAttack requires attacker and defender");
  }

  const turn = Number.isFinite(opts?.turn)
    ? Number(opts.turn)
    : Number.isFinite(attacker?.turn)
    ? Number(attacker.turn)
    : 0;
  attacker.turn = Number.isFinite(attacker.turn) ? attacker.turn : turn;
  defender.turn = Number.isFinite(defender.turn) ? defender.turn : turn;

  const baseType =
    typeof opts?.type === "string" && opts.type
      ? String(opts.type)
      : DEFAULT_MARTIAL_DAMAGE_TYPE;
  const baseAmountRaw = Number(opts?.base ?? 0);
  const baseAmount = Number.isFinite(baseAmountRaw) ? Math.max(0, Math.floor(baseAmountRaw)) : 0;
  const rng = typeof opts?.rng === "function" ? opts.rng : null;

  const initialPackets = normalizePacketList(opts?.prePackets);
  if (Array.isArray(opts?.packets) && opts.packets.length) {
    initialPackets.push(...normalizePacketList(opts.packets));
  }
  if (baseAmount > 0) {
    initialPackets.push(createPacket(baseType, baseAmount, true));
  }

  const attemptSource = Array.isArray(opts?.statusAttempts)
    ? opts.statusAttempts
    : opts?.statusAttempts
    ? [opts.statusAttempts]
    : [];

  const ctx /** @type {AttackContext} */ = {
    attacker,
    defender,
    turn,
    rng,
    isEcho: Boolean(opts?.isEcho),
    prePackets: attachPacketAccess(initialPackets),
    packetsAfterOffense: attachPacketAccess([]),
    packetsAfterDefense: attachPacketAccess([]),
    statusAttempts: sanitizeStatusAttempts(attemptSource),
    totalDamage: 0,
    appliedStatuses: [],
    hooks: Object.create(null),
    echo: null,
    hpBefore: getCurrentHp(defender),
    hpAfter: getCurrentHp(defender),
  };

  // ----- offense stages -----
  const conversionSources = [];
  if (Array.isArray(attacker?.modCache?.offense?.conversions)) {
    conversionSources.push(...attacker.modCache.offense.conversions);
  }
  if (Array.isArray(opts?.conversions)) {
    conversionSources.push(...opts.conversions);
  }
  let packets = conversionPipeline(ctx.prePackets, conversionSources);

  const brandSources = [];
  if (Array.isArray(attacker?.modCache?.offense?.brands)) {
    brandSources.push(...attacker.modCache.offense.brands);
  }
  if (Array.isArray(attacker?.modCache?.brands)) {
    brandSources.push(...attacker.modCache.brands);
  }
  if (Array.isArray(opts?.brands)) {
    brandSources.push(...opts.brands);
  }
  const brandResult = applyBrands(packets, brandSources);
  packets = brandResult.packets;
  if (brandResult.statusAttempts.length) {
    ctx.statusAttempts.push(...brandResult.statusAttempts);
  }

  const affinitySources = [];
  if (attacker?.modCache?.offense?.affinities) affinitySources.push(attacker.modCache.offense.affinities);
  if (attacker?.modCache?.affinities) affinitySources.push(attacker.modCache.affinities);
  if (opts?.affinities) affinitySources.push(opts.affinities);
  const affinityMap = mergeNumericMaps(affinitySources);
  packets = scaleByAffinity(packets, affinityMap);

  const atkSD = attacker?.statusDerived || {};
  const statusDamagePct = Number.isFinite(atkSD.damagePct) ? atkSD.damagePct : 0;
  const statusDamageFlat = Number.isFinite(atkSD.damageFlat) ? atkSD.damageFlat : 0;
  if (statusDamagePct !== 0 || statusDamageFlat !== 0) {
    const statusMult = 1 + statusDamagePct;
    packets = packets.map((pkt) =>
      createPacket(
        pkt.type,
        pkt.amount * statusMult + statusDamageFlat,
        Boolean(pkt.__isBase)
      )
    );
  }

  const attackerForPolarity = opts?.atkPol ? { ...attacker, polarity: opts.atkPol } : attacker;
  const defenderForPolarity = opts?.defPol ? { ...defender, polarity: opts.defPol } : defender;
  const offenseScalar = polarityOffenseScalar(attackerForPolarity, defenderForPolarity);
  const offenseMult = 1 + offenseScalar;
  if (offenseMult !== 1) {
    packets = packets.map((pkt) => createPacket(pkt.type, Math.max(0, Math.floor(pkt.amount * offenseMult)), false));
  }

  ctx.packetsAfterOffense = attachPacketAccess(packets);

  // ----- defense stages -----
  const immunities = mergeImmunities(defender, opts);
  const defenseScalar = polarityDefenseScalar(defenderForPolarity, attackerForPolarity);
  const defenseMult = Math.max(0, 1 + defenseScalar);
  const extraResists = opts?.resists;
  let defendedPackets = applyDefense(packets, {
    defender,
    resists: extraResists,
    immunities,
    defenseMult,
    defPol: defenderForPolarity,
    atkPol: attackerForPolarity,
    polScalar: defenseScalar,
  });

  const damageScalar = Number.isFinite(opts?.damageScalar) ? Math.max(0, Number(opts.damageScalar)) : 1;
  if (damageScalar !== 1) {
    defendedPackets = defendedPackets.map((pkt) => createPacket(pkt.type, Math.max(0, Math.floor(pkt.amount * damageScalar)), false));
  }

  ctx.packetsAfterDefense = attachPacketAccess(defendedPackets);
  ctx.totalDamage = defendedPackets.reduce((sum, pkt) => sum + Math.max(0, Math.floor(pkt.amount)), 0);

  if (ctx.totalDamage > 0) {
    applyDamageToTarget(defender, ctx.totalDamage);
  }
  ctx.hpAfter = getCurrentHp(defender);
  const killed = ctx.hpBefore > 0 && ctx.hpAfter <= 0;

  if (!opts?.skipOnHitStatuses && ctx.statusAttempts.length) {
    const applied = [];
    for (const attempt of ctx.statusAttempts) {
      const result = applyOneStatusAttempt({ attacker, defender, attempt, turn, rng: ctx.rng || undefined });
      if (result && !result.ignored) {
        applied.push(result);
      }
    }
    if (applied.length) {
      ctx.appliedStatuses = applied;
      rebuildStatusDerived(defender);
    }
  }

  maybeApplyOnKillHaste(attacker, killed, ctx);
  maybeEcho(attacker, defender, ctx);

  const dealtTypes = [];
  for (const pkt of defendedPackets) {
    if (!pkt || typeof pkt.type !== "string" || !pkt.type) continue;
    const amount = Number(pkt.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    dealtTypes.push(pkt.type);
  }
  if (dealtTypes.length) {
    noteUseGain(attacker, dealtTypes);
  }

  if (ctx.hooks && !Object.keys(ctx.hooks).length) {
    ctx.hooks = undefined;
  }

  if (isAttackDebugEnabled()) {
    showAttackDebug(ctx);
  }

  return ctx;
}

// ----- helper functions -----

/** @param {any} target */
function getCurrentHp(target) {
  if (!target) return 0;
  if (Number.isFinite(target?.res?.hp)) return Number(target.res.hp);
  if (Number.isFinite(target?.resources?.hp)) return Number(target.resources.hp);
  if (Number.isFinite(target?.hp)) return Number(target.hp);
  return 0;
}

/**
 * @param {any} target
 * @param {number} amount
 */
function applyDamageToTarget(target, amount) {
  if (!target) return;
  const dmg = Math.max(0, Math.floor(Number(amount) || 0));
  if (!dmg) return;
  if (target.res && Number.isFinite(target.res.hp)) {
    const next = Math.max(0, Math.floor(target.res.hp - dmg));
    target.res.hp = next;
    if (target.resources && typeof target.resources === "object") {
      target.resources.hp = next;
      if (target.resources.pools?.hp) {
        target.resources.pools.hp.cur = next;
      }
    }
    if (Number.isFinite(target.hp)) {
      target.hp = next;
    }
    return;
  }
  if (Number.isFinite(target.hp)) {
    const next = Math.max(0, Math.floor(target.hp - dmg));
    target.hp = next;
    if (target.resources && typeof target.resources === "object") {
      target.resources.hp = next;
      if (target.resources.pools?.hp) {
        target.resources.pools.hp.cur = next;
      }
    }
  }
}

/**
 * @param {any} list
 * @returns {Packet[]}
 */
function normalizePacketList(list) {
  const out = [];
  if (!list) return out;
  const push = (type, amount, isBase = false) => {
    if (!type) return;
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    out.push(createPacket(String(type), Math.floor(numeric), isBase));
  };
  if (Array.isArray(list)) {
    for (const entry of list) {
      if (!entry) continue;
      const type = entry.type ?? entry.id ?? null;
      const amount = entry.amount ?? entry.value ?? entry.flat ?? 0;
      const isBase = Boolean(entry.__isBase || entry.isBase || entry.base);
      push(type, amount, isBase);
    }
    return out;
  }
  if (typeof list === "object") {
    for (const [type, amount] of Object.entries(list)) {
      push(type, amount, false);
    }
  }
  return out;
}

/**
 * @param {string} type
 * @param {number} amount
 * @param {boolean} [isBase]
 * @returns {Packet}
 */
function createPacket(type, amount, isBase = false) {
  const pkt = { type, amount: Math.max(0, Math.floor(amount)) };
  if (isBase) {
    pkt.__isBase = true;
  }
  return pkt;
}

/**
 * @template T extends Packet
 * @param {T[]} list
 * @returns {(T[] & Record<string, number>) & { byType?: Record<string, number> }}
 */
function attachPacketAccess(list) {
  const arr = Array.isArray(list) ? list.map((pkt) => ({ ...pkt })) : [];
  const totals = Object.create(null);
  for (const pkt of arr) {
    totals[pkt.type] = (totals[pkt.type] || 0) + Math.max(0, Math.floor(pkt.amount));
  }
  for (const [type, amount] of Object.entries(totals)) {
    arr[type] = amount;
  }
  arr.byType = totals;
  return /** @type {(T[] & Record<string, number>) & { byType?: Record<string, number> }} */ (arr);
}

/**
 * @param {any[]} attempts
 */
function sanitizeStatusAttempts(attempts) {
  if (!Array.isArray(attempts)) return [];
  const out = [];
  for (const attempt of attempts) {
    const cloned = cloneStatusAttempt(attempt);
    if (cloned) out.push(cloned);
  }
  return out;
}

/**
 * @param {any} attempt
 */
function cloneStatusAttempt(attempt) {
  if (!attempt || typeof attempt !== "object" || !attempt.id) return null;
  const entry = { id: String(attempt.id) };
  for (const key of [
    "chance",
    "baseChance",
    "chancePct",
    "stacks",
    "duration",
    "potency",
    "copy",
  ]) {
    if (attempt[key] !== undefined) {
      entry[key] = attempt[key];
    }
  }
  return entry;
}

/**
 * @param {Array<Record<string, any>>} attempts
 */
function cloneStatusAttemptList(attempts) {
  if (!Array.isArray(attempts)) return [];
  const out = [];
  for (const attempt of attempts) {
    const cloned = cloneStatusAttempt(attempt);
    if (cloned) out.push(cloned);
  }
  return out;
}

/**
 * Processes a list of damage packets through a set of conversion rules.
 * @param {Packet[]} packets - The initial list of damage packets.
 * @param {any[]} conversions - The list of conversion rules to apply.
 * @returns {Packet[]} - A new, coalesced list of packets after conversions.
 */
function conversionPipeline(packets, conversions) {
  if (!Array.isArray(conversions) || !conversions.length) {
    return packets.map((pkt) => createPacket(pkt.type, pkt.amount, pkt.__isBase));
  }

  const outputPackets = [];

  for (const pkt of packets) {
    const baseAmount = Math.max(0, Number(pkt?.amount) || 0);
    if (!pkt?.type || baseAmount <= 0) continue;

    let remaining = baseAmount;

    for (const conv of conversions) {
      if (!conv) continue;
      const from = conv.from || conv.source || null;
      if (from && from !== pkt.type) continue;
      if (conv.includeBaseOnly && !pkt.__isBase) continue;

      const pct = pickNumber(conv.pct, conv.percent, conv.ratio);
      if (!Number.isFinite(pct) || pct <= 0) continue;

      const toType = conv.to || conv.into || conv.type || null;
      if (!toType) continue;

      const take = Math.floor(remaining * pct);
      if (take <= 0) continue;

      outputPackets.push(createPacket(String(toType), take, false));
      remaining -= take;

      if (remaining <= 0) break;
    }

    if (remaining > 0) {
      outputPackets.push(createPacket(pkt.type, remaining, pkt.__isBase));
    }
  }

  const coalesced = new Map();
  for (const pkt of outputPackets) {
    coalesced.set(pkt.type, (coalesced.get(pkt.type) || 0) + pkt.amount);
  }
  return Array.from(coalesced, ([type, amount]) => createPacket(type, amount, false));
}

/**
 * @param {Packet[]} packets
 * @param {any[]} brands
 */
function applyBrands(packets, brands) {
  if (!Array.isArray(brands) || !brands.length) {
    return { packets: packets.map((pkt) => createPacket(pkt.type, pkt.amount, pkt.__isBase)), statusAttempts: [] };
  }
  const out = [];
  const statusAttempts = [];
  for (const pkt of packets) {
    const baseAmount = Math.max(0, Number(pkt?.amount) || 0);
    if (!pkt?.type || baseAmount <= 0) continue;
    let amount = baseAmount;
    for (const brand of brands) {
      if (!brand) continue;
      const matchType = typeof brand.type === "string"
        ? brand.type
        : typeof brand.damageType === "string"
        ? brand.damageType
        : typeof brand.element === "string"
        ? brand.element
        : null;
      if (matchType && matchType !== pkt.type) continue;
      if (brand.includeBaseOnly && !pkt.__isBase) continue;
      const flat = pickNumber(brand.flat, brand.amount, brand.value, brand.add);
      if (Number.isFinite(flat) && flat) {
        amount += Number(flat);
      }
      const pctRaw = pickNumber(brand.pct, brand.percent, brand.mult, brand.multiplier);
      if (Number.isFinite(pctRaw) && pctRaw) {
        amount = Math.max(0, Math.floor(amount * (1 + Number(pctRaw))));
      }
      if (Array.isArray(brand.onHitStatuses)) {
        for (const attempt of brand.onHitStatuses) {
          const cloned = cloneStatusAttempt(attempt);
          if (cloned) statusAttempts.push(cloned);
        }
      }
    }
    out.push(createPacket(pkt.type, amount, pkt.__isBase));
  }
  return { packets: out, statusAttempts };
}

/**
 * @param {Packet[]} packets
 * @param {Record<string, number>} affinities
 */
function scaleByAffinity(packets, affinities) {
  if (!Array.isArray(packets) || !packets.length) return [];
  const out = [];
  for (const pkt of packets) {
    const bonus = Number(affinities?.[pkt.type] ?? 0);
    if (Number.isFinite(bonus) && bonus !== 0) {
      const scaled = Math.max(0, Math.floor(pkt.amount * (1 + bonus)));
      out.push(createPacket(pkt.type, scaled, pkt.__isBase));
    } else {
      out.push(createPacket(pkt.type, pkt.amount, pkt.__isBase));
    }
  }
  return out;
}

/**
 * @param {Array<Record<string, number>>} sources
 */
function mergeNumericMaps(sources) {
  const out = Object.create(null);
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    for (const [key, value] of Object.entries(source)) {
      const num = Number(value);
      if (!Number.isFinite(num) || num === 0) continue;
      out[key] = (out[key] || 0) + num;
    }
  }
  return out;
}

/**
 * @param  {...Record<string, number>} sources
 */
function mergeResists(...sources) {
  const out = Object.create(null);
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    for (const [type, value] of Object.entries(source)) {
      const num = Number(value);
      if (!Number.isFinite(num) || num === 0) continue;
      out[type] = (out[type] || 0) + num;
    }
  }
  for (const key of Object.keys(out)) {
    out[key] = Math.max(0, Math.min(0.95, out[key]));
  }
  return out;
}

/**
 * @param {any} defender
 * @param {any} opts
 */
function mergeImmunities(defender, opts) {
  const set = new Set();
  const push = (source) => {
    if (!source) return;
    if (source instanceof Set) {
      for (const entry of source) {
        if (entry) set.add(String(entry));
      }
      return;
    }
    if (Array.isArray(source)) {
      for (const entry of source) {
        if (entry) set.add(String(entry));
      }
      return;
    }
    if (typeof source === "object") {
      for (const [key, value] of Object.entries(source)) {
        if (value) set.add(String(key));
      }
    }
  };
  push(defender?.modCache?.defense?.immunities);
  push(defender?.modCache?.immunities);
  push(opts?.immunities);
  return set;
}

/**
 * @param {Packet[]} packets
 * @param {{ defender?: any, resists?: Record<string, number>|Record<string, number>[]|null, immunities: Set<string>, defenseMult?: number, polScalar?: number, defPol?:any, atkPol?:any }} args
 */
function applyDefense(packets, { defender, resists, immunities, defenseMult, polScalar, defPol, atkPol }) {
  let mult = Number.isFinite(defenseMult) ? Number(defenseMult) : NaN;
  if (!Number.isFinite(mult)) {
    const scalar = Number.isFinite(polScalar) ? Number(polScalar) : polarityDefenseScalar(defPol, atkPol);
    mult = 1 + scalar;
  }
  const finalMult = mult > 0 ? mult : 0;
  const baseResists = consolidatedResists(defender);
  const resistSources = Array.isArray(resists) ? resists : [resists];
  const mergedResists = mergeResists(baseResists, ...resistSources);
  const out = [];
  for (const pkt of packets) {
    if (!pkt?.type) continue;
    if (immunities && immunities.has(pkt.type)) continue;
    const resist = clamp01(mergedResists?.[pkt.type] || 0);
    const scaled = Math.max(0, Math.floor(pkt.amount * (1 - resist) * finalMult));
    if (scaled > 0) {
      out.push(createPacket(pkt.type, scaled, false));
    }
  }
  return out;
}

/**
 * @param {any} attacker
 * @param {boolean} killed
 * @param {AttackContext} ctx
 */
function maybeApplyOnKillHaste(attacker, killed, ctx) {
  if (!attacker || !killed) return;
  const temporal = attacker?.modCache?.temporal || Object.create(null);
  const echoCfg = temporal.echo;
  if (ctx?.isEcho && echoCfg && echoCfg.allowOnKill === false) {
    return;
  }
  let hasteApplied = null;
  if (temporal.onKillHaste) {
    hasteApplied = tryApplyHaste(attacker, temporal.onKillHaste);
    if (hasteApplied) {
      rebuildStatusDerived(attacker);
    }
  }
  let resourceGains = null;
  if (attacker?.modCache?.resource?.onKillGain) {
    resourceGains = applyOnKillResourceGain(attacker, attacker.modCache.resource.onKillGain);
  }
  if (hasteApplied) {
    ctx.hooks ||= Object.create(null);
    ctx.hooks.hasteApplied = {
      statusId: hasteApplied.id,
      stacks: hasteApplied.stacks,
      duration: Number.isFinite(hasteApplied.endsAt)
        ? Math.max(0, Math.floor(hasteApplied.endsAt - (attacker?.turn ?? 0)))
        : undefined,
      potency: hasteApplied.potency,
    };
  }
  if (resourceGains) {
    ctx.hooks ||= Object.create(null);
    ctx.hooks.resourceGains = resourceGains;
  }
}

/**
 * @param {any} attacker
 * @param {any} defender
 * @param {AttackContext} ctx
 */
function maybeEcho(attacker, defender, ctx) {
  const temporal = attacker?.modCache?.temporal || Object.create(null);
  const echoCfg = temporal.echo;
  if (!echoCfg || ctx.isEcho) return;

  const chance = clamp01(pickNumber(
    echoCfg.chancePct,
    echoCfg.chance,
    echoCfg.probability,
    echoCfg.rate,
    echoCfg.prob,
  ) || 0);
  const rng = ctx?.rng || Math.random;
  const roll = typeof rng === "function" ? rng() : Math.random();
  if (!(chance >= 1 || roll <= chance)) {
    if (chance > 0) {
      const summary = { triggered: false, chance, fraction: 0 };
      ctx.echo = summary;
      ctx.hooks ||= Object.create(null);
      ctx.hooks.echo = summary;
    }
    return;
  }

  const fraction = clamp01(pickNumber(
    echoCfg.fraction,
    echoCfg.percent,
    echoCfg.pct,
    echoCfg.mult,
    echoCfg.multiplier,
    echoCfg.damageScalar,
    echoCfg.damageMult,
  ) || 0);
  if (fraction <= 0) {
    const summary = { triggered: false, chance, fraction };
    ctx.echo = summary;
    ctx.hooks ||= Object.create(null);
    ctx.hooks.echo = summary;
    return;
  }

  const basePackets = Array.isArray(ctx.packetsAfterOffense) ? ctx.packetsAfterOffense : [];
  const scaled = basePackets
    .map((pkt) => createPacket(pkt.type, Math.max(0, Math.floor(pkt.amount * fraction)), pkt.__isBase))
    .filter((pkt) => pkt.amount > 0);
  if (!scaled.length) {
    const summary = { triggered: false, chance, fraction };
    ctx.echo = summary;
    ctx.hooks ||= Object.create(null);
    ctx.hooks.echo = summary;
    return;
  }

  const statusAttempts = echoCfg.copyStatuses ? cloneStatusAttemptList(ctx.statusAttempts) : [];
  const echoCtx = resolveAttackCore(attacker, defender, {
    prePackets: scaled,
    base: 0,
    type: scaled[0]?.type || DEFAULT_MARTIAL_DAMAGE_TYPE,
    statusAttempts,
    isEcho: true,
    turn: ctx.turn,
    rng: ctx.rng,
    skipOnHitStatuses: !echoCfg.copyStatuses,
  });
  const summary = {
    triggered: true,
    chance,
    fraction,
    allowOnKill: echoCfg.allowOnKill !== false,
    totalDamage: echoCtx.totalDamage,
    result: echoCtx,
  };
  ctx.echo = summary;
  ctx.hooks ||= Object.create(null);
  ctx.hooks.echo = summary;
}

function isAttackDebugEnabled() {
  if (typeof globalThis === "undefined") return false;
  const g = /** @type {any} */ (globalThis);
  if (g.__ATTACK_DEBUG__ || g.ATTACK_DEBUG || g.DEBUG_ATTACK) {
    return true;
  }
  const flags = g.DEBUG_FLAGS;
  if (flags && (flags.attackDebug || flags.attackPackets || flags.combatAttackDebug)) {
    return true;
  }
  try {
    const ls = g.localStorage;
    if (ls && typeof ls.getItem === "function") {
      const value = ls.getItem("attack-debug");
      if (value === "1" || value === "true") {
        return true;
      }
    }
  } catch {
    // ignore storage access issues
  }
  return false;
}

/**
 * @param {any} attacker
 * @param {string[]} types
 */
/**
 * @param {...any} values
 */
function pickNumber(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return undefined;
}

