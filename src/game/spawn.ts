// @ts-nocheck
import { MOB_TEMPLATES } from "../content/mobs.js";
import { createItem, createMobFromTemplate } from "../factories/index.js";
import { CONFIG } from "../config.js";
import { TILE_FLOOR } from "../../js/constants.js";
import { applyLoadout } from "./monster.js";

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

  const overlays = collectThemeOverlays(gameCtx?.state?.chapter?.theme);

  let spawned = 0;
  const configuredDistance =
    gameCtx?.state?.config?.knobs?.spawnMinDistance ??
    CONFIG?.knobs?.spawnMinDistance ??
    6;
  const safeDistance = Number.isFinite(configuredDistance)
    ? Math.max(0, Math.floor(configuredDistance))
    : 6;
  for (let i = 0; i < count; i++) {
    const id = pickWeighted(weights, rng);
    if (!id) break;

    const template = MOB_TEMPLATES[id];
    if (!template) continue;
    const roleSelection = pickOverlayRoles(template, overlays);
    const mob = roleSelection.roleIds.length
      ? createMobFromTemplate(id, roleSelection)
      : createMobFromTemplate(id);
    const pos = randomOpenTile(maze, mobManager, player, safeDistance, rng);
    if (!pos) continue;

    mob.x = pos.x;
    mob.y = pos.y;
    mob.spawnPos = { x: pos.x, y: pos.y };
    mob.homePos = { x: pos.x, y: pos.y };
    applyLoadout(mob, id, rng, createItem);
    mobManager.add(mob);
    spawned++;
  }
  mobManager.reindex?.();
  return spawned;
}

/**
 * Spawns an exact set of mobs by template id → count mapping.
 * @param {{ maze: number[][], mobManager: any, player?: any }} gameCtx
 * @param {Record<string, number>} idCounts
 * @param {number} [minManhattan] Manhattan distance from player (fallback to CONFIG.knobs.spawnMinDistance)
 * @param {() => number} [rng]
 * @returns {number} total spawned
 */
export function spawnByIdCounts(
  gameCtx,
  idCounts = {},
  minManhattan,
  rng = Math.random,
) {
  const { maze, mobManager, player } = gameCtx;
  let spawned = 0;
  const overlays = collectThemeOverlays(gameCtx?.state?.chapter?.theme);
  const fallbackDistance =
    gameCtx?.state?.config?.knobs?.spawnMinDistance ??
    CONFIG?.knobs?.spawnMinDistance ??
    6;
  const safeDistance = Number.isFinite(minManhattan)
    ? Math.max(0, Math.floor(minManhattan))
    : Number.isFinite(fallbackDistance)
    ? Math.max(0, Math.floor(fallbackDistance))
    : 6;
  for (const [id, raw] of Object.entries(idCounts)) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) continue;
    const count = Math.max(0, Math.floor(parsed));
    for (let i = 0; i < count; i++) {
      const template = MOB_TEMPLATES[id];
      if (!template) continue;
      const roleSelection = pickOverlayRoles(template, overlays);
      const mob = roleSelection.roleIds.length
        ? createMobFromTemplate(id, roleSelection)
        : createMobFromTemplate(id);
      const pos = randomOpenTile(maze, mobManager, player, safeDistance, rng);
      if (!pos) continue;
      mob.x = pos.x;
      mob.y = pos.y;
      mob.spawnPos = { x: pos.x, y: pos.y };
      mob.homePos = { x: pos.x, y: pos.y };
      applyLoadout(mob, id, rng, createItem);
      mobManager.add(mob);
      spawned++;
    }
  }
  mobManager.reindex?.();
  return spawned;
}

function collectThemeOverlays(theme) {
  if (!theme || typeof theme !== "object") return [];
  const overlays = [];
  if (theme.roleOverlay) overlays.push(theme.roleOverlay);
  if (Array.isArray(theme.roleOverlayCandidates)) {
    for (const entry of theme.roleOverlayCandidates) {
      if (entry) overlays.push(entry);
    }
  }
  return overlays;
}

function pickOverlayRoles(template, overlays = []) {
  if (!template) return { roleIds: [], overlayId: null };
  for (const overlay of overlays) {
    if (!overlayMatchesTemplate(overlay, template)) continue;
    const ids = Array.isArray(overlay?.roleIds)
      ? overlay.roleIds.filter((id) => typeof id === "string")
      : [];
    if (!ids.length) continue;
    return {
      roleIds: ids.slice(),
      overlayId: typeof overlay.id === "string" ? overlay.id : null,
    };
  }
  return { roleIds: [], overlayId: null };
}

function overlayMatchesTemplate(overlay, template) {
  if (!overlay || !template) return false;
  const templateTags = Array.isArray(template.tags) ? template.tags : [];
  const includeTags = Array.isArray(overlay.includeTags) ? overlay.includeTags : null;
  if (includeTags && includeTags.length) {
    let match = false;
    for (const tag of includeTags) {
      if (templateTags.includes(tag)) {
        match = true;
        break;
      }
    }
    if (!match) return false;
  }
  const excludeTags = Array.isArray(overlay.excludeTags) ? overlay.excludeTags : null;
  if (excludeTags && excludeTags.length) {
    for (const tag of excludeTags) {
      if (templateTags.includes(tag)) return false;
    }
  }
  return true;
}
