# Milestone Delivery Plan

## Success Criteria
Success for the current milestone means:

- Themed mobs spawn, pursue, and attack correctly.
- Vision is solely actor-driven (`actor.getLightRadius()` governs field-of-view).
- All attacks funnel through the unified resolver with temporal hooks covered by automated tests.

These criteria remain the baseline for validating every workstream described below.

## AI Behaviour Extensions (Wander & Guard)
**Goal:** Close the open AI behaviour items so idle mobs exhibit intentional motion and guarding monsters hold their posts.

1. **Leash Data Model**
   - Extend mob templates (`src/content/mobs.js`) with optional `guard` payloads `{ anchorOffset, radius, resumeBias }`.
   - Update `createMobFromTemplate()` to snapshot the world position when spawning and store `mob.guard = { anchor, radius }`.
2. **Planner Integration**
   - Add guard metadata to the planner context in `Monster.takeTurn(ctx)` so `AIPlanner.selectTarget()` can fall back gracefully when no hostile is visible.
   - Implement a dedicated guard candidate inside `buildUtilityDecision()` that scores distance from the anchor and prefers returning inside the leash.
   - Provide a wander candidate that biases toward unexplored tiles within `radius` when no guard is defined, using `ExplorePolicy.pathCost` for weighting.
3. **Action Layer Support**
   - Add `guard_step` and `wander_step` actions to `src/combat/actions.js`, both respecting `context.tryMove` and the collision guards.
   - Ensure `Monster.takeTurn()` records the guard/wander result in `lastPlannerDecision` for debugging.
4. **Validation**
   - Add AI behaviour regression tests in `tests/ai-wireup.test.js` covering guard return, wander leash bounds, and attack pursuit priority.
   - Update docs (`docs/mob-combat-system.md`) with the concrete guard/wander flow once implemented.

## Combat Debug UI & Instrumentation
**Goal:** Provide the developer-facing inspection tools promised in the milestone scope.

1. **AttackContext Exposure**
   - Extend `AttackContext` (`src/combat/attack-context.js`) with serialisable snapshots of packet stages and status rolls.
   - Push every stage into `actor.logs.attack` ring buffers via a lightweight helper (`src/combat/debug-log.js`).
2. **UI Overlay**
   - Implement a toggleable debug overlay module (`src/ui/combat-debug.js`) that:
     - Lists recent actors engaged in combat.
     - Renders the latest `AttackContext` with stage-by-stage diffs (brands → affinities → polarity → mitigation → triggers).
     - Shows active statuses and temporal hook cooldowns.
   - Wire the overlay into the existing debug panel entry points in `main.js` with a keyboard shortcut and dev-mode guard.
3. **Testing & Tooling**
   - Add snapshot-style UI tests in `tests/ui-combat-feedback.test.js` validating the overlay render for a canned combat log.
   - Provide a `npm run debug:sandbox` script that launches a mock encounter with deterministic RNG for manual inspection.

## Role Template Expansion
**Goal:** Deliver richer role overlays so themed encounters have tactical variety without duplicating base mobs.

1. **Template Schema**
   - Formalise `ROLE_TEMPLATES` in `src/content/roles.js` with fields for stat deltas, ability tags, affinity/polarity adjustments, and default AI overrides.
   - Add validation helpers to `src/factories/validators.js` ensuring overlays don’t conflict with base factions or violate power budgets.
2. **Application Pipeline**
   - Update `createMobFromTemplate()` to accept an array of role IDs. Each overlay should fold into the actor after equipment but before statuses, reusing the mod folding utilities.
   - Allow dungeon themes (`src/content/themes.js`) to specify role distributions per depth, integrating with the spawner to choose overlays alongside base templates.
3. **Content & Tests**
   - Seed at least three exemplar overlays (e.g., `ritualist`, `bruiser`, `skirmisher`) referenced by existing chapter themes.
   - Expand `tests/theme-spawn.test.js` to assert overlays respect tag filters, faction alignment, and guard flags.

## Unified Brand/Affinity/Polarity Pipeline
**Goal:** Guarantee every attack type (melee, ranged, spells) travels through the same resolver path with full modifier coverage.

1. **Resolver Audit**
   - Inventory all call sites for melee (`tryAttackEquipped`), ranged (`fire_bolt` action), and spells (`spellSystem.cast`). Confirm they create an `AttackContext` and call `resolveAttack()`.
   - Remove any legacy damage applications that bypass the resolver, replacing them with context-driven packet assembly.
2. **Packet Construction**
   - Normalise packet creation via helpers in `src/combat/attack.js` so each action declares base packets, optional conversions, and metadata (source item, polarity intent).
   - Ensure brand contributions respect both equipment brands and temporary buffs (`actor.modCache.brands`).
3. **Modifier Coverage**
   - Fold attacker affinities, defender resists, and polarity comparisons using shared utilities from `src/combat/resolve.js`.
   - Verify temporal hooks (`echo`, `onKillHaste`) trigger uniformly regardless of the originating action type.
4. **Regression Suite**
   - Extend `tests/resolve-order.test.js` with melee/ranged/spell scenarios, asserting identical stage order and cumulative damage when modifiers overlap.
   - Add polarity edge cases (attacker vs defender bias) to prevent regressions.

## Tracking & Communication
- Keep this document in sync as implementation lands; link PRs back to the relevant checklist item.
- Surface milestone status in weekly updates by referencing the success criteria at the top of this plan.
