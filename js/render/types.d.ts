export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export type TileKind = "wall" | "floor" | "player" | "start" | "end" | "entity" | string;

export interface TileVisual {
  x: number;
  y: number;
  kind: TileKind;
  glyph?: string;
  fg?: RGBA;
  bg?: RGBA;
  overlayA?: number;
  overlayColor?: RGBA;
  badge?: string;
  badgeColor?: RGBA;
  badgeBg?: RGBA;
}

export interface ViewTransform {
  tx: number;
  ty: number;
  cellSize: number;
  viewW: number;
  viewH: number;
}

export interface RendererViewportRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RendererMinimapColors {
  viewport?: RGBA;
  border?: RGBA;
}

export interface RendererMinimapOptions {
  viewportRect?: RendererViewportRect;
  padding?: number;
  colors?: RendererMinimapColors;
}

export interface IRenderer {
  init(widthTiles: number, heightTiles: number, cellSize: number): void;
  setViewTransform(view: ViewTransform): void;
  drawTiles(batch: TileVisual[]): void;
  drawMinimap(batch: TileVisual[], opts?: RendererMinimapOptions): void;
  clear(): void;
  resize(widthTiles: number, heightTiles: number, cellSize: number): void;
}
