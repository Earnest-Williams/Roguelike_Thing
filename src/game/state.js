import {
  createDefaultModCache,
  createEmptyStatusDerivedMods,
} from "./utils.js";

const INVALID_POSITION_COORD = -1;

/**
 * Build the long-lived global game state object. The structure mirrors what
 * the renderer and simulation expect so we can safely reset the state without
 * leaking old references.
 */
export function createInitialState() {
  return {
    player: null,
    mobManager: null,
    map: {
      width: 0,
      height: 0,
      grid: [],
      explored: [],
      known: [],
      furniture: [],
      furnitureIndex: new Map(),
    },
    sim: {
      timeout: null,
      loopFn: null,
      isPaused: false,
      speed: 12,
      isReady: false,
      turnCounter: 0,
    },
    ui: {
      statusDiv: null,
      restartBtn: null,
      equipmentSlots: null,
      inventorySlots: null,
      speedSlider: null,
      speedValue: null,
      pauseIndicator: null,
      container: null,
      viewport: null,
      canvas: null,
      minimapModal: null,
      minimapCanvas: null,
      minimapClose: null,
    },
    render: {
      canvasRenderer: null,
      renderController: null,
      ready: false,
      minimapRenderer: null,
      minimapController: null,
    },
    fov: {
      currentVisible: new Set(),
      prevVisible: new Set(),
      lastCache: { key: null, radius: null, visible: null },
      overlayStyle: "rgba(255,255,102,0.20)",
      overlayRgb: null,
    },
    exploration: {
      frontiers: new Set(),
      newlyExplored: [],
    },
    status: {
      defaultModCache: createDefaultModCache(),
      emptyDerivedMods: createEmptyStatusDerivedMods(),
    },
    debug: {
      devPanelMounted: false,
      debugOverlayMounted: false,
      debugOverlayInstance: null,
    },
    prevPlayerPos: {
      x: INVALID_POSITION_COORD,
      y: INVALID_POSITION_COORD,
    },
    hasPrevPlayerPos: false,
    currentEndPos: null,
    isEndRendered: false,
    initRetries: 0,
    chapter: null,
    __didInitialSpawns: false,
  };
}

