# README.md

## Project Overview
This is a roguelike prototype with **faction-aware thematic spawning**, a **unified combat pipeline**, and a clean separation between an Actor’s “brain” (combat stats, factions, statuses) and a Monster’s “body” (position, turn scheduling). The design also lays out a **balanced item/brand system** with a power-budget, deterministic **attack resolution order**, and a developer-facing **combat debug panel**.

### Core Concepts
- **Tags vs Factions vs Affiliations.** Tags classify content (“undead”, “tier1”), while **factions** drive hostility logic (“player”, “npc_hostile”, “unaligned”). **Affiliations** are optional social groupings (e.g., `orc:bloodaxe_clan`) used for future diplomacy/quest systems; the allegiance check first compares factions, then (optionally) affiliations.
- **Actor vs Monster.** `Actor` holds combat state, factions, statuses, derived modifiers, and light radius logic. `Monster` wraps an `Actor` and handles position/turn timing; on its turn it delegates to the AI planner.
- **FactionService.** Single source-of-truth for alliance/hostility, including the special “unaligned” rule (never allies anyone).
- **Vision & Light.** Vision bonuses fold into the mod cache; game code calls `actor.getLightRadius()` instead of a global helper.
- **Thematic Spawning.** Chapter themes supply `monsterTags`; the spawner filters templates by tags, picks by weighted probability, and places mobs on open tiles at safe distances from the player.
- **AI Planner.** Planner builds a candidate set (player + mobs), filters by hostility via `FactionService`, chooses a target, then either attacks or moves toward the target. Future behavior (wander/guard) is a planned extension.
- **Combat Pipeline.** Deterministic `resolveAttack()` order: conversions → brands → pre-packets → attacker affinities → polarity offense → status-derived out/in multipliers → immunities/resists/polarity defense → armor/DR → sum & apply → statuses → resource/temporal triggers → attunements. Backed by a power-budgeted item system and planned debug inspection UI.

## Current Implementation Status
- **Data model upgraded.** `Actor` now includes `factions`, `affiliations`, base stats, and vision; invalid mixed use of "unaligned" is sanitized.
- **Faction service added.** `isAllied()` and `isHostile()` centralize allegiance logic.
- **Mod folding updated.** Innate vision/resists fold into `actor.modCache`; equipment folding remains the first stage.
- **Vision plumbed.** All visibility logic uses `actor.getLightRadius()`; remove any legacy `getLightRadius()` helpers.
- **Spawner utilities.** `buildSpawnWeights()`, `pickWeighted()`, `randomOpenTile()`, and `spawnMonsters()` integrated at initialization via chapter theme tags.
- **Monster wrapper + factory path.** `Monster` lives in `src/game/monster.js`; `createActorFromTemplate()` + `createMobFromTemplate()` in factories run the full folding pipeline before world spawn.
- **AI integration point.** `Monster.takeTurn(ctx)` delegates to `AIPlanner.takeTurn(selfActor, ctx)`; planner filters hostiles and decides attack/move.
- **Tests & examples present.** Unit tests cover temporal echo + on-kill haste, async event logging, and faction service.

## File Map (selected)
- `src/combat/actor.js` — Actor core, factions/affiliations, vision, statuses.
- `src/game/faction-service.js` — Allegiance/hostility rules.
- `src/combat/mod-folding.js` — Equipment + innate folding; vision/resists buckets.
- `src/game/monster.js` — Monster wrapper, `takeTurn()`.
- `src/factories/index.js` — Template → Actor/Monster build, folding order.
- `src/game/spawn.js` — Thematic spawn utilities + integration.
- `src/combat/ai-planner.js` — Targeting via `FactionService`; attack/move actions.
- `src/content/mobs.js` — Mob templates with tags/weights (used by spawner).
- `tests/*` — Temporal echo & haste, event-log async, faction service tests.

## Items, Brands, Status & Power Budget (Design)
The item/brand/status layer defines atomic modifiers with **per-mod power costs**, plus global caps to prevent runaway stacking. It introduces `AttackContext` and a strict, testable resolution order for combat. Planned dev tools: per-actor event ring buffers and a debug panel exposing stepwise packet transforms and status rolls.

## Dungeon Themes & Content (Design)
`DungeonTheme` drives spawns via `monsterTags`, template weights, item tag/affix weights, and a power-budget curve; it can also define level-based culmination events. This mirrors the thematic spawning flow already implemented in the spawner.

## Known Gaps / Open Work
- **Wandering/guarding** when no hostile target is present.
- **Full combat UI + debug panel** (event buffers + AttackContext viewer).
- **Role templates** (e.g., “Orc Shaman” overlays) for fast content scaling.
- **Complete integration of brand/affinity/resist/polarity** into `resolveAttack()` across all action types (melee/ranged/spell).
