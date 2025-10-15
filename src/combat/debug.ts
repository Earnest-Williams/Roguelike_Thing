// @ts-nocheck
// src/combat/debug.ts

export interface DebugLogEntry extends Record<string, unknown> {
  t: number;
  kind: string;
}

export interface DebuggableActor {
  log?: DebugLogEntry[];
  turn?: number;
}

export function logEvent(
  actor: DebuggableActor | null | undefined,
  kind: string,
  payload: Record<string, unknown> = {}
): void {
  if (!actor) return;
  const ring = actor.log || (actor.log = []);
  ring.push({ t: actor.turn ?? 0, kind, ...payload });
  if (ring.length > 200) ring.shift();
}
