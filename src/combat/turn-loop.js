// src/combat/turn-loop.js
// @ts-check

import { applyStatuses, rebuildDerived } from "./status.js";
import { tickResources } from "./resources.js";

/**
 * Run a lightweight turn phase for standalone simulations.
 * Applies channeling when idle, rebuilds derived data, then ticks resources.
 *
 * @param {any} actor
 * @param {number} worldTurn
 * @param {boolean} didAct
 * @param {Set<string>|string[]|null} [tagsUsed]
 */
export function runTurn(actor, worldTurn, didAct, tagsUsed) {
  if (!actor) return;
  actor.turn = worldTurn | 0;

  const tagSet =
    tagsUsed instanceof Set
      ? tagsUsed
      : new Set(Array.isArray(tagsUsed) ? tagsUsed : tagsUsed ? [tagsUsed] : []);

  const idle =
    !didAct ||
    tagSet.size === 0 ||
    (!tagSet.has("move") && !tagSet.has("attack") && !tagSet.has("cast"));

  const resMods = actor.modCache?.resource;

  if (idle) {
    applyStatuses(
      { statusAttempts: [{ id: "channeling", stacks: 1, baseChance: 1, baseDuration: 1 }] },
      actor,
      actor,
      actor.turn,
    );
    if (resMods) resMods.channeling = true;
  } else if (resMods) {
    resMods.channeling = false;
  }

  actor.statusDerived = rebuildDerived(actor);
  tickResources(actor);
}
