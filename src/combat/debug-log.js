// src/combat/debug-log.js
// Tiny ring buffer for combat/debug events
export class RingLog {
  constructor(capacity = 64) {
    this.cap = capacity;
    this.buf = new Array(capacity);
    this.write = 0;
    this.size = 0;
  }

  push(evt) {
    this.buf[this.write] = { t: performance.now(), ...evt };
    this.write = (this.write + 1) % this.cap;
    this.size = Math.min(this.size + 1, this.cap);
  }

  toArray() {
    const out = [];
    for (let i = 0; i < this.size; i++) {
      const idx = (this.write - this.size + i + this.cap) % this.cap;
      out.push(this.buf[idx]);
    }
    return out;
  }
}

// Per-actor and global logs (attach to actor on spawn)
export function attachLogs(actor, capacity = 64) {
  if (!actor) return actor;
  actor.logs = actor.logs || {};
  actor.logs.attack = actor.logs.attack || new RingLog(capacity);
  actor.logs.status = actor.logs.status || new RingLog(capacity);
  actor.logs.turn = actor.logs.turn || new RingLog(capacity);
  actor._debug = actor._debug || { turns: [] };
  return actor;
}

// Convenient helpers
export const logAttackStep = (actor, data) =>
  actor?.logs?.attack?.push({ kind: "attack_step", ...data });

export const logStatusEvt = (actor, data) =>
  actor?.logs?.status?.push({ kind: "status_evt", ...data });

export const logTurnEvt = (actor, data) =>
  actor?.logs?.turn?.push({ kind: "turn_evt", ...data });

export function noteAttackStep(actor, step) {
  if (!actor) return;
  if (!actor._debug || typeof actor._debug !== "object") {
    actor._debug = { turns: [] };
  }
  const bucket = actor._debug.turns || (actor._debug.turns = []);
  const entry = {
    turn: Number.isFinite(actor.turn) ? actor.turn : 0,
    step,
  };
  bucket.push(entry);
  if (bucket.length > 32) bucket.shift();
}
