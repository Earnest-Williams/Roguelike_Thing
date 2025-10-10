// tests/phase4.perf.manual.js
import { performance } from "perf_hooks";
import { resolveAttackLegacy } from "../src/combat/attack.js";
import { Actor } from "../src/combat/actor.js";

const a = new Actor({ id:"A", baseStats:{str:10,dex:10,int:10,vit:10,maxHP:20,maxStamina:10,maxMana:5,baseSpeed:1} });
a.setFoldedMods({ resists:{}, affinities:{fire:0.2}, immunities:new Set(), dmgMult:1.1, speedMult:1, brands:[{kind:"brand",type:"fire",flat:2,pct:0.1}] });
const b = new Actor({ id:"B", baseStats:{str:8,dex:8,int:8,vit:8,maxHP:25,maxStamina:10,maxMana:5,baseSpeed:1} });
b.setFoldedMods({ resists:{fire:0.3}, affinities:{}, immunities:new Set(), dmgMult:1, speedMult:1, brands:[] });

const N = 200000;
let sum=0;
const t0 = performance.now();
for (let i=0;i<N;i++) {
  sum +=
    resolveAttackLegacy(a, b, {
      profile: { label: "bench", base: 10, type: "fire" },
    }).total;
}
const t1 = performance.now();
console.log(`resolveAttack: ${N} iters in ${(t1-t0).toFixed(1)} ms; sum=${sum}`);
