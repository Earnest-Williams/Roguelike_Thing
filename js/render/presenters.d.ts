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
export type OverlayAlphaSampler = (x: number, y: number, entitiesOnTile?: readonly OverlayEntityVisual[]) => number | undefined;
export type OverlayColorSampler = (x: number, y: number, entitiesOnTile?: readonly OverlayEntityVisual[]) => RGBA | null | undefined;
export interface BuildMainViewBatchParams {
    grid: number[][];
    explored: boolean[][];
    visibleSet: Set<string>;
    player: {
        x: number;
        y: number;
        lightRadius?: number;
        getLightRadius?: () => number;
    };
    startPos?: {
        x: number;
        y: number;
    } | null;
    endPos?: {
        x: number;
        y: number;
    } | null;
    colors: Record<string, string>;
    lightRadius?: number;
    overlayAlphaAt: OverlayAlphaSampler;
    overlayColorAt?: OverlayColorSampler | null;
    overlayColor?: RGBA | null;
    entities?: OverlayEntityVisual[];
}
export interface BuildMinimapPresentationParams {
    grid: number[][];
    explored: boolean[][];
    player: {
        x: number;
        y: number;
    };
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
export declare function buildMainViewBatch({ grid, explored, visibleSet, player, startPos, endPos, colors, lightRadius, overlayAlphaAt, overlayColorAt, overlayColor, entities, }: BuildMainViewBatchParams): TileVisual[];
export declare function buildMinimapPresentation({ grid, explored, player, padding, colors, }: BuildMinimapPresentationParams): MinimapPresentation;
export declare function presentDebug(actor: unknown): string;
type HudContext = (CanvasRenderingContext2D & {
    debugText?(text: string): void;
}) | {
    debugText?(text: string): void;
    fillText?(text: string, x: number, y: number): void;
    save?(): void;
    restore?(): void;
    fillStyle?: string;
};
interface ActorResourcesState {
    [key: string]: number | {
        cur?: number;
        max?: number;
    };
}
interface ActorLike {
    ap?: number;
    maxAP?: number;
    apCap?: number;
    baseActionAP?: number;
    resources?: {
        pools?: ActorResourcesState;
    };
    attunement?: {
        stacks?: Record<string, number>;
    };
    cooldowns?: Record<string, number>;
    statuses?: Array<{
        id?: string;
        stacks?: number;
    }>;
}
export declare function drawHUD(ctx: HudContext | null | undefined, actor: ActorLike | null | undefined): string;
export declare function mountDevPanel(root: HTMLElement, actor: unknown): void;
export {};
