// src/game/monster.js
// @ts-check

/**
 * @file Monster
 * World-entity wrapper around a combat `Actor`. This is the **only** Monster
 * definition in the codebase; import from `src/game/monster.js` everywhere.
 *
 * Responsibilities:
 *  - Maintain world position/ids for rendering & scheduling
 *  - Proxy combat state to the underlying Actor
 *  - Expose `getLightRadius()` so vision code can read the actor's folded mods
 *  - Delegate turns to the AI planner via `takeTurn(ctx)`
 */

/**
 * World entity wrapper around a combat actor.
 */
export class Monster {
  constructor({ actor, glyph = "?", color = "#fff", baseDelay = 1 }) {
    if (!actor) throw new Error("Monster requires an actor instance");
    this.__actor = actor;
    this.glyph = glyph;
    this.color = color;
    this.baseDelay = baseDelay;
    this.nextActAt = 0;
    this.x = 0;
    this.y = 0;
    this.kind = "monster";
    this.id = `${actor.id}#${Math.random().toString(36).slice(2, 7)}`;
    this.name = actor.name ?? actor.id ?? "monster";
    this.__template = actor.__template || null;
  }

  get actor() {
    return this.__actor;
  }

  get factions() {
    return this.__actor?.factions || [];
  }

  get affiliations() {
    return this.__actor?.affiliations || [];
  }

  get res() {
    return this.__actor?.res;
  }

  set res(value) {
    if (this.__actor) {
      this.__actor.res = value;
    }
  }

  get resources() {
    return this.__actor?.resources;
  }

  set resources(value) {
    if (this.__actor) {
      this.__actor.resources = value;
    }
  }

  get modCache() {
    return this.__actor?.modCache;
  }

  set modCache(value) {
    if (this.__actor) {
      this.__actor.modCache = value;
    }
  }

  get statusDerived() {
    return this.__actor?.statusDerived;
  }

  set statusDerived(value) {
    if (this.__actor) {
      this.__actor.statusDerived = value;
    }
  }

  get statuses() {
    return this.__actor?.statuses;
  }

  set statuses(value) {
    if (!this.__actor) return;
    if (Array.isArray(value)) {
      this.__actor.statuses = value;
      return;
    }
    this.__actor.statuses = [];
  }

  get actions() {
    return this.__actor?.actions;
  }

  get equipment() {
    return this.__actor?.equipment;
  }

  get hp() {
    return this.__actor?.res?.hp ?? 0;
  }

  set hp(value) {
    if (this.__actor?.res) {
      this.__actor.res.hp = value;
    }
  }

  get maxHp() {
    return this.__actor?.base?.maxHP ?? this.__actor?.baseStats?.maxHP ?? 0;
  }

  set maxHp(value) {
    if (this.__actor?.base) {
      this.__actor.base.maxHP = value;
    }
    if (this.__actor?.baseStats) {
      this.__actor.baseStats.maxHP = value;
    }
  }

  get pos() {
    return { x: this.x, y: this.y };
  }

  set pos(p) {
    if (!p) return;
    this.x = p.x | 0;
    this.y = p.y | 0;
  }

  /** Visible-light radius is defined by the Actor. */
  getLightRadius() {
    return typeof this.__actor?.getLightRadius === "function"
      ? this.__actor.getLightRadius()
      : 0;
  }

  onTurnStart(turn) {
    if (typeof this.__actor?.onTurnStart === "function") {
      this.__actor.onTurnStart(turn);
    }
  }

  takeTurn(ctx) {
    if (!ctx?.AIPlanner?.takeTurn) return;
    return ctx.AIPlanner.takeTurn(this.__actor, { ...ctx, selfMob: this });
  }
}

