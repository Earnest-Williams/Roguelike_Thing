export declare function shuffle(array: any): any;
export declare function posKey(pos: any): string;
export declare function posKeyFromCoords(x: any, y: any): string;
export declare const randChoice: (arr: any) => any;
export declare function clamp(value: any, min: any, max: any): number;
export declare const clamp01Normalized: (value: any) => number;
export declare function colorStringToRgb(color: any, fallbackColor?: string): {
    r: number;
    g: number;
    b: number;
};
export declare function colorStringToRgba(color: any, fallbackColor?: string): any;
export declare const getNow: () => number;
export declare function smoothstep01(x: any): number;
export declare function chebyshevDistance(a: any, b: any): number;
export declare function hasLineOfSight(grid: any, from: any, to: any): boolean;
