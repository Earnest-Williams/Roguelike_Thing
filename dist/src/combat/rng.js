// src/combat/rng.js
// @ts-nocheck
let _seed = 1234567;
export function setSeed(seed) {
    _seed = seed | 0;
}
export function rand() {
    let x = _seed | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    _seed = x | 0;
    return (x >>> 0) / 0xffffffff;
}
export function roll(min, max) {
    const lo = Math.floor(min);
    const hi = Math.floor(max);
    return Math.floor(lo + rand() * (hi - lo + 1));
}
