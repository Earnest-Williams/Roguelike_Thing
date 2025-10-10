export type RGBA = { r: number; g: number; b: number; a: number };

export interface TileVisual {
  x: number; y: number;
  kind: "wall" | "floor" | "player" | "start" | "end";
  glyph?: string;
  fg?: RGBA;
  bg?: RGBA;
  overlayA?: number;
  overlayColor?: RGBA;
}

export interface ViewTransform {
  tx: number; ty: number;
  cellSize: number;
  viewW: number; viewH: number;
}

export interface IRenderer {
  init(widthTiles: number, heightTiles: number, cellSize: number): void;
  setViewTransform(v: ViewTransform): void;
  drawTiles(batch: TileVisual[]): void;
  drawMinimap(batch: TileVisual[], opts?: { viewportRect?: { x: number; y: number; w: number; h: number } }): void;
  clear(): void;
  resize(widthTiles: number, heightTiles: number, cellSize: number): void;
}
