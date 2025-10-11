import { startTurn, endTurn } from "../src/combat/loop.js";
import { resolveAttack } from "../src/combat/attack.js";
import { applyStatus } from "../src/combat/status.js";
import { attachLogs } from "../src/combat/debug-log.js";

function mkActor(id, hp, mods) {
  const attuneRules = mods?.attunementRules || Object.create(null);
  return attachLogs({
    id,
    name: id,
    hp,
    res: { hp },
    statuses: [],
    attunement: { rules: { ...attuneRules }, stacks: Object.create(null) },
    modCache: { ...mods, attunementRules: { ...attuneRules } },
    turn: 0,
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
  attunementRules: { fire: { maxStacks: 10, decayPerTurn: 1, onUseGain: 1, perStack: { damagePct: 0.02 } } }
};

const modsSlime = {
  offense: { brands: [], affinities: {}, conversions: [] },
  defense: { resists: { fire: 0.35 }, immunities: {} },
  temporal: {}, attunementRules: {}
};

const A = mkActor("Hero", 60, modsFireSword);
const B = mkActor("Slime", 50, modsSlime);

function coalesceDamage(summary) {
  if (!summary) return 0;
  return (
    summary.totalDamage ??
    summary.roundDamage ??
    summary.damage ??
    summary.dmg ??
    0
  );
}

function coalesceKilled(summary) {
  if (!summary) return false;
  return Boolean(
    summary.killed ??
    summary.defenderKilled ??
    summary.defenderDead ??
    summary.targetKilled ??
    summary.outcome?.killed ??
    summary.outcome?.defenderKilled ??
    summary.outcome?.defenderDead
  );
}

function step(attacker, defender) {
  attacker.turn = (attacker.turn ?? 0) + 1;
  startTurn(attacker);
  const r = resolveAttack({ attacker, defender, attack: { type:"fire", base: 8 } });
  const killed = r.killed ?? (defender.hp <= 0);
  if (killed) applyStatus(attacker, { id:"haste", baseDuration:2, stacks:1 });
  endTurn(attacker);
  return { ...r, killed };
}

for (let i=0; i<10 && A.hp>0 && B.hp>0; i++) {
  const r1 = step(A, B);
  if (B.hp <= 0) break;
  const r2 = step(B, A);
  const dmgAB = r1.dmg ?? r1.totalDamage ?? 0;
  const dmgBA = r2.dmg ?? r2.totalDamage ?? 0;
  console.log(`Round ${i+1}: A→B ${dmgAB} (B:${B.hp}) | B→A ${dmgBA} (A:${A.hp})`);
}

console.log("Final:", { A: A.hp, B: B.hp });
