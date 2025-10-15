import type {
  IRenderer,
  RendererMinimapColors,
  RendererMinimapOptions,
  TileVisual,
  ViewTransform,
} from "./types.js";

export class CanvasRenderer implements IRenderer {
  constructor(canvas: HTMLCanvasElement, ctx?: CanvasRenderingContext2D | null);
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  init(widthTiles: number, heightTiles: number, cellSize: number): void;
  setViewTransform(view: ViewTransform): void;
  clear(): void;
  drawTiles(batch: TileVisual[]): void;
  drawMinimap(batch: TileVisual[], opts?: RendererMinimapOptions & { colors?: RendererMinimapColors }): void;
  resize(widthTiles: number, heightTiles: number, cellSize: number): void;
}
