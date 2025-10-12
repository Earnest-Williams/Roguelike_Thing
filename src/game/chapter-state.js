// src/game/chapter-state.js
// @ts-check
import { generateDungeonTheme } from "../content/themes.js";

const DEFAULT_PER_LEVEL_BUDGET = 5;
const DEFAULT_BASE_BUDGET = 15;

export class ChapterState {
  /**
   * @param {{ rng?: () => number, theme?: ReturnType<typeof generateDungeonTheme> }} [options]
   */
  constructor(options = {}) {
    const { rng = Math.random, theme = null } = options;
    this._rng = typeof rng === "function" ? rng : Math.random;
    this.theme = theme || generateDungeonTheme(this._rng);
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
    const budget = this.theme?.budget || {};
    const base = Number.isFinite(budget.base) ? budget.base : DEFAULT_BASE_BUDGET;
    const perLevel = Number.isFinite(budget.perLevel)
      ? budget.perLevel
      : DEFAULT_PER_LEVEL_BUDGET;
    const depthMultiplier = Number.isFinite(budget.depthMultiplier)
      ? budget.depthMultiplier
      : 0;
    const bonusFinal = Number.isFinite(budget.bonusFinal) ? budget.bonusFinal : 0;

    const depth = this.levelIndex;
    const scaled = (base + depth * perLevel) * (1 + depth * depthMultiplier);
    const adjusted = this.isFinalLevel ? scaled + bonusFinal : scaled;
    return Math.max(0, Math.round(adjusted));
  }

  nextLevel() {
    if (this.levelIndex < this.totalLevels - 1) {
      this.levelIndex += 1;
      return this.levelIndex;
    }
    this.theme = generateDungeonTheme(this._rng);
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
   * @param {ReturnType<typeof generateDungeonTheme>} [theme]
   */
  reset(theme) {
    if (theme) {
      this.theme = theme;
    } else {
      this.theme = generateDungeonTheme(this._rng);
    }
    this.levelIndex = 0;
    this.totalLevels = Math.max(1, Math.round(this.theme?.totalLevels || 1));
  }
}
