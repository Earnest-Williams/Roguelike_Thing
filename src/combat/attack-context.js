// src/combat/attack-context.js
// @ts-check

/**
 * Creates a canonical attack context payload used when resolving damage.
 *
 * @param {{
 *   attacker: any,
 *   defender: any,
 *   turn: number,
 *   prePackets?: Record<string, number>,
 *   attempts?: any[],
 * }} opts
 */
export function makeAttackContext({ attacker, defender, turn, prePackets, attempts }) {
  return {
    attacker,
    defender,
    turn,
    steps: [], // push { stage, packets } snapshots
    prePackets: { ...(prePackets || {}) }, // e.g., { physical: base, ... }
    postPackets: {}, // final after defense & scalars
    attempts: attempts || [], // status attempts from action + brands
  };
}

