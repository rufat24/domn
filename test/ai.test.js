import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng, numMask, popcount, maskToIds, ALL } from '../src/engine/tiles.js';
import { deal, newHand, applyMove, legalMoves, cloneState, teamOf, ID_OF } from '../src/engine/game.js';
import { sampleWorld, makeView } from '../src/ai/belief.js';
import { policyMove } from '../src/ai/policy.js';
import { solvePosition } from '../src/ai/solver.js';
import { chooseMove, simFromView } from '../src/ai/pimc.js';
import { DEFAULT_RULES } from '../src/engine/rules.js';

function startState(seed) {
  const rng = makeRng(seed);
  const hands = deal(rng);
  const t = ID_OF[1][1];
  const leader = hands.findIndex((h) => h & (1 << t));
  return { s: newHand(DEFAULT_RULES, hands, leader, t, true), rng };
}

test('sampleWorld respects voids, sizes and the viewer hand', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { s, rng } = startState(seed);
    const steps = 4 + (seed % 12);
    for (let i = 0; i < steps && !s.over; i++) applyMove(s, policyMove(s, s.turn, rng, 0.3));
    if (s.over) continue;
    for (const seat of [0, 1, 2, 3]) {
      const view = makeView(s, seat);
      for (let k = 0; k < 5; k++) {
        const w = sampleWorld(view, rng);
        assert.ok(w, 'world sampled');
        assert.equal(w[seat], s.hands[seat]);
        let all = 0;
        for (let q = 0; q < 4; q++) {
          assert.equal(popcount(w[q]), popcount(s.hands[q]), 'hand size');
          assert.equal(all & w[q], 0, 'disjoint');
          all |= w[q];
          for (const id of maskToIds(w[q])) assert.equal(s.voids[q] & numMask(id), 0, 'respects void');
        }
        assert.equal(all, ALL & ~s.played);
      }
    }
  }
});

// brute force minimax (independent of the solver's pruning/TT)
function brute(s, team) {
  if (s.over) return s.result.team < 0 ? 0 : s.result.team === team ? s.result.points : -s.result.points;
  const maxing = teamOf(s.turn) === team;
  let best = maxing ? -1e9 : 1e9;
  for (const m of legalMoves(s)) {
    const c = cloneState(s);
    applyMove(c, m);
    const v = brute(c, team);
    best = maxing ? Math.max(best, v) : Math.min(best, v);
  }
  return best;
}

test('solver matches brute force on small endgames', () => {
  let checked = 0;
  for (let seed = 1; seed <= 400 && checked < 25; seed++) {
    const { s, rng } = startState(seed);
    while (!s.over && popcount(s.hands[0]) + popcount(s.hands[1]) + popcount(s.hands[2]) + popcount(s.hands[3]) > 9) applyMove(s, policyMove(s, s.turn, rng, 0.3));
    if (s.over) continue;
    for (const team of [0, 1]) {
      const v = solvePosition(s.hands, s.ends[0], s.ends[1], s.turn, s.rules, team, 5e6);
      assert.equal(v, brute(s, team), `seed ${seed} team ${team}`);
    }
    checked++;
  }
  assert.ok(checked >= 10);
});

test('chooseMove returns legal moves at every level over full hands', () => {
  for (const level of ['easy', 'normal', 'hard', 'expert']) {
    const { s, rng } = startState(77);
    const fast = { budgetMs: 15, maxWorlds: 8 };
    let guard = 0;
    while (!s.over && guard++ < 100) {
      const view = makeView(s, s.turn);
      const r = chooseMove(view, { level, rng, ...fast });
      const legal = legalMoves(s);
      assert.ok(legal.some((m) => m.id === r.move.id && m.side === r.move.side), 'legal');
      applyMove(s, r.move);
    }
    assert.ok(s.over);
  }
});

test('rollout policy never reads other hands: policy depends only on own hand + public info', () => {
  const { s, rng } = startState(5);
  for (let i = 0; i < 6; i++) applyMove(s, policyMove(s, s.turn, rng, 0.2));
  const seat = s.turn;
  const m1 = policyMove(s, seat, makeRng(1), 0);
  // permute the other hands (keeping sizes and voids irrelevant) -> same decision
  const c = cloneState(s);
  const others = [0, 1, 2, 3].filter((q) => q !== seat);
  const hs = others.map((q) => c.hands[q]);
  const sizes = others.map((q) => popcount(c.hands[q]));
  const pool = hs.reduce((a, b) => a | b, 0);
  const ids = maskToIds(pool).reverse();
  let k = 0;
  others.forEach((q, i) => {
    c.hands[q] = 0;
    for (let j = 0; j < sizes[i]; j++) c.hands[q] |= 1 << ids[k++];
  });
  assert.deepEqual(policyMove(c, seat, makeRng(1), 0), m1);
});
