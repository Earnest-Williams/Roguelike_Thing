// src/combat/temporal.js
// @ts-check

import { resolveAttack } from "./attack.js";
import { applyStatuses } from "./status.js";

/**
 * Attempts to trigger a temporal echo for the provided attack context.
 * Performs another resolveAttack using the same context but with a damage
 * scalar applied so the follow-up hit inherits all downstream hooks.
 *
 * @param {import("./attack.js").AttackContext & { echoing?: boolean, damageScalar?: number }} ctx
 * @param {ReturnType<typeof resolveAttack>} result
 */
export function tryTemporalEcho(ctx, _result) {
  if (!ctx || !ctx.attacker || ctx.echoing) {
    return null;
  }

  const temporal = ctx.attacker.modCache?.temporal;
  const echo = temporal?.echo;
  if (!echo) return null;

  const chance = pickNumber(echo.chance, echo.probability, echo.prob, echo.rate);
  if (!Number.isFinite(chance) || chance <= 0) return null;
  if (Math.random() >= chance) return null;

  const scalar = pickNumber(
    echo.fraction,
    echo.mult,
    echo.multiplier,
    echo.scale,
    echo.damageScalar,
    echo.damageMult,
    echo.damageMultiplier,
  );
  const damageScalar = Number.isFinite(scalar) ? Math.max(0, scalar) : 1;

  const echoCtx = {
    ...ctx,
    echoing: true,
    damageScalar,
    statusAttempts: Array.isArray(ctx.statusAttempts)
      ? ctx.statusAttempts.map((attempt) => ({ ...attempt }))
      : undefined,
  };

  const echoResult = resolveAttack(echoCtx);
  if (echoResult) {
    echoResult.isTemporalEcho = true;
    echoResult.damageScalar = damageScalar;
  }
  return echoResult;
}

/**
 * Applies an on-kill haste status to the killer if the temporal payload
 * requests it. Defaults to applying the standard "haste" status with a
 * duration of at least one turn.
 *
 * @param {import("./actor.js").Actor} killer
 */
export function applyOnKillHaste(killer) {
  if (!killer) return;
  const haste = killer.modCache?.temporal?.onKillHaste;
  if (!haste) return;

  const statusId = String(haste.statusId || haste.status || haste.id || "haste");
  const stacksRaw = pickNumber(haste.stacks, haste.stack, haste.amount, haste.value);
  const stacks = Number.isFinite(stacksRaw) ? Math.max(1, Math.floor(stacksRaw)) : 1;
  const durationRaw = pickNumber(
    haste.duration,
    haste.turns,
    haste.baseDuration,
    haste.time,
    haste.length,
  );
  const duration = Number.isFinite(durationRaw) ? Math.max(1, Math.floor(durationRaw)) : 1;

  applyStatuses(
    {
      statusAttempts: [
        { id: statusId, stacks, baseChance: 1, baseDuration: duration },
      ],
    },
    killer,
    killer,
    killer?.turn ?? 0,
  );
}

function pickNumber(...candidates) {
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const value = Number(candidate);
    if (Number.isFinite(value)) return value;
  }
  return null;
}
