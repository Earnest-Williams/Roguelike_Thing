import { DebugBus, type DebugEvent } from "./debug-bus.js";

export interface DebugPanelApi {
  element: HTMLElement;
  show(): boolean;
  hide(): boolean;
  toggle(): boolean;
  isVisible(): boolean;
}

interface AttackDebugPayload {
  afterDefense?: Record<string, number>;
  totalDamage?: number;
  appliedStatuses?: Array<{ id?: string } | string>;
  [key: string]: unknown;
}

interface AttackDebugEvent extends DebugEvent {
  type: "attack";
  payload?: AttackDebugPayload | null;
}

let root: HTMLElement | null = null;
let mounted = false;
let visible = false;
let unsubscribe: (() => void) | null = null;

function ensureRoot(): HTMLElement | null {
  if (root || typeof document === "undefined") return root;
  const el = document.createElement("div");
  el.id = "debug-panel";
  Object.assign(el.style, {
    position: "fixed",
    top: "8px",
    right: "8px",
    zIndex: "9999",
    width: "420px",
    maxHeight: "80vh",
    overflow: "auto",
    background: "rgba(0, 0, 0, 0.8)",
    color: "#eee",
    font: "12px/1.4 monospace",
    padding: "8px",
    borderRadius: "12px",
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
    display: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(el);
  root = el;
  mounted = true;
  return root;
}

function setVisible(next: boolean): boolean {
  visible = !!next;
  if (!root) ensureRoot();
  if (root) {
    root.style.display = visible ? "block" : "none";
  }
  return visible;
}

function renderAttack(evt: DebugEvent): void {
  if (!visible || !evt || evt.type !== "attack") return;
  const { payload } = evt as AttackDebugEvent;
  if (!payload) return;
  if (!root) ensureRoot();
  if (!root) return;

  const summary = document.createElement("div");
  summary.style.margin = "6px 0 12px";

  const packets = payload.afterDefense ?? {};
  const packetKeys = Object.keys(packets).filter((key) => (packets[key] ?? 0) > 0);
  const chips = packetKeys
    .map(
      (key) =>
        `<span style="display:inline-block;margin:0 6px 6px 0;padding:2px 6px;border-radius:6px;background:#222">${key}:${packets[key]}</span>`,
    )
    .join("");

  const applied = Array.isArray(payload.appliedStatuses)
    ? payload.appliedStatuses.map((s) => (typeof s === "string" ? s : s?.id ?? String(s))).join(", ") || "—"
    : "—";

  summary.innerHTML = `
    <div><strong>Packets:</strong> ${chips || "—"}</div>
    <div><strong>Total:</strong> ${payload.totalDamage ?? 0}</div>
    <div><strong>Status Applied:</strong> ${applied}</div>
  `;

  const pre = document.createElement("pre");
  pre.style.whiteSpace = "pre-wrap";
  pre.style.margin = "0 0 8px 0";
  pre.textContent = JSON.stringify(payload, null, 2);

  root.prepend(pre);
  root.prepend(summary);

  while (root.childElementCount > 20) {
    const last = root.lastElementChild;
    if (!last) break;
    root.removeChild(last);
  }
}

function subscribe(): void {
  if (unsubscribe) return;
  unsubscribe = DebugBus.on(renderAttack);
}

function ensurePanel(): HTMLElement | null {
  if (!mounted) ensureRoot();
  if (mounted) subscribe();
  return root;
}

export function ensureDebugPanel(): DebugPanelApi | null {
  const el = ensurePanel();
  if (!el) return null;
  return {
    element: el,
    show(): boolean {
      return setVisible(true);
    },
    hide(): boolean {
      return setVisible(false);
    },
    toggle(): boolean {
      return setVisible(!visible);
    },
    isVisible(): boolean {
      return visible;
    },
  } satisfies DebugPanelApi;
}

export function getDebugPanelElement(): HTMLElement | null {
  return root;
}

export function isDebugPanelVisible(): boolean {
  return visible;
}

export function destroyDebugPanel(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  if (root?.parentNode) {
    root.parentNode.removeChild(root);
  }
  root = null;
  mounted = false;
  visible = false;
}
