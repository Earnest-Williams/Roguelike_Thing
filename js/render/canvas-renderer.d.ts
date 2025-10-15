import type { IRenderer, RendererMinimapColors, RendererMinimapOptions, TileVisual, ViewTransform } from "./types.js";
export declare class CanvasRenderer implements IRenderer {
    readonly canvas: HTMLCanvasElement;
    readonly ctx: CanvasRenderingContext2D;
    private width;
    private height;
    private cell;
    private lastView;
    constructor(canvas: HTMLCanvasElement, ctx?: CanvasRenderingContext2D | null);
    init(widthTiles: number, heightTiles: number, cellSize: number): void;
    setViewTransform(view: ViewTransform): void;
    clear(): void;
    drawTiles(batch: TileVisual[]): void;
    drawMinimap(batch: TileVisual[], opts?: RendererMinimapOptions & {
        colors?: RendererMinimapColors;
    }): void;
    resize(widthTiles: number, heightTiles: number, cellSize: number): void;
}
