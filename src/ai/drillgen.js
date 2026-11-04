// Drill generators. Every answer here is DETERMINISTIC (derived from the rules / exact search), never a Monte-Carlo label.
// Pure logic, no DOM — unit-tested in test/drills.test.js.
import { TA, TB, HAS, ID_OF, ALL, popcount, numMask, maskToIds } from '../engine/tiles.js';
import { deal, newHand, applyMove, cloneState, legalMoves, teamOf } from '../engine/game.js';
import { mergeRules } from '../engine/rules.js';
import { policyMove } from './policy.js';
import { makeView, possibleHolders } from './belief.js';
import { solvePosition } from './solver.js';
import { resolveOutValue } from './drillvalue.js';

export const SEAT_NAMES = ['Вы', 'Соперник слева', 'Партнёр', 'Соперник справа'];

const handCount = (s) => popcount(s.hands[0]) + popcount(s.hands[1]) + popcount(s.hands[2]) + popcount(s.hands[3]);

/** Start a fresh hand (1-1 holder opens) and let policy players play on until stop(s) is true. null if the hand ended first. */
export function playUntil(rng, rulesIn, stop, eps = 0.08) {
  const rules = mergeRules(rulesIn);
  const hands = deal(rng);
  const one = ID_OF[1][1];
  const leader = hands.findIndex((h) => h & (1 << one));
  const s = newHand(rules, hands, leader, one);
  let guard = 0;
  while (!s.over && guard++ < 80) {
    if (stop(s)) return s;
    applyMove(s, policyMove(s, s.turn, rng, eps));
  }
  return stop(s) ? s : null;
}

function retry(maker, tries = 400) {
  for (let i = 0; i < tries; i++) {
    const q = maker();
    if (q) return q;
  }
  return null;
}

/** Everything the UI needs to draw the table from seat 0's point of view. */
function table(s) {
  return {
    chain: s.chain.map((c) => ({ a: c.a, b: c.b, player: c.player })),
    ends: s.ends ? s.ends.slice() : null,
    hand: s.hands[0],
    counts: s.hands.map((h) => popcount(h)),
    played: s.played,
    voids: s.voids.slice(),
    passes: s.log.filter((e) => e.type === 'pass').map((e) => ({ player: e.player, ends: e.ends })),
  };
}

/** 1) How many tiles with number n are still unseen (not on the table, not in your hand)? */
export function genCount(rng, rules) {
  return retry(() => {
    const lo = 6 + rng.int(10);
    const s = playUntil(rng, rules, (x) => popcount(x.played) >= lo);
    if (!s) return null;
    const n = rng.int(7);
    const unseen = HAS[n] & ~s.played & ~s.hands[0];
    return { kind: 'count', t: table(s), n, answer: popcount(unseen), mine: popcount(HAS[n] & s.hands[0]), onTable: popcount(HAS[n] & s.played), unseenIds: maskToIds(unseen) };
  });
}

/** 2) Can seat q still hold tile T, given that q passed? */
export function genVoid(rng, rules) {
  return retry(() => {
    const s = playUntil(rng, rules, (x) => popcount(x.played) >= 8 && (x.voids[1] | x.voids[2] | x.voids[3]) !== 0);
    if (!s) return null;
    const qs = [1, 2, 3].filter((q) => s.voids[q]);
    const q = qs[rng.int(qs.length)];
    const unseen = maskToIds(ALL & ~s.played & ~s.hands[0]);
    const wantNo = rng() < 0.5;
    const pool = unseen.filter((id) => (!!(s.voids[q] & numMask(id)) === wantNo));
    if (!pool.length) return null;
    const id = pool[rng.int(pool.length)];
    const can = !(s.voids[q] & numMask(id));
    return { kind: 'void', t: table(s), q, id, answer: can, voidNums: [0, 1, 2, 3, 4, 5, 6].filter((n) => s.voids[q] & (1 << n)) };
  });
}

/** 3) Which seat is the only one that can hold tile T? (pure deduction from passes) */
export function genRead(rng, rules) {
  return retry(() => {
    const lo = 12 + rng.int(8);
    const s = playUntil(rng, rules, (x) => popcount(x.played) >= lo);
    if (!s) return null;
    const view = makeView(s, 0);
    const { allowed } = possibleHolders(view);
    const unseen = maskToIds(ALL & ~s.played & ~s.hands[0]);
    const cands = [];
    for (const id of unseen) {
      const seats = [1, 2, 3].filter((q) => allowed[q] & (1 << id));
      if (seats.length === 1) cands.push({ id, seat: seats[0] });
    }
    if (!cands.length) return null;
    const c = cands[rng.int(cands.length)];
    const why = [1, 2, 3].filter((q) => q !== c.seat).map((q) => ({ q, nums: [TA[c.id], TB[c.id]].filter((n, i, a) => a.indexOf(n) === i && s.voids[q] & (1 << n)) }));
    return { kind: 'read', t: table(s), id: c.id, answer: c.seat, why, truth: s.hands[c.seat] & (1 << c.id) ? true : false };
  });
}

/** Where do the ends stand after `move`, and is it a fish? Pure bookkeeping from the mover's own view. */
export function afterMove(s, seat, move) {
  const e = s.ends[move.side];
  const other = TA[move.id] === e ? TB[move.id] : TA[move.id];
  const nl = move.side === 0 ? other : s.ends[0];
  const nr = move.side === 0 ? s.ends[1] : other;
  const rest = ALL & ~(s.played | (1 << move.id)); // everything not on the table: other hands + my remaining tiles
  const left = popcount(HAS[nl] & rest);
  const right = nl === nr ? left : popcount(HAS[nr] & rest);
  const out = (s.hands[seat] & ~(1 << move.id)) === 0;
  return { ends: [nl, nr], left, right, fish: !out && left === 0 && right === 0, out };
}

/** 4) After your move: fish (nobody can play) or does the game go on? */
export function genFish(rng, rules) {
  const wantFish = rng() < 0.5;
  const found = (tight) => {
    for (let r = 0; r < 500; r++) {
      let cand = null;
      const s = playUntil(rng, rules, (x) => {
        if (x.over || x.turn !== 0 || popcount(x.played) < 10 || popcount(x.hands[0]) < 2) return false;
        const opts = [];
        for (const m of legalMoves(x, 0)) {
          const a = afterMove(x, 0, m);
          if (a.fish === wantFish && (wantFish || !tight || a.left + a.right <= 2)) opts.push({ m, a });
        }
        if (!opts.length) return false;
        cand = opts[rng.int(opts.length)];
        return true;
      });
      if (s && cand) return { kind: 'fish', t: table(s), move: cand.m, after: cand.a, answer: cand.a.fish };
    }
    return null;
  };
  return found(true) || found(false);
}

/** 5) Blocked game: whose pair wins and how many points? */
export function genScore(rng, rules) {
  return retry(() => {
    const hands = deal(rng);
    const one = ID_OF[1][1];
    const s = newHand(mergeRules(rules), hands, hands.findIndex((h) => h & (1 << one)), one);
    let g = 0;
    while (!s.over && g++ < 80) applyMove(s, policyMove(s, s.turn, rng, 0.08));
    if (!s.over || s.result.kind !== 'fish') return null;
    return { kind: 'score', hands: s.hands.slice(), ends: s.ends.slice(), chain: s.chain.map((c) => ({ a: c.a, b: c.b, player: c.player })), result: s.result, rules: s.rules };
  }, 2000);
}

/** 6) All hands open, <= 8 tiles: which move is best (exact search)? */
export function genBest(rng, rules) {
  return retry(() => {
    const s = playUntil(rng, rules, (x) => !x.over && x.turn === 0 && handCount(x) <= 8 && handCount(x) >= 6 && legalMoves(x, 0).length >= 2, 0.05);
    if (!s) return null;
    const vals = [];
    for (const m of legalMoves(s, 0)) {
      const c = cloneState(s);
      applyMove(c, m);
      let v;
      if (c.over) v = resolveOutValue(c.result, 0);
      else {
        v = solvePosition(c.hands, c.ends[0], c.ends[1], c.turn, c.rules, 0, 400000);
        if (v == null) return null;
      }
      vals.push({ move: m, v });
    }
    vals.sort((a, b) => b.v - a.v);
    if (vals[0].v - vals[1].v < 5) return null;
    return { kind: 'best', t: table(s), hands: s.hands.slice(), ends: s.ends.slice(), vals, answer: vals[0].move };
  }, 600);
}

export { teamOf };
