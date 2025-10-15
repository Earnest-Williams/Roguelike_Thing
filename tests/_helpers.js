import assert from "node:assert/strict";
import { Actor } from "../src/combat/actor.js";
import { resolveAttack as coreResolveAttack } from "../src/combat/resolve.js";
import { setSeed as coreSetSeed, rand } from "../src/combat/rng.js";
import { rebuildDerived, addStatus, tickStatuses } from "../src/combat/status.js";
import { spendResources, canPay } from "../src/combat/resources.js";
import { finalAPForAction, spendAP, beginCooldown } from "../src/combat/time.js";
import { serializeActor, hydrateActor } from "../src/combat/save.js";
import { createHash } from "node:crypto";

let _idCounter = 1;

export function setSeed(seed) {
  coreSetSeed(seed);
}

export function createActor(options = {}) {
  const {
    id = `actor_${_idCounter++}`,
    baseStats = {},
    resists = {},
    immunities = [],
    armorFlat = 0,
    hp,
    stamina,
    mana,
    ap,
    accuracy,
    equipment,
  } = options;

  const base = {
    str: 10,
    dex: 10,
    int: 10,
    vit: 10,
    con: 10,
    will: 10,
    luck: 10,
    maxHP: 100,
    maxStamina: 20,
    maxMana: 10,
    baseSpeed: 1,
    ...baseStats,
  };

  const actor = new Actor({ id, baseStats: base, equipment });
  actor.accuracy = typeof accuracy === "number" ? accuracy : 1;

  if (Number.isFinite(ap)) actor.ap = Number(ap);
  if (Number.isFinite(hp)) {
    const next = Math.max(0, Number(hp));
    actor.hp = next;
    actor.res.hp = next;
  }
  if (Number.isFinite(stamina)) {
    const next = Math.max(0, Number(stamina));
    actor.stamina = next;
    actor.res.stamina = next;
    if (actor.resources?.pools?.stamina) {
      actor.resources.pools.stamina.cur = next;
      actor.resources.pools.stamina.max = Math.max(next, actor.resources.pools.stamina.max || 0);
    }
  }
  if (Number.isFinite(mana)) {
    const next = Math.max(0, Number(mana));
    actor.mana = next;
    actor.res.mana = next;
    if (actor.resources?.pools?.mana) {
      actor.resources.pools.mana.cur = next;
      actor.resources.pools.mana.max = Math.max(next, actor.resources.pools.mana.max || 0);
    }
  }

  if (actor.modCache?.defense?.resists) {
    for (const [type, value] of Object.entries(resists)) {
      actor.modCache.defense.resists[type] = Number(value) || 0;
    }
  }
  if (actor.modCache?.resists) {
    for (const [type, value] of Object.entries(resists)) {
      actor.modCache.resists[type] = Number(value) || 0;
    }
  }
  if (actor.modCache?.defense?.immunities instanceof Set) {
    for (const type of immunities) {
      actor.modCache.defense.immunities.add(type);
    }
  }
  if (actor.modCache?.immunities instanceof Set) {
    for (const type of immunities) {
      actor.modCache.immunities.add(type);
    }
  }
  if (!actor.modCache.defense.flatDR) {
    actor.modCache.defense.flatDR = Object.create(null);
  }
  if (Number.isFinite(armorFlat) && armorFlat > 0) {
    actor.modCache.defense.flatDR.all = (actor.modCache.defense.flatDR.all || 0) + armorFlat;
  }

  actor.statusDerived = rebuildDerived(actor);
  return actor;
}

export function resolveAttack(attacker, defender, options = {}) {
  const ctx = coreResolveAttack(attacker, defender, options);
  return ctx;
}

export function performAction(actor, actionId) {
  const ACTIONS = {
    PowerStrike: {
      baseAP: 40,
      resourceCost: { stamina: 5 },
      tags: ["attack"],
      cooldown: 3,
    },
    SustainBeam: {
      baseAP: 30,
      resourceCost: { mana: 2 },
      tags: ["channel", "attack"],
      cooldown: 4,
      channel: { drainPerTick: 1 },
    },
  };
  const action = ACTIONS[actionId];
  if (!action) {
    throw new Error(`Unknown action ${actionId}`);
  }

  const { baseAP, resourceCost, tags } = action;
  const { costAP } = finalAPForAction(actor, baseAP, tags);

  if (!canPay(actor, { resourceCost, tags })) {
    return { ok: false, reason: "insufficient", costAP };
  }
  if (!spendAP(actor, costAP)) {
    return { ok: false, reason: "ap", costAP };
  }

  spendResources(actor, resourceCost, tags);
  beginCooldown(actor, actionId, action.cooldown || 0);

  if (action.channel) {
    const handle = {
      actor,
      actionId,
      drainPerTick: action.channel.drainPerTick,
      active: true,
      costAP,
    };
    return { ok: true, channel: handle, costAP };
  }

  return { ok: true, costAP };
}

export function tickChannel(handle) {
  if (!handle || !handle.active) return handle;
  const actor = handle.actor;
  if (!actor) {
    handle.active = false;
    return handle;
  }
  const drain = Math.max(0, Number(handle.drainPerTick) || 0);
  if (drain <= 0) return handle;
  const cur = Number(actor.res?.mana ?? actor.mana ?? 0);
  const next = Math.max(0, cur - drain);
  if (actor.res) {
    actor.res.mana = next;
  }
  actor.mana = next;
  if (actor.resources?.pools?.mana) {
    actor.resources.pools.mana.cur = next;
  }
  if (next <= 0) {
    handle.active = false;
    beginCooldown(actor, handle.actionId, 1);
    handle.remaining = 0;
  }
  return handle;
}

export function applyStatus(target, payload) {
  assert.ok(payload?.type, "status payload requires type");
  const stacks = Number.isFinite(payload.stacks) ? payload.stacks : 1;
  const duration = Number.isFinite(payload.duration) ? payload.duration : 1;
  addStatus(target, payload.type, { stacks, duration });
  target.statusDerived = rebuildDerived(target);
}

export function tickN(turns, { actors = [] } = {}) {
  const list = Array.isArray(actors) ? actors.filter(Boolean) : [];
  for (let i = 0; i < turns; i += 1) {
    for (const actor of list) {
      const nextTurn = (Number(actor.turn) || 0) + 1;
      tickStatuses(actor, nextTurn);
      actor.turn = nextTurn;
      actor.statusDerived = rebuildDerived(actor);
    }
  }
}

export function serialize(namedActors) {
  const out = {};
  for (const [key, actor] of Object.entries(namedActors || {})) {
    out[key] = {
      baseStats: { ...actor.base },
      snapshot: serializeActor(actor),
      turn: Number(actor.turn) || 0,
    };
  }
  return JSON.stringify(out);
}

export function deserialize(blob) {
  const raw = typeof blob === "string" ? JSON.parse(blob) : blob;
  const out = {};
  for (const [key, entry] of Object.entries(raw || {})) {
    const actor = createActor({ id: key, baseStats: entry.baseStats });
    hydrateActor(actor, entry.snapshot);
    if (Number.isFinite(entry.turn)) {
      actor.turn = Number(entry.turn);
    }
    actor.resources = actor.resources || { pools: Object.create(null) };
    actor.resources.hp = Number.isFinite(actor.hp) ? Number(actor.hp) : 0;
    actor.res = actor.resources;
    actor.statusDerived = rebuildDerived(actor);
    out[key] = actor;
  }
  return out;
}

export function runShortCombat() {
  const attacker = createActor({ id: "short_atk", accuracy: 0.75, baseStats: { maxHP: 50 } });
  const defender = createActor({ id: "short_def", baseStats: { maxHP: 60 }, hp: 60 });
  const packets = [];
  for (let i = 0; i < 3 && defender.hp > 0; i += 1) {
    attacker.turn = i;
    defender.turn = i;
    const result = resolveAttack(attacker, defender, {
      prePackets: [{ type: "slash", amount: 7 }],
      rng: rand,
    });
    for (const pkt of result.packetsAfterDefense || []) {
      packets.push({ type: pkt.type, amount: pkt.amount });
    }
  }
  return { packets };
}

export function hashPackets(packets) {
  const payload = JSON.stringify(packets.map((p) => ({ type: p.type, amount: p.amount })));
  return createHash("sha1").update(payload).digest("hex");
}

export { finalAPForAction, spendAP };
