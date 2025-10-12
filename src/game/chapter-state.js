// src/game/chapter-state.js
// @ts-check
import { generateDungeonTheme } from "../content/themes.js";

const DEFAULT_PER_LEVEL_BUDGET = 5;
const DEFAULT_BASE_BUDGET = 18;
const DEFAULT_DEPTH_SCALING = 0.02;
const DEFAULT_FINAL_BONUS = 6;

export class ChapterState {
  /**
   * @param {{
   *   rng?: () => number,
   *   theme?: ReturnType<typeof generateDungeonTheme>,
   *   depth?: number,
   * }} [options]
   */
  constructor(options = {}) {
    const { rng = Math.random, theme = null, depth = 0 } = options;
    this._rng = typeof rng === "function" ? rng : Math.random;
    this.depth = Number.isFinite(depth) ? Number(depth) : 0;
    this.theme = theme || generateDungeonTheme(this.depth, this._rng);
    this.levelIndex = 0;
    this.totalLevels = Math.max(1, Math.round(this.theme?.totalLevels || 1));
  }

  get currentLevel() {
    return this.levelIndex + 1;
  }

  get isFinalLevel() {
    return this.levelIndex >= this.totalLevels - 1;
  }

  get currentBudget() {
    const curve = this.theme?.powerBudgetCurve || {};
    const base = Number.isFinite(curve.start) ? curve.start : DEFAULT_BASE_BUDGET;
    const perLevel = Number.isFinite(curve.perLevel) ? curve.perLevel : DEFAULT_PER_LEVEL_BUDGET;
    const depthScaling = Number.isFinite(curve.depthScaling)
      ? curve.depthScaling
      : DEFAULT_DEPTH_SCALING;
    const finalBonus = Number.isFinite(curve.finalBonus) ? curve.finalBonus : DEFAULT_FINAL_BONUS;

    const depth = this.levelIndex;
    const scaled = (base + depth * perLevel) * (1 + depth * depthScaling);
    const adjusted = this.isFinalLevel ? scaled + finalBonus : scaled;
    return Math.max(0, Math.round(adjusted));
  }

  nextLevel() {
    if (this.levelIndex < this.totalLevels - 1) {
      this.levelIndex += 1;
      return this.levelIndex;
    }
    this.depth += 1;
    this.theme = generateDungeonTheme(this.depth, this._rng);
    this.levelIndex = 0;
    this.totalLevels = Math.max(1, Math.round(this.theme?.totalLevels || 1));
    return this.levelIndex;
  }

  /**
   * Reset the chapter progression back to floor one and optionally seed a
   * precomputed theme. When `theme` is omitted a fresh theme is generated using
   * the chapter's deterministic RNG hook so restarts still feel varied while
   * remaining reproducible in tests.
   *
   * @param {(ReturnType<typeof generateDungeonTheme> | {
   *   theme?: ReturnType<typeof generateDungeonTheme>,
   *   depth?: number,
   * })} [theme]
   */
  reset(theme) {
    let nextTheme = null;
    let nextDepth = this.depth;
    if (theme && typeof theme === "object" && ("theme" in theme || "depth" in theme)) {
      const options = /** @type {{ theme?: ReturnType<typeof generateDungeonTheme>, depth?: number }} */ (theme);
      if (Number.isFinite(options.depth)) {
        nextDepth = Number(options.depth);
      }
      if (options.theme) {
        nextTheme = options.theme;
      }
    } else if (theme) {
      nextTheme = /** @type {ReturnType<typeof generateDungeonTheme>} */ (theme);
    }

    this.depth = Number.isFinite(nextDepth) ? nextDepth : 0;
    if (nextTheme) {
      this.theme = nextTheme;
    } else {
      this.theme = generateDungeonTheme(this.depth, this._rng);
    }
    this.levelIndex = 0;
    this.totalLevels = Math.max(1, Math.round(this.theme?.totalLevels || 1));
  }
}
