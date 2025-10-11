// src/combat/attunement.js
// @ts-check
import { ATTUNE } from "../config.js";

/**
 * Apply attunement gains based on final damage packets.
 * @param {any} attacker
 * @param {Record<string, number>|null|undefined} packetsAfterDefense
 */
export function gainAttunementsFromPackets(attacker, packetsAfterDefense) {
  if (!attacker || !packetsAfterDefense) return;
  const pool =
    attacker.attune?.pool || (attacker.attune = { pool: {}, lastTurnUpdated: -1 }).pool;
  for (const [type, dealt] of Object.entries(packetsAfterDefense)) {
    if (!Number.isFinite(dealt) || dealt <= 0) continue;
    const gain = Math.max(ATTUNE.minPerHitGain, dealt * ATTUNE.gainPerPointDamage);
    pool[type] = Math.min(ATTUNE.cap, (pool[type] || 0) + gain);
  }
}
