import type {
  IRenderer,
  RendererViewportRect,
  ViewTransform,
  RGBA,
} from "./types.js";

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
  };
  start?: { x: number; y: number } | null;
  end?: { x: number; y: number } | null;
  colors: Record<string, string>;
  lightRadius?: number;
  overlayAlphaAt: (x: number, y: number, entitiesOnTile?: unknown[]) => number | undefined;
  overlayColorAt?: (x: number, y: number, entitiesOnTile?: unknown[]) => RGBA | null | undefined;
  overlayColor?: RGBA | null | undefined;
  entities?: Array<{
    x: number;
    y: number;
    [key: string]: unknown;
  }>;
}

export interface RenderMinimapOptions {
  viewportRect?: RendererViewportRect;
}

export class RenderController {
  constructor(renderer: IRenderer);
  init(mapW: number, mapH: number, cellSize: number): void;
  render(state: RenderControllerState, view: ViewTransform): void;
  resize(mapW: number, mapH: number, cellSize: number): void;
  renderMinimap(
    state: {
      map: {
        grid: number[][];
        explored: boolean[][];
      };
      player: { x: number; y: number };
      padding?: number;
      colors?: Record<string, string>;
    },
    view: ViewTransform,
    options?: RenderMinimapOptions & { colors?: import("./types.js").RendererMinimapColors }
  ): void;
}
