// Endgame reading: "will this hand close (fish) or will somebody go out — and who?"
// Structural facts (closed numbers, tiles still alive on the open ends) plus a Monte-Carlo
// forecast over worlds consistent with what the seat has seen.
import { HAS, popcount, makeRng } from '../engine/tiles.js';
import { teamOf } from '../engine/game.js';
import { applyMove } from '../engine/game.js';
import { policyMove, DEFAULT_W } from './policy.js';
import { sampleWorld } from './belief.js';
import { simFromView } from './pimc.js';

export const tilesLeft = (view) => 28 - popcount(view.played);

/**
 * Public structure of the position (no sampling).
 *  unseen[n]  – tiles carrying n that are neither played nor in our hand (somebody else holds them)
 *  alive[n]   – tiles carrying n that are not yet played at all (ours + unseen)
 *  sealed[n]  – no opponent/partner tile carries n any more (unseen==0)
 *  endAlive   – for each open end: how many tiles can still be put on it "in the long run"
 */
export function closureInfo(view) {
  const unseen = [];
  const alive = [];
  const sealed = [];
  for (let n = 0; n <= 6; n++) {
    unseen[n] = popcount(HAS[n] & ~view.played & ~view.hand);
    alive[n] = popcount(HAS[n] & ~view.played);
    sealed[n] = unseen[n] === 0;
  }
  const ends = view.ends;
  return {
    unseen,
    alive,
    sealed,
    ends,
    endUnseen: ends ? ends.map((e) => unseen[e]) : null,
    endAlive: ends ? ends.map((e) => alive[e]) : null,
    // if neither end number can be extended by anyone else, only our own tiles keep the hand going
    othersStuck: ends ? ends.every((e) => unseen[e] === 0) : false,
    tilesLeft: tilesLeft(view),
  };
}

function oneRollout(view, hands, rng, W, eps) {
  const s = simFromView(view, hands);
  let guard = 0;
  while (!s.over && guard++ < 60) applyMove(s, policyMove(s, s.turn, rng, eps, W));
  return s.result;
}

/**
 * Monte-Carlo forecast from the seat's point of view.
 * returns { n, fish, out, outBy:[4], fishWinBy:[4], tie, win, lose, avg, avgWin, avgLose }
 *   fish/out        – probabilities the hand ends closed / by going out
 *   outBy[q]        – probability seat q goes out
 *   win/lose/tie    – probability our team scores / opponents score / nobody scores
 *   avg             – expected signed points for our team
 */
export function endgameForecast(view, rng, n = 400, opts = {}) {
  const W = opts.W || DEFAULT_W;
  const eps = opts.eps ?? 0.03;
  const me = teamOf(view.seat);
  const r = rng || makeRng((Math.random() * 2 ** 32) >>> 0);
  const out = { n: 0, fish: 0, out: 0, outBy: [0, 0, 0, 0], fishWinBy: [0, 0, 0, 0], tie: 0, win: 0, lose: 0, avg: 0 };
  if (!view.ends) return out;
  for (let i = 0; i < n; i++) {
    // the player to move is known to have a legal tile (otherwise the turn would have passed on):
    // rejection-sample worlds consistent with that fact
    let hands = null;
    const m = HAS[view.ends[0]] | HAS[view.ends[1]];
    for (let tries = 0; tries < 40; tries++) {
      const h = sampleWorld(view, r);
      if (!h) break;
      if (h[view.turn] & m) {
        hands = h;
        break;
      }
    }
    if (!hands) break;
    const res = oneRollout(view, hands, r, W, eps);
    out.n++;
    if (res.kind === 'out') {
      out.out++;
      out.outBy[res.winner]++;
    } else {
      out.fish++;
      if (res.winner >= 0) out.fishWinBy[res.winner]++;
    }
    if (res.team < 0 || res.points === 0) out.tie++;
    else if (res.team === me) {
      out.win++;
      out.avg += res.points;
    } else {
      out.lose++;
      out.avg -= res.points;
    }
  }
  const k = out.n || 1;
  for (const key of ['fish', 'out', 'tie', 'win', 'lose', 'avg']) out[key] /= k;
  out.outBy = out.outBy.map((v) => v / k);
  out.fishWinBy = out.fishWinBy.map((v) => v / k);
  return out;
}
