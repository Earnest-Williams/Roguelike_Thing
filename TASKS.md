# TASKS.md

## Priority Zero — “Make things fight”
1) **Ensure the AI planner runs each mob turn and uses factions for hostility.**  
- In the simulation loop, iterate mobs and call `mob.takeTurn(gameCtx)`. `takeTurn` already delegates to `AIPlanner` with `selfActor`. Verify `gameCtx` includes `{ player, mobManager, maze, state, AIPlanner }`.  
- Confirm the planner builds candidates `[player, ...mobs]`, maps to actors, excludes self, filters by `FactionService.isHostile(self, a)`, and then **attacks or moves** toward the first hostile. If no target, it currently does nothing (add wander later).  

2) **Wire the attack + move actions used by the planner.**  
- Make sure `tryAttackEquipped(actor, target, distance)` is reachable from the planner’s `perform()` hook for attack actions; likewise, `context.tryMove(actor, step)` is provided and works. The default fallback tries `actor.tryMove(...)` if `context.tryMove` is absent. 

3) **Replace any legacy global light/vision helpers.**  
- Remove old `getLightRadius()` functions; use `actor.getLightRadius()`. Update `computeVisibleCells` and `updateVisionAndExploration` accordingly. 

4) **Spawn enemies thematically at startup.**  
- In `initializeSimulation()`, call `spawnMonsters(gameCtx, { count: N, includeTags: gameState.chapter?.theme?.monsterTags, rng: gameState.rng })` once and set a guard flag. Ensure `MOB_TEMPLATES` have `tags` and reasonable `spawnWeight`. 

---

## Phase 1 — Content & Folding Foundations
- **Actor data**: Confirm `Actor` owns `factions`, `affiliations`, base stats, and vision; sanitize mixed `"unaligned"`.  
- **Mod folding**: Ensure **equipment** folds first, then **innates** (vision/resists) via `foldInnatesIntoModCache()`. Re-build caches on equip/unequip. 

**Codex instructions (apply now):**
- Create/verify `src/combat/actor.js` fields and constructor guards per spec. Add `getLightRadius()` using base + modCache vision bonus.  
- In `src/combat/mod-folding.js`, implement `foldInnatesIntoModCache()`; make sure `foldModsFromEquipment()` is exported and called first. 

---

## Phase 2 — Allegiance & Vision Services
- **FactionService**: Add `src/game/faction-service.js` and route all hostility checks through it.  
- **Vision plumbing**: Update all places that compute visibility to call `player.getLightRadius()`. Delete legacy helpers. 

**Codex instructions (apply now):**
- Create `FactionService` exactly as specified; export `isAllied` / `isHostile`. Wire AI to use it.  
- Refactor `main.js` vision calls to use the actor method shown in the plan. 

---

## Phase 3 — Spawner + Monster Wrapper
- **Monster wrapper**: Move to `src/game/monster.js`, keep `__actor` plus positional fields, and `takeTurn(ctx)` that defers to AI planner.  
- **Factories**: `createActorFromTemplate()` + `createMobFromTemplate()` performing **equipment → innates** folding before returning instances.  
- **Spawner**: Implement `buildSpawnWeights`, `pickWeighted`, `randomOpenTile`, and `spawnMonsters` with chapter theme tags. Integrate at initialization with a one-shot guard. 

**Codex instructions (apply now):**
- Create/verify `src/game/spawn.js` exactly as per the utilities shown; integrate in `initializeSimulation()`. 

---

## Phase 4 — AI Targeting & Basic Behaviors
- **AI planner**: Ensure candidate assembly (player + mob list), self-exclusion, hostility filtering via `FactionService`, and action selection (attack/move). Add a TODO for wander/guard when no hostile exists.  
- **Movement & collision**: Ensure `context.tryMove` exists and respects maze/mob collisions (the action already checks `context.canMove`). 

---

## Combat Unification — Brands, Affinity, Status, Temporal
- **Add `AttackContext`** for all attacks (melee/ranged/spells). Route everything through `resolveAttack()`.  
- **Implement resolution order** end-to-end with conversions, brands, affinities, polarity, resists, status rolls, temporal echo, on-kill haste, and resource hooks. Provide a simple example spell (e.g., `fireball`).  
- **Global caps** and **power budget**: Enforce caps; attach powerCost to mods; wire a minimal generator for early items. 

**Codex instructions (apply next):**
- Add a minimal `brands/affinity/resists/polarity/status` set plus one of each item (conversion Brand, Affinity ring, Resist cloak) to validate order. Use the caps and example costs.  
- Implement a ring buffer per actor to log `attack_step`, `status_apply`, `status_tick`, `status_expire`. Stub a developer panel to inspect an actor’s latest AttackContext and caches. 

---

## Theming & Content Expansion
- **DungeonTheme typing & usage**: Formalize the `DungeonTheme` shape (monster tags/weights, item tags/affixes, power curve, culmination event) and ensure chapter config supplies `monsterTags` already consumed by the spawner.  
- **Role templates (future)**: Add role overlays (e.g., “Orc Shaman”) as a thin layer on base creature templates. 

---

## Tests to Add/Keep Green
- **Combat temporal hooks**: Keep/extend the test that verifies echo + on-kill haste do not chain recursively.  
- **Faction service**: Tests for `unaligned` behavior and shared affiliations.  
- **Event log async**: Keep async dispatch behavior verified.  
- **Vision**: Unit test that vision radius reflects innate+equipment bonuses via `modCache`. 

---

## Done-Definition for This Milestone
- Mobs spawn by theme and **actively pursue/attack** the player; no “walk-past” behavior remains.  
- Legacy vision helpers removed; **only** `actor.getLightRadius()` determines FOV.  
- All attacks go through `resolveAttack()` with the documented order; minimal brands/affinities/statuses functional; temporal echo + on-kill haste pass tests. 
