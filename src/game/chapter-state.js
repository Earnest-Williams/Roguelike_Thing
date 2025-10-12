// src/game/chapter-state.js
// @ts-check

import { generateDungeonTheme } from "../content/themes.js";

/**
 * Tracks chapter progression and exposes the current loot power budget.
 */
export class ChapterState {
  /**
   * @param {{ rng?: () => number, levelsPerChapter?: number }=} options
   */
  constructor(options = {}) {
    const { rng = Math.random, levelsPerChapter = 3 } = options;
    this._rng = typeof rng === "function" ? rng : Math.random;
    this.levelsPerChapter = Math.max(1, Math.floor(levelsPerChapter));
    this.levelIndex = 0;
    this.theme = generateDungeonTheme(this._rng);
  }

  /** @returns {number} */
  get currentLevel() {
    return this.levelIndex + 1;
  }

  /** @returns {boolean} */
  get isFinalLevel() {
    return this.currentLevel >= this.levelsPerChapter;
  }

  /** @returns {number} */
  get currentBudget() {
    const base = Number(this.theme?.baseBudget ?? 0);
    const perLevel = Number(this.theme?.perLevelBudget ?? 0);
    const value = base + perLevel * this.levelIndex;
    return value > 0 ? value : 0;
  }

  /**
   * Advance to the next dungeon level. When the chapter is completed, a new
   * theme is generated and the level index resets.
   * @returns {ChapterState}
   */
  nextLevel() {
    if (this.levelIndex + 1 < this.levelsPerChapter) {
      this.levelIndex += 1;
    } else {
      this.theme = generateDungeonTheme(this._rng);
      this.levelIndex = 0;
    }
    return this;
  }

  /**
   * Force a brand new theme, resetting progression within the chapter.
   * @returns {ChapterState}
   */
  resetTheme() {
    this.theme = generateDungeonTheme(this._rng);
    this.levelIndex = 0;
    return this;
  }
}
