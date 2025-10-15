# Mob Combat and Faction-Based Engagement

## Overview

The roguelike's combat loop is split across small, composable modules so that AI planning, world integration, and UI feedback can evolve independently. Hostility is driven by the faction service, perception keeps the world in sync with each combatant, the planner produces high-level intents, and the action layer turns those intents into concrete movement or attacks.

- Monsters continuously refresh perception before and after every turn so their field-of-view is always current.
- `planTurn()` encapsulates target selection and intent generation in a single place that callers (AI, manual control, tests) can reuse.
- `executeDecision()` consumes planner decisions and performs the actual movement/attack work against the world state.
- `performEquippedAttack()` and `resolveAttack()` handle the detailed combat math and emit UI/debug events.

The pieces are wired together through the `Monster.takeTurn()` method—this is the canonical path for AI-driven combat in the simulation.

## Turn Pipeline

### 1. Perception (`src/combat/perception.js`)

`updatePerception(monster, world)` calls the shared FOV helpers from `src/sim/senses.js` to generate a `{ fov, visibleActors, visibleLights }` payload, then stores it on both the world entity wrapper (`Monster`) and the underlying combat `Actor`. This perception snapshot is what the planner reads when looking for hostiles.

### 2. Planning (`src/combat/ai-planner.js`)

- `selectTarget(self, ctx)` normalizes arbitrary entities to `Actor` instances via `asActor()`, filters out the performer, then uses `FactionService.relation()` to reject allies. Line-of-sight is preferred when a map is available, falling back to Chebyshev distance with a deterministic tie-breaker.
- `planTurn({ actor, combatant, world, perception, rng })` wraps the target result into a decision object:
  - `{ type: "ATTACK", target }` when adjacent.
  - `{ type: "MOVE", target, targetPos }` when a hostile is seen but not adjacent.
  - `{ type: "GUARD", at, radius }` when the actor has a guard leash.
  - `{ type: "WANDER", leash }` as the default idle behaviour.

For utility-debugging workflows there is also `AIPlanner.takeTurn()` and the exported `AIPlanner.utility` helpers, but `planTurn()` is the single entry point used by the runtime (`Monster.takeTurn`).

### 3. Decision Execution (`src/combat/actions.js`)

`executeDecision({ actor, combatant, world, decision, rng })` takes the high-level planner output and turns it into concrete actions:

- `ATTACK` decisions call `tryAttackEquipped()` (equipment-aware attack) and fall back to `tryAttack()` (scalar/basic attack) if no weapon can be used. When neither attack lands, the actor automatically takes a step toward the target.
- `MOVE` decisions resolve a path step toward the requested coordinate and call `applyStep()` to move the monster, marking it as having moved this turn.
- `GUARD` walks the monster back toward its guard anchor if it has strayed past the radius.
- `WANDER` samples a random leashed step so idle monsters still patrol within their leash.

All branches resolve a base delay through `resolveDelayBase()`, respecting combat speed modifiers from the actor's statuses.

### 4. Combat Resolution (`src/combat/actions.js` & `src/game/combat-glue.js`)

- `planEquippedAttack()` folds equipment, AP cost, cooldowns, and resource requirements together so the attack layer can quickly reject invalid actions.
- `tryAttackEquipped()` spends the resolved AP, delegates to `performEquippedAttack()`, flags the actor as having attacked, and starts the appropriate cooldown timer.
- `performEquippedAttack()` constructs a damage packet list, runs `resolveAttack()` for mitigation/status application, updates defender HP, and emits an `EVENT.COMBAT` payload for the UI and debug log buffer.
- `tryAttack()` mirrors this flow with deterministic scalar values and is primarily used for tests or when no equipment profile exists.

#### Attack Resolution Order & Instrumentation

`resolveAttack()` now builds a rich `AttackContext` that records each stage of the damage pipeline. The stages execute in a strict order so designers can reason about stacking interactions:

1. **Conversions** – base packets are translated into new types before any additive bonuses.
2. **Brands** – flat/pct additives and status attempts tied to brands are applied.
3. **Affinities** – elemental/weapon affinities and attacker status bonuses scale packets.
4. **Polarity** – order/chaos polarity comparisons apply their scalar to the offense packets.
5. **Resists** – defender resists, immunities, and damage scalars reduce the packets.
6. **Statuses** – on-hit status attempts resolve, logging applied stacks/durations.
7. **Triggers** – temporal/resource hooks such as on-kill haste or echoes fire last.

Each stage snapshot is pushed into per-actor ring buffers (`actor.logs.attack/status`), mirrored in the developer inspection panel (`showAttackDebug`), and stored on the context for save/load inspection. This makes it easy to trace combat math while iterating on new content.

### 5. World Wrapper (`src/game/monster.js`)

`Monster.takeTurn(ctx)` orchestrates the entire process:

1. Refresh perception (`updatePerception`).
2. Produce a planner decision (`planTurn`).
3. Execute the decision (`executeDecision`).
4. Refresh perception again so subsequent actors see the latest state.
5. Return the resolved delay so the scheduler knows when the monster can act next.

`Monster` is also responsible for exposing combat stats (HP, equipment, statuses) on the world entity and for storing planner diagnostics such as `lastPlannerDecision`.

## Faction System (`src/game/faction-service.js`)

- `relation(a, b)` is the canonical helper—`< 0` means hostile, `> 0` means friendly, `0` is neutral.
- `isHostile()` and `isAllied()` are convenience wrappers that call into `relation()`.
- The service accepts either raw `Actor` instances or `Monster` wrappers; it will unwrap automatically.

Because `selectTarget()` and `planTurn()` always pass through the service, there is a single source of truth for hostility checks and allied mobs never appear in candidate lists.

## Testing

Integration coverage lives in `tests/mob-combat-integration.test.js` and exercises the full wiring:

1. Mobs detect and pursue hostile mobs from different factions.
2. Allied mobs are ignored (no friendly fire).
3. Mobs acquire and pursue the player.
4. Melee attacks trigger when adjacent to the player.
5. Hostile mobs fight each other when adjacent.
6. Closer hostiles are prioritised over distant ones.
7. Complex faction graphs (multiple affiliations/overrides) resolve correctly.

There are also focused unit tests covering attack resolution, cooldown handling, status application, and the UI feedback loop (`tests/ui-combat-feedback.test.js`), ensuring each layer of the combat system stays in sync.

## Dungeon Themes & Role Overlays

The dungeon theme generator combines descriptors and mechanics to shape encounter pacing. Role overlays (see `ROLE_OVERLAYS` in `src/content/themes.js`) provide a lightweight way to layer archetypal behaviours on top of base monsters—frontline vanguards for ember catacombs, ritual support casters for arcane spires, or skirmisher packs for goblin redoubts. Each overlay carries stat tweaks, resist/affinity nudges, and a recommended status loadout so encounter builders can slot them into themed palettes without rewriting core templates.
