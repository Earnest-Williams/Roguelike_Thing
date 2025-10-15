import type { RGBA, TileVisual } from "./types.js";

export interface OverlayEntityVisual {
  x: number;
  y: number;
  kind?: string;
  glyph?: string;
  fg?: string | RGBA;
  bg?: string | RGBA;
  overlayA?: number;
  overlayColor?: string | RGBA;
  badge?: string;
  badgeColor?: string | RGBA;
  badgeBg?: string | RGBA;
  [key: string]: unknown;
}

export interface BuildMainViewBatchParams {
  grid: number[][];
  explored: boolean[][];
  visibleSet: Set<string>;
  player: { x: number; y: number; lightRadius?: number; getLightRadius?: () => number };
  startPos?: { x: number; y: number } | null;
  endPos?: { x: number; y: number } | null;
  colors: Record<string, string>;
  lightRadius?: number;
  overlayAlphaAt: (x: number, y: number) => number | undefined;
  overlayColorAt?: (x: number, y: number) => RGBA | null | undefined;
  overlayColor?: RGBA | null | undefined;
  entities?: OverlayEntityVisual[];
}

export function buildMainViewBatch(params: BuildMainViewBatchParams): TileVisual[];

export interface BuildMinimapPresentationParams {
  grid: number[][];
  explored: boolean[][];
  player: { x: number; y: number };
  padding?: number;
  colors: Record<string, string>;
}

export interface MinimapPresentation {
  tiles: TileVisual[];
  width: number;
  height: number;
  padding: number;
  colors: {
    viewport?: RGBA;
    border?: RGBA;
  };
}

export function buildMinimapPresentation(params: BuildMinimapPresentationParams): MinimapPresentation;

export function presentDebug(actor: unknown): string;

export function drawHUD(
  ctx:
    | (CanvasRenderingContext2D & { debugText?(text: string): void })
    | { debugText?(text: string): void; fillText?(text: string, x: number, y: number): void; save?(): void; restore?(): void }
    | null
    | undefined,
  actor: {
    [key: string]: unknown;
  } | null | undefined
): string;

export function mountDevPanel(root: HTMLElement, actor: unknown): void;
