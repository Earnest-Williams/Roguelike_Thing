import { buildMainViewBatch, buildMinimapPresentation } from "./presenters.js";
let debugVisible = true;
if (typeof window !== "undefined") {
    window.addEventListener("keydown", (e) => {
        if (e.key === "`") {
            debugVisible = !debugVisible;
            const panelRoot = globalThis?.dp?.root;
            if (panelRoot instanceof HTMLElement) {
                panelRoot.style.display = debugVisible ? "block" : "none";
            }
        }
    });
}
/**
 * High-level orchestrator that bridges game state and renderer implementation.
 */
export class RenderController {
    constructor(renderer) {
        this.renderer = renderer;
    }
    init(mapW, mapH, cellSize) {
        this.renderer.init(mapW, mapH, cellSize);
    }
    render(state, view) {
        this.renderer.setViewTransform(view);
        const entities = Array.isArray(state.entities)
            ? state.entities.filter((ent) => !!ent && typeof ent.x === "number" && typeof ent.y === "number")
            : [];
        const entityMap = new Map();
        for (const ent of entities) {
            const key = `${ent.x},${ent.y}`;
            if (!entityMap.has(key))
                entityMap.set(key, []);
            entityMap.get(key).push(ent);
        }
        if (typeof state.player.x === "number" && typeof state.player.y === "number") {
            const key = `${state.player.x},${state.player.y}`;
            if (!entityMap.has(key))
                entityMap.set(key, []);
            entityMap.get(key).push({
                x: state.player.x,
                y: state.player.y,
                kind: "player",
            });
        }
        const overlayAlphaAt = (x, y, entitiesOnTile) => {
            const entries = entityMap.get(`${x},${y}`) ?? entitiesOnTile;
            return state.overlayAlphaAt(x, y, entries);
        };
        const overlayColorAt = typeof state.overlayColorAt === "function"
            ? (x, y, entitiesOnTile) => {
                const entries = entityMap.get(`${x},${y}`) ?? entitiesOnTile;
                return state.overlayColorAt?.(x, y, entries);
            }
            : undefined;
        const playerLightRadius = Number.isFinite(state.lightRadius)
            ? Math.max(0, state.lightRadius)
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
    resize(mapW, mapH, cellSize) {
        this.renderer.resize(mapW, mapH, cellSize);
    }
    renderMinimap(state, view, options) {
        this.renderer.setViewTransform(view);
        const presentation = buildMinimapPresentation({
            grid: state.map.grid,
            explored: state.map.explored,
            player: state.player,
            padding: state.padding ?? 0,
            colors: state.colors ?? {},
        });
        this.renderer.clear();
        const minimapOptions = {
            padding: presentation.padding,
            colors: presentation.colors,
        };
        if (options?.viewportRect) {
            minimapOptions.viewportRect = options.viewportRect;
        }
        this.renderer.drawMinimap(presentation.tiles, minimapOptions);
    }
}
