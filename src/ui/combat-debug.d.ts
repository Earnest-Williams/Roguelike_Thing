// @ts-nocheck
export interface CombatDebugOverlayOptions {
  root?: { innerHTML: string; style?: any; remove?: () => void } | null;
}

export interface LatestSummary {
  attackerName?: string;
  defenderName?: string;
  turn?: number;
  totalDamage?: number;
  steps: Array<{
    stage: string;
    totals: Record<string, number>;
    diff?: Record<string, number>;
    meta?: unknown;
  }>;
  statuses?: { attempts?: any[]; applied?: any[] } | undefined;
  hooks?: Record<string, unknown> | undefined;
}

export class CombatDebugOverlay {
  constructor(opts?: CombatDebugOverlayOptions);
  root: { innerHTML: string; style?: any; remove?: () => void } | null;
  visible: boolean;
  latest: LatestSummary | null;
  recent: Array<{ label: string; turn?: number; damage?: number }>;
  unsubscribe: (() => void) | null;
  destroy(): void;
  show(): void;
  hide(): void;
  toggle(): void;
  render(): void;
}

export function ensureCombatDebugOverlay(
  opts?: CombatDebugOverlayOptions,
): CombatDebugOverlay;
