// src/content/power-budget.js
// @ts-check

export function computeItemPower(it) {
  if (!it || typeof it !== "object") return 0;
  let power = 0;
  const add = (value) => {
    if (!Number.isFinite(value)) return;
    power += Number(value);
  };

  const stats = it.baseState?.stats || it.baseStats || {};
  if (Number.isFinite(stats?.str)) add(6 * stats.str);
  if (Number.isFinite(stats?.dex)) add(6 * stats.dex);
  if (Number.isFinite(stats?.int)) add(6 * stats.int);
  if (Number.isFinite(stats?.vit)) add(6 * stats.vit);
  if (Number.isFinite(stats?.con)) add(6 * stats.con);
  if (Number.isFinite(stats?.will)) add(6 * stats.will);
  if (Number.isFinite(stats?.luck)) add(6 * stats.luck);

  if (it.offense?.affinities) {
    for (const value of Object.values(it.offense.affinities)) {
      add(Math.round(Number(value) * 100));
    }
  }
  if (it.defense?.resists) {
    for (const value of Object.values(it.defense.resists)) {
      add(Math.round(Number(value) * 80));
    }
  }
  if (Array.isArray(it.offense?.brands)) {
    for (const brand of it.offense.brands) {
      if (!brand) continue;
      add((Number(brand.flat) || 0) * 2);
      add(Math.round((Number(brand.pct) || Number(brand.percent) || 0) * 80));
    }
  }
  if (it.temporal?.actionSpeedPct) {
    add(Math.round(Math.abs(Number(it.temporal.actionSpeedPct)) * 150));
  }
  if (it.temporal?.cooldownMult && Number(it.temporal.cooldownMult) < 1) {
    add(Math.round((1 - Number(it.temporal.cooldownMult)) * 140));
  }
  if (it.temporal?.echo) add(10);
  if (it.resource?.manaCostMult && Number(it.resource.manaCostMult) < 1) {
    add(Math.round((1 - Number(it.resource.manaCostMult)) * 120));
  }

  return power;
}
