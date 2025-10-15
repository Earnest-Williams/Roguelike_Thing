export interface DebugPanelApi {
  element: HTMLElement;
  show(): boolean;
  hide(): boolean;
  toggle(): boolean;
  isVisible(): boolean;
}

export function ensureDebugPanel(): DebugPanelApi | null;
export function getDebugPanelElement(): HTMLElement | null;
export function isDebugPanelVisible(): boolean;
export function destroyDebugPanel(): void;
