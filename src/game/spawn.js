// src/game/spawn.js
// @ts-check
import { TILE_FLOOR } from "../../js/constants.js";
import { MOB_TEMPLATES } from "../content/mobs.js";
import { createMobFromTemplate } from "../factories/index.js";

export function buildSpawnWeights({ includeTags = [] } = {}) {
  const tagFilter = Array.isArray(includeTags) && includeTags.length
    ? new Set(includeTags)
    : null;
  const weights = [];
  for (const template of Object.values(MOB_TEMPLATES)) {
    if (!template?.id) continue;
    if (tagFilter && !template.tags?.some((t) => tagFilter.has(t))) continue;
    const weight = Number.isFinite(template.spawnWeight)
      ? Number(template.spawnWeight)
      : 1;
    if (weight <= 0) continue;
    weights.push({ id: template.id, weight });
  }
  return weights;
}

export function pickWeighted(entries, rng = Math.random) {
  if (!entries.length) return null;
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0) || 0;
  if (total <= 0) return entries[0]?.id ?? null;
  let roll = rng() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry.id;
  }
  return entries[entries.length - 1]?.id ?? null;
}

export function randomOpenTile(maze, mobManager, avoid, minManhattan = 6, rng = Math.random) {
  const height = Array.isArray(maze) ? maze.length : 0;
  const width = height > 0 && Array.isArray(maze[0]) ? maze[0].length : 0;
  if (!height || !width) return null;
  for (let i = 0; i < 800; i++) {
    const x = (rng() * width) | 0;
    const y = (rng() * height) | 0;
    if (maze[y]?.[x] !== TILE_FLOOR) continue;
    if (mobManager?.getMobAt?.(x, y)) continue;
    if (avoid) {
      const d = Math.abs(avoid.x - x) + Math.abs(avoid.y - y);
      if (d < minManhattan) continue;
    }
    return { x, y };
  }
  return null;
}

export function spawnMonsters(gameCtx, { count = 6, includeTags = [], rng = Math.random } = {}) {
  const { maze, mobManager, player } = gameCtx || {};
  if (!maze || !mobManager) return 0;
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
    mobManager.add?.(mob);
    spawned++;
  }

  mobManager.reindex?.();
  return spawned;
}

