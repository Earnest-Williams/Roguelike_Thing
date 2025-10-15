// src/combat/attack-breakdown.js
// @ts-nocheck

/**
 * Create a plain clone of JSON-compatible data. Functions and circular
 * references are intentionally dropped so the result can be safely serialized
 * for UI payloads.
 *
 * @template T
 * @param {T} value
 * @returns {T | undefined}
 */
function cloneJson(value) {
  if (value == null) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return undefined;
  }
}

/**
 * Return a shallow copy of a map-like object containing numeric totals. The
 * output is normalized to finite integers so it can be rendered directly.
 *
 * @param {Record<string, any> | undefined | null} source
 * @returns {Record<string, number>}
 */
function cloneTotals(source) {
  const out = Object.create(null);
  if (!source || typeof source !== "object") return out;
  for (const [key, value] of Object.entries(source)) {
    if (!key) continue;
    const amount = Number(value);
    if (!Number.isFinite(amount)) continue;
    out[key] = Math.trunc(amount);
  }
  return out;
}

/**
 * Compute the delta between two per-type total maps.
 *
 * @param {Record<string, number>} current
 * @param {Record<string, number>} previous
 * @returns {Record<string, number> | undefined}
 */
function computeDiff(current, previous) {
  const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);
  /** @type {Record<string, number>} */
  const diff = Object.create(null);
  for (const key of keys) {
    const next = Number(current[key] ?? 0);
    const prev = Number(previous[key] ?? 0);
    const delta = next - prev;
    if (!delta) continue;
    diff[key] = delta;
  }
  return Object.keys(diff).length ? diff : undefined;
}

/**
 * Normalize an arbitrary step snapshot into a serializable shape.
 *
 * @param {{ stage?: string; packets?: any; totals?: Record<string, number>; meta?: any }} step
 * @param {Record<string, number>} prevTotals
 */
function normalizeStep(step, prevTotals) {
  const stage = typeof step?.stage === "string" ? step.stage : "?";
  const totalsSource = step?.totals
    ? step.totals
    : step?.packets?.byType
    ? step.packets.byType
    : Array.isArray(step?.packets)
    ? step.packets.reduce((acc, pkt) => {
        const type = typeof pkt?.type === "string" ? pkt.type : null;
        if (!type) return acc;
        const amount = Number(pkt?.amount);
        if (!Number.isFinite(amount)) return acc;
        acc[type] = (acc[type] || 0) + Math.trunc(amount);
        return acc;
      }, /** @type {Record<string, number>} */ (Object.create(null)))
    : undefined;
  const totals = cloneTotals(totalsSource);
  const diff = computeDiff(totals, prevTotals);
  const meta = cloneJson(step?.meta);
  return { stage, totals, diff, meta };
}

/**
 * Serialize a list of stage snapshots into an ordered breakdown that includes
 * per-stage totals and diffs.
 *
 * @param {Array<{ stage?: string; packets?: any; totals?: Record<string, number>; meta?: any }> | undefined | null} steps
 */
export function serializeAttackSteps(steps) {
  const list = Array.isArray(steps) ? steps : [];
  /** @type {ReturnType<typeof normalizeStep>[]} */
  const out = [];
  let prev = Object.create(null);
  for (const step of list) {
    const normalized = normalizeStep(step, prev);
    out.push(normalized);
    prev = normalized.totals;
  }
  return out;
}

/**
 * Sanitize status attempt summaries for UI consumption.
 *
 * @param {Array<Record<string, any>> | undefined | null} attempts
 */
function sanitizeStatusAttempts(attempts) {
  if (!Array.isArray(attempts)) return undefined;
  const out = [];
  for (const attempt of attempts) {
    if (!attempt || typeof attempt !== "object") continue;
    const entry = cloneJson(attempt);
    if (entry) out.push(entry);
  }
  return out.length ? out : undefined;
}

/**
 * Sanitize applied status results.
 *
 * @param {Array<Record<string, any>> | undefined | null} applied
 */
function sanitizeAppliedStatuses(applied) {
  if (!Array.isArray(applied)) return undefined;
  const out = [];
  for (const entry of applied) {
    if (!entry || typeof entry !== "object") continue;
    const clone = cloneJson(entry);
    if (clone) out.push(clone);
  }
  return out.length ? out : undefined;
}

/**
 * Build a lightweight representation of temporal hooks, trimming nested
 * contexts to avoid circular references.
 *
 * @param {Record<string, any> | undefined | null} hooks
 */
function sanitizeHooks(hooks) {
  if (!hooks || typeof hooks !== "object") return undefined;
  /** @type {Record<string, any>} */
  const out = Object.create(null);

  if (hooks.hasteApplied) {
    const haste = cloneJson(hooks.hasteApplied);
    if (haste) out.hasteApplied = haste;
  }

  if (hooks.resourceGains) {
    const gains = cloneJson(hooks.resourceGains);
    if (gains) out.resourceGains = gains;
  }

  if (hooks.echo) {
    const echo = hooks.echo;
    /** @type {Record<string, any>} */
    const echoOut = Object.create(null);
    for (const key of ["triggered", "chance", "fraction", "allowOnKill", "totalDamage"]) {
      if (echo[key] !== undefined) {
        echoOut[key] = typeof echo[key] === "number" ? Number(echo[key]) : echo[key];
      }
    }
    if (echo.result) {
      const result = echo.result;
      echoOut.result = {
        totalDamage: Number.isFinite(result?.totalDamage)
          ? Number(result.totalDamage)
          : undefined,
        steps: serializeAttackSteps(result?.steps),
      };
    }
    if (Object.keys(echoOut).length) {
      out.echo = echoOut;
    }
  }

  return Object.keys(out).length ? out : undefined;
}

/**
 * Serialize an {@link AttackContext} into a compact breakdown used by the UI
 * layer and tests.
 *
 * @param {any} ctx
 */
export function breakdownFromContext(ctx) {
  if (!ctx || typeof ctx !== "object") return undefined;
  const steps = serializeAttackSteps(ctx.steps);
  const statusAttempts = sanitizeStatusAttempts(ctx.statusAttempts);
  const appliedStatuses = sanitizeAppliedStatuses(ctx.appliedStatuses);
  const hooks = sanitizeHooks(ctx.hooks);
  const payload = {
    turn: Number.isFinite(ctx.turn) ? Number(ctx.turn) : undefined,
    attackerId: ctx.attacker?.id ?? ctx.attacker?.name ?? undefined,
    defenderId: ctx.defender?.id ?? ctx.defender?.name ?? undefined,
    hpBefore: Number.isFinite(ctx.hpBefore) ? Number(ctx.hpBefore) : undefined,
    hpAfter: Number.isFinite(ctx.hpAfter) ? Number(ctx.hpAfter) : undefined,
    totalDamage: Number.isFinite(ctx.totalDamage) ? Number(ctx.totalDamage) : undefined,
    steps,
  };
  if (statusAttempts || appliedStatuses) {
    payload.statuses = {};
    if (statusAttempts) payload.statuses.attempts = statusAttempts;
    if (appliedStatuses) payload.statuses.applied = appliedStatuses;
  }
  if (hooks) {
    payload.hooks = hooks;
  }
  return payload;
}

/**
 * Attempt to reconstruct the most recent attack step sequence from a ring log
 * entry list.
 *
 * @param {any} logOrEntries
 * @param {{ role?: "attacker" | "defender"; turn?: number; counterpart?: string | null }} [opts]
 */
export function breakdownFromAttackLog(logOrEntries, opts = {}) {
  const entries = Array.isArray(logOrEntries)
    ? logOrEntries
    : typeof logOrEntries?.toArray === "function"
    ? logOrEntries.toArray()
    : [];
  const filtered = entries.filter((entry) => entry && entry.kind === "attack_step");
  if (!filtered.length) return undefined;

  const { role = "attacker", turn, counterpart } = opts;
  /** @type {any} */
  let match = null;
  for (let i = filtered.length - 1; i >= 0; i--) {
    const entry = filtered[i];
    if (turn !== undefined && entry.turn !== turn) continue;
    if (counterpart) {
      if (role === "attacker" && entry.defender !== counterpart) continue;
      if (role === "defender" && entry.attacker !== counterpart) continue;
    }
    match = entry;
    break;
  }
  if (!match) {
    match = filtered[filtered.length - 1];
  }

  const targetTurn = match?.turn;
  const targetDefender = match?.defender;
  const targetAttacker = match?.attacker;
  const chunk = [];
  for (let i = filtered.length - 1; i >= 0; i--) {
    const entry = filtered[i];
    if (targetTurn !== undefined && entry.turn !== targetTurn) continue;
    if (role === "attacker") {
      if (targetDefender !== undefined && entry.defender !== targetDefender) continue;
    } else if (role === "defender") {
      if (targetAttacker !== undefined && entry.attacker !== targetAttacker) continue;
    }
    chunk.push({ stage: entry.stage, totals: entry.totals, meta: entry.meta });
    if (entry.stage === "pre") break;
  }
  chunk.reverse();
  if (!chunk.length) return undefined;
  return {
    turn: targetTurn,
    counterpart: role === "attacker" ? targetDefender : targetAttacker,
    steps: serializeAttackSteps(chunk),
  };
}

