// Domino set double-six: 28 tiles. id -> [a,b] with a<=b.
export const TILES = [];
export const ID_OF = [];
for (let a = 0; a <= 6; a++) ID_OF.push(new Array(7).fill(-1));
for (let a = 0; a <= 6; a++) {
  for (let b = a; b <= 6; b++) {
    const id = TILES.length;
    TILES.push([a, b]);
    ID_OF[a][b] = id;
    ID_OF[b][a] = id;
  }
}
export const ALL = (1 << 28) - 1;
export const TA = TILES.map((t) => t[0]);
export const TB = TILES.map((t) => t[1]);
export const PIPS = TILES.map((t) => t[0] + t[1]);
export const IS_DOUBLE = TILES.map((t) => t[0] === t[1]);
/** HAS[n] = mask of all tiles containing number n (7 tiles each). */
export const HAS = [];
for (let n = 0; n <= 6; n++) {
  let m = 0;
  for (let id = 0; id < 28; id++) if (TA[id] === n || TB[id] === n) m |= 1 << id;
  HAS.push(m);
}
export const bit = (id) => 1 << id;
export const popcount = (m) => {
  m = m - ((m >>> 1) & 0x55555555);
  m = (m & 0x33333333) + ((m >>> 2) & 0x33333333);
  return (((m + (m >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
};
export function maskToIds(m) {
  const out = [];
  for (let id = 0; id < 28; id++) if (m & (1 << id)) out.push(id);
  return out;
}
export const idsToMask = (ids) => ids.reduce((m, id) => m | (1 << id), 0);
export const tileName = (id) => `${TA[id]}-${TB[id]}`;
export const idByName = (s) => {
  const [a, b] = s.split('-').map(Number);
  return ID_OF[a][b];
};
/** Mask of numbers (bit n) that appear in tile id. */
export const numMask = (id) => (1 << TA[id]) | (1 << TB[id]);

// ---- seeded RNG (mulberry32) ----
export function makeRng(seed = 1) {
  let s = seed >>> 0;
  const f = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.int = (n) => Math.floor(f() * n);
  f.state = () => s;
  return f;
}
export function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
