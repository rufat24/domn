// Belief tracking: which hidden tiles can be where, and consistent random "worlds".
import { ALL, HAS, TA, TB, numMask, popcount, maskToIds } from '../engine/tiles.js';

/** Public/own view of the game for one seat. This is the ONLY thing the AI gets to see. */
export function makeView(s, seat) {
  return {
    rules: s.rules,
    seat,
    hand: s.hands[seat],
    ends: s.ends ? s.ends.slice() : null,
    played: s.played,
    voids: s.voids.slice(),
    plays: s.plays.slice(),
    turn: s.turn,
    mustOpen: s.mustOpen,
    log: s.log ? s.log.slice() : null,
  };
}

export const handSize = (view, q) => 7 - view.plays[q];

/** For each other seat: mask of unseen tiles it could still hold (not void). */
export function possibleHolders(view) {
  const unknown = ALL & ~view.played & ~view.hand;
  const res = {};
  for (let q = 0; q < 4; q++) {
    if (q === view.seat) continue;
    let allowed = 0;
    for (const id of maskToIds(unknown)) if (!(view.voids[q] & numMask(id))) allowed |= 1 << id;
    res[q] = allowed;
  }
  return { unknown, allowed: res };
}

/** Draw a world (hands for all four seats) consistent with everything the seat has observed. */
export function sampleWorld(view, rng, mix = 24) {
  const me = view.seat;
  const others = [0, 1, 2, 3].filter((q) => q !== me);
  const unknown = maskToIds(ALL & ~view.played & ~view.hand);
  const cap = {};
  for (const q of others) cap[q] = handSize(view, q);
  const allowed = unknown.map((id) => others.filter((q) => !(view.voids[q] & numMask(id))));
  const order = unknown.map((_, i) => i).sort((a, b) => allowed[a].length - allowed[b].length || rng() - 0.5);
  const assign = new Array(unknown.length).fill(-1);
  const left = { ...cap };

  const dfs = (k) => {
    if (k === order.length) return true;
    const i = order[k];
    const opts = allowed[i].filter((q) => left[q] > 0);
    // random weighted order by remaining capacity
    const w = opts.map((q) => left[q] * (0.5 + rng()));
    while (opts.length) {
      let bi = 0;
      for (let j = 1; j < opts.length; j++) if (w[j] > w[bi]) bi = j;
      const q = opts[bi];
      opts.splice(bi, 1);
      w.splice(bi, 1);
      assign[i] = q;
      left[q]--;
      if (dfs(k + 1)) return true;
      left[q]++;
      assign[i] = -1;
    }
    return false;
  };
  if (!dfs(0)) return null; // inconsistent observation (should not happen)

  // MCMC swaps to move toward uniform over consistent worlds
  const idx = unknown.map((_, i) => i);
  for (let it = 0; it < mix * unknown.length / 4; it++) {
    const a = idx[rng.int(idx.length)];
    const b = idx[rng.int(idx.length)];
    const qa = assign[a];
    const qb = assign[b];
    if (qa === qb) continue;
    if (allowed[a].includes(qb) && allowed[b].includes(qa)) {
      assign[a] = qb;
      assign[b] = qa;
    }
  }
  const hands = [0, 0, 0, 0];
  hands[me] = view.hand;
  for (let i = 0; i < unknown.length; i++) hands[assign[i]] |= 1 << unknown[i];
  return hands;
}

/** Monte-Carlo probability that each hidden tile sits in each other seat: P[id][seat]. */
export function tileProbabilities(view, rng, n = 1200) {
  const P = Array.from({ length: 28 }, () => [0, 0, 0, 0]);
  let got = 0;
  for (let i = 0; i < n; i++) {
    const w = sampleWorld(view, rng, 10);
    if (!w) continue;
    got++;
    for (let q = 0; q < 4; q++) if (q !== view.seat) for (const id of maskToIds(w[q])) P[id][q]++;
  }
  if (got) for (const row of P) for (let q = 0; q < 4; q++) row[q] /= got;
  return { P, samples: got };
}
