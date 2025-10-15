import type { TileKind } from "./constants.js";

export type XY = { x: number; y: number };

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface RGBA extends RGB {
  a: number;
}

export function shuffle<T>(array: T[]): T[];
export function posKey(pos: { x: number; y: number }): string;
export function posKeyFromCoords(x: number, y: number): string;
export function randChoice<T>(arr: readonly T[]): T;
export function clamp(value: number, min: number, max: number): number;
export function clamp01Normalized(value: number): number;
export function colorStringToRgb(color: string | null | undefined, fallbackColor?: string): RGB;
export function colorStringToRgba(
  color: string | null | undefined,
  fallbackColor?: string
): RGBA;
export const getNow: () => number;
export function smoothstep01(x: number): number;
export function chebyshevDistance(
  a: XY | null | undefined,
  b: XY | null | undefined
): number;
export function hasLineOfSight(
  grid: ArrayLike<ArrayLike<TileKind>> | null | undefined,
  from: XY | null | undefined,
  to: XY | null | undefined
): boolean;
