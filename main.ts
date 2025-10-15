import type { DebugPanelApi } from "./js/debug/debug-panel.js";
import type { CombatDebugOverlay } from "./src/ui/combat-debug.js";

type DebugPanelLoader = Promise<DebugPanelApi | null>;
type CombatDebugLoader = Promise<CombatDebugOverlay | null>;

let debugPanelLoader: DebugPanelLoader | null = null;
let debugPanelToggleCount = 0;
let combatDebugLoader: CombatDebugLoader | null = null;

function loadDebugPanelModule(): DebugPanelLoader {
  if (!debugPanelLoader) {
    debugPanelLoader = import("./js/debug/debug-panel.js")
      .then((mod: typeof import("./js/debug/debug-panel.js")) => {
        if (!mod || typeof mod.ensureDebugPanel !== "function") {
          return null;
        }
        const api = mod.ensureDebugPanel();
        if (api && typeof globalThis !== "undefined") {
          try {
            const g = globalThis as unknown as { __debugPanel?: DebugPanelApi };
            g.__debugPanel = api;
          } catch {
            // ignore assignment failures
          }
        }
        return api || null;
      })
      .catch((err: unknown) => {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[debug] Failed to load debug panel", err);
        }
        debugPanelLoader = null;
        return null;
      });
  }
  return debugPanelLoader;
}

function loadCombatDebugOverlayModule(): CombatDebugLoader {
  if (!combatDebugLoader) {
    combatDebugLoader = import("./src/ui/combat-debug.js")
      .then((mod: typeof import("./src/ui/combat-debug.js")) => {
        if (!mod || typeof mod.ensureCombatDebugOverlay !== "function") {
          return null;
        }
        return mod.ensureCombatDebugOverlay();
      })
      .catch((err: unknown) => {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[debug] Failed to load combat debug overlay", err);
        }
        combatDebugLoader = null;
        return null;
      });
  }
  return combatDebugLoader;
}

function queueDebugPanelToggle(): void {
  debugPanelToggleCount += 1;
  loadDebugPanelModule().then((api: DebugPanelApi | null) => {
    if (!api || typeof api.toggle !== "function") {
      debugPanelToggleCount = 0;
      return;
    }
    const toggles = debugPanelToggleCount;
    debugPanelToggleCount = 0;
    if (toggles % 2 === 1) {
      try {
        api.toggle();
      } catch (err) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[debug] Failed to toggle debug panel", err);
        }
      }
    }
  });
}

function shouldBootstrapDebugPanel(): boolean {
  if (typeof window === "undefined") return false;
  const w = window;
  const flags = (w as unknown as { DEBUG_FLAGS?: Record<string, unknown> }).DEBUG_FLAGS;
  if (flags && (flags.debugPanel || flags.devPanel || flags.attackDebug)) {
    return true;
  }
  const search = typeof w.location?.search === "string" ? w.location.search : "";
  if (search && typeof URLSearchParams === "function") {
    try {
      const params = new URLSearchParams(search);
      const value = params.get("debugPanel");
      if (value === "" || value === "1" || value === "true") {
        return true;
      }
    } catch {
      // ignore URL parsing issues
    }
  }
  try {
    const stored = w.localStorage?.getItem?.("debug-panel");
    if (stored === "1" || stored === "true") {
      return true;
    }
  } catch {
    // ignore storage access issues
  }
  return false;
}

function shouldBootstrapCombatDebugOverlay(): boolean {
  if (typeof window === "undefined") return false;
  const w = window;
  const flags = (w as unknown as { DEBUG_FLAGS?: Record<string, unknown> }).DEBUG_FLAGS;
  if (flags && (flags.combatDebug || flags.attackDebug || flags.attackPackets)) {
    return true;
  }
  const search = typeof w.location?.search === "string" ? w.location.search : "";
  if (search && typeof URLSearchParams === "function") {
    try {
      const params = new URLSearchParams(search);
      const value = params.get("combatDebug");
      if (value === "" || value === "1" || value === "true") {
        return true;
      }
    } catch {
      // ignore parsing errors
    }
  }
  try {
    const stored = w.localStorage?.getItem?.("combat-debug-overlay");
    if (stored === "1" || stored === "true") {
      return true;
    }
  } catch {
    // ignore storage access issues
  }
  return false;
}

if (typeof window !== "undefined") {
  window.addEventListener("keydown", (event) => {
    if (event.key === "F3") {
      event.preventDefault();
      queueDebugPanelToggle();
      return;
    }
    if (event.key === "F4") {
      event.preventDefault();
      loadCombatDebugOverlayModule().then((api) => api?.toggle?.());
    }
  });

  const g = window as typeof window & Record<string, unknown>;
  g.loadDebugPanel = () => {
    debugPanelToggleCount = 0;
    return loadDebugPanelModule().then((api) => api?.show?.());
  };
  g.hideDebugPanel = () => {
    debugPanelToggleCount = 0;
    return loadDebugPanelModule().then((api) => api?.hide?.());
  };
  g.toggleDebugPanel = () => {
    debugPanelToggleCount = 0;
    return loadDebugPanelModule().then((api) => api?.toggle?.());
  };
  g.showCombatDebugOverlay = () => loadCombatDebugOverlayModule().then((api) => api?.show?.());
  g.hideCombatDebugOverlay = () => loadCombatDebugOverlayModule().then((api) => api?.hide?.());
  g.toggleCombatDebugOverlay = () => loadCombatDebugOverlayModule().then((api) => api?.toggle?.());

  if (shouldBootstrapDebugPanel()) {
    loadDebugPanelModule().then((api) => api?.show?.());
  }
  if (shouldBootstrapCombatDebugOverlay()) {
    loadCombatDebugOverlayModule().then((api) => api?.show?.());
  }
}

async function loadMainRuntime(): Promise<void> {
  try {
    await import("./main-runtime.js");
  } catch (err) {
    if (typeof console !== "undefined" && console.error) {
      console.error("[runtime] Failed to load game runtime", err);
    }
  }
}

void loadMainRuntime();
