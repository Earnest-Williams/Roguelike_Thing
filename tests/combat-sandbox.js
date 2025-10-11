import { startTurn, endTurn } from "../src/combat/loop.js";
import { resolveAttack } from "../src/combat/attack.js";
import { applyStatus } from "../src/combat/status.js";
import { attachLogs } from "../src/combat/debug-log.js";

function mkActor(id, hp, mods) {
  return attachLogs({
    id, name: id, hp,
    statuses: [], attunements: {},
    modCache: mods
  });
}

const modsFireSword = {
  offense: {
    brands: [{ id:"fire_edge", type:"fire", flat:5 }],
    affinities: { fire: 0.15 },
    conversions: []
  },
  defense: { resists: { cold: 0.1 }, immunities: {} },
  temporal: { onKillHaste: { duration: 2 } },
  attunement: { fire: { maxStacks: 10, decayPerTurn: 1 } }
};

const modsSlime = {
  offense: { brands: [], affinities: {}, conversions: [] },
  defense: { resists: { fire: 0.35 }, immunities: {} },
  temporal: {}, attunement: {}
};

const A = mkActor("Hero", 60, modsFireSword);
const B = mkActor("Slime", 50, modsSlime);

function step(attacker, defender) {
  startTurn(attacker);
  const r = resolveAttack({ attacker, defender, attack: { type:"fire", base: 8 } });
  const killed = defender.hp <= 0;
  if (killed) applyStatus(attacker, { id:"haste", baseDuration:2, stacks:1 });
  endTurn(attacker);
  return { ...r, killed };
}

for (let i=0; i<10 && A.hp>0 && B.hp>0; i++) {
  const r1 = step(A, B);
  if (B.hp <= 0) break;
  const r2 = step(B, A);
  console.log(`Round ${i+1}: A→B ${r1.totalDamage} (B:${B.hp}) | B→A ${r2.totalDamage} (A:${A.hp})`);
}

console.log("Final:", { A: A.hp, B: B.hp });
