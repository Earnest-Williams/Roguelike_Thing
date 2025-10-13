import { MOB_TEMPLATES } from "../content/mobs.js";
import { createMobFromTemplate } from "../factories/index.js";
import { TILE_FLOOR } from "../../js/constants.js";

export function buildSpawnWeights({ includeTags = [] } = {}) {
  const allow = new Set(includeTags);
  const out = [];
  for (const t of Object.values(MOB_TEMPLATES)) {
    if (!t?.id) continue;
    if (allow.size && !t.tags?.some((tag) => allow.has(tag))) continue;
    const weight = Number.isFinite(t.spawnWeight) ? t.spawnWeight : 1;
    if (weight > 0) out.push({ id: t.id, weight });
  }
  return out;
}

export function pickWeighted(entries, rng = Math.random) {
  const total = entries.reduce((s, e) => s + e.weight, 0) || 1;
  let roll = rng() * total;
  for (const e of entries) {
    roll -= e.weight;
    if (roll <= 0) return e.id;
  }
  return entries[0]?.id ?? null;
}

export function randomOpenTile(
  maze,
  mobManager,
  avoid,
  minManhattan = 6,
  rng = Math.random,
) {
  const h = maze.length;
  const w = maze[0]?.length || 0;
  for (let i = 0; i < 800; i++) {
    const x = (rng() * w) | 0;
    const y = (rng() * h) | 0;
    if (maze[y]?.[x] !== TILE_FLOOR) continue;
    if (mobManager.getMobAt?.(x, y)) continue;
    if (avoid) {
      const d = Math.abs(avoid.x - x) + Math.abs(avoid.y - y);
      if (d < minManhattan) continue;
    }
    return { x, y };
  }
  return null;
}

/**
 * Canonical spawner. Returns the number of Monster instances created and placed.
 * All initial and dynamic spawns must use this function.
 */
export function spawnMonsters(
  gameCtx,
  { count = 6, includeTags = [], rng = Math.random } = {},
) {
  const { maze, mobManager, player } = gameCtx;
  const weights = buildSpawnWeights({ includeTags });
  if (!weights.length) return 0;

  let spawned = 0;
  for (let i = 0; i < count; i++) {
    const id = pickWeighted(weights, rng);
    if (!id) break;

    const mob = createMobFromTemplate(id);
    const pos = randomOpenTile(maze, mobManager, player, 6, rng);
    if (!pos) continue;

    mob.x = pos.x;
    mob.y = pos.y;
    mobManager.add(mob);
    spawned++;
  }
  mobManager.reindex?.();
  return spawned;
}
