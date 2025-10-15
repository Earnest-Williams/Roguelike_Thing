import { buildMainViewBatch, buildMinimapPresentation } from "./presenters.js";
import type {
  OverlayAlphaSampler,
  OverlayColorSampler,
  OverlayEntityVisual,
} from "./presenters.js";
import type {
  IRenderer,
  RGBA,
  RendererMinimapOptions,
  RendererViewportRect,
  ViewTransform,
} from "./types.js";

let debugVisible = true;
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "`") {
      debugVisible = !debugVisible;
      const panelRoot = (globalThis as typeof globalThis & { dp?: { root?: unknown } })?.dp?.root;
      if (panelRoot instanceof HTMLElement) {
        panelRoot.style.display = debugVisible ? "block" : "none";
      }
    }
  });
}

export interface RenderControllerState {
  map: {
    grid: number[][];
    explored: boolean[][];
  };
  fov: {
    visible: Set<string>;
  };
  player: {
    x: number;
    y: number;
    lightRadius?: number;
    getLightRadius?: () => number;
    [key: string]: unknown;
  };
  start?: { x: number; y: number } | null;
  end?: { x: number; y: number } | null;
  colors: Record<string, string>;
  lightRadius?: number;
  overlayAlphaAt: OverlayAlphaSampler;
  overlayColorAt?: OverlayColorSampler;
  overlayColor?: RGBA | null;
  entities?: Array<OverlayEntityVisual & Record<string, unknown>>;
}

export interface RenderMinimapState {
  map: {
    grid: number[][];
    explored: boolean[][];
  };
  player: { x: number; y: number };
  padding?: number;
  colors?: Record<string, string>;
}

export interface RenderMinimapOptions {
  viewportRect?: RendererViewportRect;
}

/**
 * High-level orchestrator that bridges game state and renderer implementation.
 */
export class RenderController {
  private readonly renderer: IRenderer;

  constructor(renderer: IRenderer) {
    this.renderer = renderer;
  }

  init(mapW: number, mapH: number, cellSize: number): void {
    this.renderer.init(mapW, mapH, cellSize);
  }

  render(state: RenderControllerState, view: ViewTransform): void {
    this.renderer.setViewTransform(view);

    const entities: OverlayEntityVisual[] = Array.isArray(state.entities)
      ? state.entities.filter((ent): ent is OverlayEntityVisual =>
          !!ent && typeof ent.x === "number" && typeof ent.y === "number",
        )
      : [];

    const entityMap = new Map<string, OverlayEntityVisual[]>();
    for (const ent of entities) {
      const key = `${ent.x},${ent.y}`;
      if (!entityMap.has(key)) entityMap.set(key, []);
      entityMap.get(key)!.push(ent);
    }

    if (typeof state.player.x === "number" && typeof state.player.y === "number") {
      const key = `${state.player.x},${state.player.y}`;
      if (!entityMap.has(key)) entityMap.set(key, []);
      entityMap.get(key)!.push({
        x: state.player.x,
        y: state.player.y,
        kind: "player",
      });
    }

    const overlayAlphaAt: OverlayAlphaSampler = (x, y, entitiesOnTile) => {
      const entries = entityMap.get(`${x},${y}`) ?? entitiesOnTile;
      return state.overlayAlphaAt(x, y, entries);
    };

    const overlayColorAt: OverlayColorSampler | undefined = typeof state.overlayColorAt === "function"
      ? (x, y, entitiesOnTile) => {
          const entries = entityMap.get(`${x},${y}`) ?? entitiesOnTile;
          return state.overlayColorAt?.(x, y, entries);
        }
      : undefined;

    const playerLightRadius = Number.isFinite(state.lightRadius)
      ? Math.max(0, state.lightRadius as number)
      : Number.isFinite(state.player?.lightRadius)
        ? Math.max(0, Number(state.player.lightRadius))
        : 0;

    const batch = buildMainViewBatch({
      grid: state.map.grid,
      explored: state.map.explored,
      visibleSet: state.fov.visible,
      player: state.player,
      startPos: state.start ?? null,
      endPos: state.end ?? null,
      colors: state.colors,
      lightRadius: playerLightRadius,
      overlayAlphaAt,
      overlayColorAt: overlayColorAt ?? null,
      overlayColor: state.overlayColor ?? null,
      entities,
    });

    this.renderer.clear();
    this.renderer.drawTiles(batch);
  }

  resize(mapW: number, mapH: number, cellSize: number): void {
    this.renderer.resize(mapW, mapH, cellSize);
  }

  renderMinimap(state: RenderMinimapState, view: ViewTransform, options?: RenderMinimapOptions): void {
    this.renderer.setViewTransform(view);
    const presentation = buildMinimapPresentation({
      grid: state.map.grid,
      explored: state.map.explored,
      player: state.player,
      padding: state.padding ?? 0,
      colors: state.colors ?? {},
    });

    this.renderer.clear();
    const minimapOptions: RendererMinimapOptions = {
      padding: presentation.padding,
      colors: presentation.colors,
    };
    if (options?.viewportRect) {
      minimapOptions.viewportRect = options.viewportRect;
    }

    this.renderer.drawMinimap(presentation.tiles, minimapOptions);
  }
}
