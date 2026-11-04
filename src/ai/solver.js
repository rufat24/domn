// Exact (perfect-information) solver for late-game positions. Team-zero-sum alpha-beta with a transposition table.
import { HAS, TA, TB, PIPS } from '../engine/tiles.js';
import { resolveOut, resolveFish, teamOf } from '../engine/game.js';

const sign = (res, team) => (res.team < 0 ? 0 : res.team === team ? res.points : -res.points);

/**
 * Value of a position for team `me` (higher = better) with optimal play from all four seats.
 * state: {hands:[4], l, r, turn}  (turn has at least one legal move)
 * returns number, or null if nodeLimit exceeded.
 */
export function solvePosition(hands, l, r, turn, rules, me, nodeLimit = 200000) {
  const ctx = { rules, me, nodes: 0, limit: nodeLimit, tt: new Map(), aborted: false };
  const v = search(ctx, hands.slice(), l, r, turn, -1e9, 1e9, -1);
  return ctx.aborted ? null : v;
}

function nextMover(hands, l, r, from) {
  const m = HAS[l] | HAS[r];
  for (let k = 1; k <= 4; k++) {
    const t = (from + k) & 3;
    if (hands[t] & m) return t;
  }
  return -1;
}

function search(ctx, hands, l, r, turn, alpha, beta, lastTile) {
  if (ctx.aborted) return 0;
  if (++ctx.nodes > ctx.limit) {
    ctx.aborted = true;
    return 0;
  }
  const key = hands[0] + ',' + hands[1] + ',' + hands[2] + ',' + hands[3] + ',' + l + ',' + r + ',' + turn;
  const hit = ctx.tt.get(key);
  if (hit !== undefined) return hit;
  const h = hands[turn];
  const maxing = teamOf(turn) === ctx.me;
  let best = maxing ? -1e9 : 1e9;
  // collect moves, heavy tiles first for better pruning
  const moves = [];
  for (let id = 0; id < 28; id++) {
    if (!(h & (1 << id))) continue;
    const a = TA[id];
    const b = TB[id];
    if (a === l || b === l) moves.push(id * 2);
    if ((a === r || b === r) && l !== r) moves.push(id * 2 + 1);
  }
  moves.sort((x, y) => PIPS[y >> 1] - PIPS[x >> 1]);
  const a0 = alpha;
  const b0 = beta;
  for (const mv of moves) {
    const id = mv >> 1;
    const side = mv & 1;
    const e = side === 0 ? l : r;
    const other = TA[id] === e ? TB[id] : TA[id];
    const nl = side === 0 ? other : l;
    const nr = side === 0 ? r : other;
    hands[turn] = h & ~(1 << id);
    let v;
    if (hands[turn] === 0) {
      v = sign(resolveOut(hands, turn, id, ctx.rules), ctx.me);
    } else {
      const nt = nextMover(hands, nl, nr, turn);
      v = nt < 0 ? sign(resolveFish(hands, ctx.rules), ctx.me) : search(ctx, hands, nl, nr, nt, alpha, beta, id);
    }
    hands[turn] = h;
    if (ctx.aborted) return 0;
    if (maxing) {
      if (v > best) best = v;
      if (best > alpha) alpha = best;
    } else {
      if (v < best) best = v;
      if (best < beta) beta = best;
    }
    if (alpha >= beta) break;
  }
  if (best > a0 && best < b0) ctx.tt.set(key, best); // exact only
  return best;
}
