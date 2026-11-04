// Promise API over the AI worker, with an inline fallback if workers are unavailable.
import { makeRng } from '../engine/tiles.js';
import { chooseMove } from './pimc.js';
import { tileProbabilities } from './belief.js';
import { endgameForecast } from './endgame.js';

let worker = null;
let failed = false;
let seq = 0;
const pending = new Map();

function ensure() {
  if (worker || failed) return;
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { id, ok, out, error } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      ok ? p.resolve(out) : p.reject(new Error(error));
    };
    worker.onerror = () => {
      failed = true;
      worker = null;
      for (const p of pending.values()) p.reject(new Error('worker failed'));
      pending.clear();
    };
  } catch {
    failed = true;
  }
}

function call(type, payload, inline) {
  ensure();
  if (failed || !worker) return new Promise((res) => setTimeout(() => res(inline()), 0));
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, type, ...payload });
  }).catch(() => inline());
}

export const aiChoose = (view, level, opts = {}) =>
  call('choose', { view, level, opts }, () => chooseMove(view, { level, rng: makeRng((Math.random() * 2 ** 32) >>> 0), ...opts }));
export const aiProbs = (view, n = 900) =>
  call('probs', { view, n }, () => tileProbabilities(view, makeRng((Math.random() * 2 ** 32) >>> 0), n));
export const aiEndgame = (view, n = 400) =>
  call('endgame', { view, n }, () => endgameForecast(view, makeRng((Math.random() * 2 ** 32) >>> 0), n));
