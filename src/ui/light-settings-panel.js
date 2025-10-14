// src/ui/light-settings-panel.js
// @ts-check

import { EVENT, subscribe } from "./event-log.js";
import {
  getLightFalloffSettings,
  resetLightFalloffSettings,
  setLightFalloffSettings,
  subscribeLightFalloffSettings,
} from "../world/light_settings.js";

/**
 * @param {number} value
 */
function formatNumber(value) {
  const fixed = value.toFixed(3);
  return fixed.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

/**
 * Mounts the lighting settings control panel.
 * @param {{ panel?: HTMLElement | null, initialPaused?: boolean }} [options]
 */
export function mountLightSettingsPanel(options = {}) {
  const root =
    options.panel instanceof HTMLElement
      ? options.panel
      : document.getElementById("light-settings-panel");
  if (!(root instanceof HTMLElement)) {
    return null;
  }

  const inputs = {
    deadZoneTiles: /** @type {HTMLInputElement | null} */ (
      root.querySelector('[data-setting="deadZoneTiles"]')
    ),
    smoothstepRangeMultiplier: /** @type {HTMLInputElement | null} */ (
      root.querySelector('[data-setting="smoothstepRangeMultiplier"]')
    ),
    falloffPower: /** @type {HTMLInputElement | null} */ (
      root.querySelector('[data-setting="falloffPower"]')
    ),
  };

  /** @type {Map<string, HTMLElement>} */
  const displayNodes = new Map();
  root.querySelectorAll("[data-display]").forEach((el) => {
    if (el instanceof HTMLElement && typeof el.dataset.display === "string") {
      displayNodes.set(el.dataset.display, el);
    }
  });

  const editableNodes = Array.from(
    root.querySelectorAll("[data-editable='true']"),
  ).filter((el) => el instanceof HTMLInputElement || el instanceof HTMLButtonElement);

  const stateMessage = /** @type {HTMLElement | null} */ (
    root.querySelector("[data-state-message]")
  );

  let isPaused = Boolean(options.initialPaused);

  function render(settings = getLightFalloffSettings()) {
    const { deadZoneTiles, smoothstepRangeMultiplier, falloffPower } = settings;
    const deadInput = inputs.deadZoneTiles;
    if (deadInput) {
      deadInput.value = deadZoneTiles == null ? "" : String(deadZoneTiles);
    }
    const deadDisplay = displayNodes.get("deadZoneTiles");
    if (deadDisplay) {
      deadDisplay.textContent =
        deadZoneTiles == null ? "Auto" : formatNumber(deadZoneTiles);
    }

    const rangeInput = inputs.smoothstepRangeMultiplier;
    if (rangeInput) {
      rangeInput.value = String(smoothstepRangeMultiplier);
    }
    const rangeDisplay = displayNodes.get("smoothstepRangeMultiplier");
    if (rangeDisplay) {
      rangeDisplay.textContent = formatNumber(smoothstepRangeMultiplier);
    }

    const powerInput = inputs.falloffPower;
    if (powerInput) {
      powerInput.value = String(falloffPower);
    }
    const powerDisplay = displayNodes.get("falloffPower");
    if (powerDisplay) {
      powerDisplay.textContent = formatNumber(falloffPower);
    }
  }

  function updatePaused(nextPaused) {
    isPaused = Boolean(nextPaused);
    root.dataset.paused = isPaused ? "true" : "false";
    for (const el of editableNodes) {
      if (el instanceof HTMLInputElement || el instanceof HTMLButtonElement) {
        el.disabled = !isPaused;
      }
    }
    if (stateMessage) {
      stateMessage.textContent = isPaused
        ? "Paused: lighting controls unlocked"
        : "Pause the simulation to edit lighting controls.";
    }
  }

  function handleInput(event) {
    if (!(event.target instanceof HTMLInputElement)) return;
    const key = event.target.dataset.setting;
    if (!key) return;
    const value = event.target.value;
    if (key === "deadZoneTiles") {
      setLightFalloffSettings({ deadZoneTiles: value === "" ? null : value });
    } else if (key === "smoothstepRangeMultiplier") {
      setLightFalloffSettings({ smoothstepRangeMultiplier: value });
    } else if (key === "falloffPower") {
      setLightFalloffSettings({ falloffPower: value });
    }
  }

  function handleReset() {
    resetLightFalloffSettings();
  }

  const unsubscribeStatus = subscribe(EVENT.STATUS, (entry) => {
    const payload = entry?.payload;
    if (payload && Object.prototype.hasOwnProperty.call(payload, "paused")) {
      updatePaused(Boolean(payload.paused));
    }
  });

  const unsubscribeSettings = subscribeLightFalloffSettings(render, {
    immediate: true,
  });

  root.addEventListener("input", handleInput);
  const resetBtn = root.querySelector('[data-action="reset-light-settings"]');
  if (resetBtn instanceof HTMLButtonElement) {
    resetBtn.addEventListener("click", handleReset);
  }

  updatePaused(isPaused);
  render();

  return {
    destroy() {
      root.removeEventListener("input", handleInput);
      if (resetBtn instanceof HTMLButtonElement) {
        resetBtn.removeEventListener("click", handleReset);
      }
      unsubscribeStatus?.();
      unsubscribeSettings?.();
    },
  };
}
