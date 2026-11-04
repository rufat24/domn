// Runs AI work off the UI thread. Messages: {id, type:'choose'|'probs', ...}
import { makeRng } from '../engine/tiles.js';
import { chooseMove } from './pimc.js';
import { tileProbabilities } from './belief.js';

self.onmessage = (e) => {
  const { id, type, view, level, seed, n, opts } = e.data;
  try {
    const rng = makeRng(seed ?? (Math.random() * 2 ** 32) >>> 0);
    let out;
    if (type === 'choose') out = chooseMove(view, { level, rng, ...(opts || {}) });
    else if (type === 'probs') out = tileProbabilities(view, rng, n || 1000);
    self.postMessage({ id, ok: true, out });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.stack ? err.stack : err) });
  }
};
