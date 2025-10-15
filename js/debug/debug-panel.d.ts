export interface DebugPanelApi {
    element: HTMLElement;
    show(): boolean;
    hide(): boolean;
    toggle(): boolean;
    isVisible(): boolean;
}
export declare function ensureDebugPanel(): DebugPanelApi | null;
export declare function getDebugPanelElement(): HTMLElement | null;
export declare function isDebugPanelVisible(): boolean;
export declare function destroyDebugPanel(): void;
