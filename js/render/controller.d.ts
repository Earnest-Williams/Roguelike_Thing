import type { OverlayAlphaSampler, OverlayColorSampler, OverlayEntityVisual } from "./presenters.js";
import type { IRenderer, RGBA, RendererViewportRect, ViewTransform } from "./types.js";
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
    start?: {
        x: number;
        y: number;
    } | null;
    end?: {
        x: number;
        y: number;
    } | null;
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
    player: {
        x: number;
        y: number;
    };
    padding?: number;
    colors?: Record<string, string>;
}
export interface RenderMinimapOptions {
    viewportRect?: RendererViewportRect;
}
/**
 * High-level orchestrator that bridges game state and renderer implementation.
 */
export declare class RenderController {
    private readonly renderer;
    constructor(renderer: IRenderer);
    init(mapW: number, mapH: number, cellSize: number): void;
    render(state: RenderControllerState, view: ViewTransform): void;
    resize(mapW: number, mapH: number, cellSize: number): void;
    renderMinimap(state: RenderMinimapState, view: ViewTransform, options?: RenderMinimapOptions): void;
}
