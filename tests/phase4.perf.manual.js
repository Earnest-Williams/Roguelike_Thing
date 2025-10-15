// tests/phase4.perf.manual.js
import { performance } from "perf_hooks";
import { DAMAGE_TYPE } from "../js/constants.js";
import { resolveAttack } from "../dist/src/combat/resolve.js";
import { Actor } from "../dist/src/combat/actor.js";

const a = new Actor({
  id: "A",
  baseStats: {
    str: 10,
    dex: 10,
    int: 10,
    vit: 10,
    con: 10,
    will: 10,
    luck: 10,
    maxHP: 20,
    maxStamina: 10,
    maxMana: 5,
    baseSpeed: 1,
  },
});
a.modCache.offense.affinities.fire = 0.2;
a.modCache.offense.brandAdds.push({ kind:"brand", type:"fire", flat:2, pct:0.1 });
const b = new Actor({
  id: "B",
  baseStats: {
    str: 8,
    dex: 8,
    int: 8,
    vit: 8,
    con: 8,
    will: 8,
    luck: 8,
    maxHP: 25,
    maxStamina: 10,
    maxMana: 5,
    baseSpeed: 1,
  },
});
b.modCache.defense.resists.fire = 0.3;

const N = 200000;
let sum=0;
const t0 = performance.now();
for (let i=0;i<N;i++) {
  sum +=
    resolveAttack({
      attacker: a,
      defender: b,
      turn: 0,
      packets: [{ type: DAMAGE_TYPE.SLASH, amount: 10 }],
    }).totalDamage;
}
const t1 = performance.now();
console.log(`resolveAttack: ${N} iters in ${(t1-t0).toFixed(1)} ms; sum=${sum}`);
