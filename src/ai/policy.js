// Heuristic move policy. Uses ONLY the acting seat's own hand + public information
// (ends, played tiles, who passed on which numbers, hand sizes). No peeking.
import { TA, TB, PIPS, HAS, IS_DOUBLE, ALL, popcount } from '../engine/tiles.js';
import { legalMoves, partnerOf, nextSeat } from '../engine/game.js';

export const DEFAULT_W = {
  pips: 0.35, // dump heavy tiles (they cost points if we get stuck)
  double: 1.1, // doubles are hard to place later: get rid of them
  doubleDeadly: 0.9, // extra when few unseen tiles of that number remain (it will get stranded)
  own: 0.55, // each remaining tile of mine that matches a new open end (I keep control of that number)
  mobility: 0.35, // number of my remaining tiles playable after the move
  oppVoid: 0.9, // an open end an opponent is void in -> he must pass
  partnerVoid: 1.3, // an open end my partner is void in -> he will be forced to pass (bad)
  partnerHelp: 0.25, // open end that partner is likely to hold (not void, unseen tiles remain)
  oppHelp: 0.2, // opponents likely to hold the new end number (unseen tiles count)
  dead: 0.6, // closing a number completely (blocking)
  variety: 0.18, // distinct numbers left in my hand (flexibility)
  goOut: 100,
  lastPlayable: 1.5,
  bridge: 0.25, // keep tiles linking my two strongest numbers for later
};

const bitsOf = (m) => popcount(m);

function newEnds(ends, id, side) {
  if (!ends) return [TA[id], TB[id]];
  const e = ends[side];
  const other = TA[id] === e ? TB[id] : TA[id];
  return side === 0 ? [other, ends[1]] : [ends[0], other];
}

/** Score a single legal move for `seat` in state s (sim or real). Higher is better. */
export function scoreMove(s, seat, move, W = DEFAULT_W) {
  const id = move.id;
  const hand = s.hands[seat];
  const after = hand & ~(1 << id);
  if (after === 0) return W.goOut;
  const [nl, nr] = newEnds(s.ends, id, move.side);
  const played = s.played | (1 << id);
  const part = partnerOf(seat);
  const o1 = nextSeat(seat);
  const o2 = (seat + 3) & 3;
  let sc = W.pips * (PIPS[id] / 4);
  if (IS_DOUBLE[id]) {
    const d = TA[id];
    sc += W.double;
    // unseen = tiles of that number nobody has shown me (not played, not mine)
    const unseenD = bitsOf(HAS[d] & ~played & ~after);
    sc += W.doubleDeadly * (unseenD <= 2 ? 1 : 0);
  }
  const ends = [nl, nr];
  const mobMask = HAS[nl] | HAS[nr];
  const mob = bitsOf(after & mobMask);
  sc += W.mobility * mob;
  // distinct numbers left in hand
  let var_ = 0;
  for (let n = 0; n <= 6; n++) if (after & HAS[n]) var_++;
  sc += W.variety * var_;
  for (let k = 0; k < 2; k++) {
    const e = ends[k];
    if (k === 1 && nl === nr) break; // same number on both ends counts once
    const own = bitsOf(after & HAS[e]);
    sc += W.own * own;
    const unseen = bitsOf(HAS[e] & ~played & ~after);
    const bitE = 1 << e;
    if (s.voids[o1] & bitE) sc += W.oppVoid * 0.6;
    if (s.voids[o2] & bitE) sc += W.oppVoid * 0.6;
    if (s.voids[part] & bitE) sc -= W.partnerVoid;
    else if (unseen > 0) sc += W.partnerHelp * Math.min(unseen, 3) * ((s.voids[o1] | s.voids[o2]) & bitE ? 1.2 : 1) * 0.5;
    if (unseen === 0) sc += W.dead * (bitsOf(after) <= 3 ? 1 : -0.3); // block only when I'm nearly out
    else sc -= W.oppHelp * Math.min(unseen, 4) * 0.25 * (bitE & s.voids[o1] && bitE & s.voids[o2] ? 0 : 1);
  }
  // last tile planning: if I'd have exactly one tile left, reward it if it still matches an end
  if (bitsOf(after) === 1 && (after & mobMask)) sc += W.lastPlayable;
  return sc;
}

/** Pick the policy's move. eps>0 adds random exploration (used in rollouts / weak bots). */
export function policyMove(s, seat, rng, eps = 0, W = DEFAULT_W) {
  const moves = legalMoves(s, seat);
  if (moves.length === 1) return moves[0];
  if (eps > 0 && rng() < eps) return moves[rng.int(moves.length)];
  let best = moves[0];
  let bs = -Infinity;
  for (const m of moves) {
    const v = scoreMove(s, seat, m, W) + rng() * 1e-3;
    if (v > bs) {
      bs = v;
      best = m;
    }
  }
  return best;
}

/** Ranked moves with scores — used by the explainer. */
export function rankMoves(s, seat, W = DEFAULT_W) {
  return legalMoves(s, seat)
    .map((m) => ({ move: m, score: scoreMove(s, seat, m, W) }))
    .sort((a, b) => b.score - a.score);
}

export function randomMove(s, seat, rng) {
  const moves = legalMoves(s, seat);
  return moves[rng.int(moves.length)];
}
