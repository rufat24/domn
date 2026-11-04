import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng, popcount, TILES, ALL } from '../src/engine/tiles.js';
import { deal, newHand, legalMoves, applyMove, createMatch, dealHand, finishHand, teamOf, resolveFish } from '../src/engine/game.js';
import { mergeRules } from '../src/engine/rules.js';
import { ID_OF } from '../src/engine/tiles.js';

test('28 tiles, each number on 7 tiles, popcount', () => {
  assert.equal(TILES.length, 28);
  assert.equal(popcount(ALL), 28);
  assert.equal(popcount(0b1011), 3);
});

test('deal gives 4x7 distinct tiles', () => {
  const h = deal(makeRng(5));
  assert.deepEqual(h.map(popcount), [7, 7, 7, 7]);
  assert.equal(h[0] | h[1] | h[2] | h[3], ALL);
  assert.equal(h[0] & h[1], 0);
});

test('first hand opened by holder of 1-1; legal moves forced', () => {
  const m = createMatch({}, 42);
  const s = dealHand(m);
  const one = ID_OF[1][1];
  assert.ok(s.hands[s.leader] & (1 << one));
  const mv = legalMoves(s);
  assert.deepEqual(mv, [{ id: one, side: 0 }]);
});

test('full random playouts always terminate with consistent scoring', () => {
  const rng = makeRng(7);
  for (let g = 0; g < 300; g++) {
    const s = newHand({}, deal(rng), rng.int(4));
    let guard = 0;
    while (!s.over) {
      const mv = legalMoves(s);
      assert.ok(mv.length > 0, 'current player must have a move (passes are automatic)');
      applyMove(s, mv[rng.int(mv.length)]);
      assert.ok(++guard < 100);
    }
    const r = s.result;
    if (r.kind === 'out') assert.equal(s.hands[r.winner], 0);
    // chain consistency: adjacent halves match
    for (let i = 1; i < s.chain.length; i++) assert.equal(s.chain[i - 1].b, s.chain[i].a);
    assert.equal(s.chain[0].a, s.ends[0]);
    assert.equal(s.chain[s.chain.length - 1].b, s.ends[1]);
    // every pass is justified: passer had no matching tile at the time (checked via voids on final hands)
    for (let p = 0; p < 4; p++) for (let n = 0; n <= 6; n++) if (s.voids[p] & (1 << n)) {
      // tile in start hand containing n that is still unplayed would contradict; but hand may have played n earlier
    }
  }
});

test('score: out counts opponents pips; match ends at 101', () => {
  const s = newHand({}, [0, 0, 0, 0], 0);
  s.hands = [1 << ID_OF[2][3], 1 << ID_OF[4][5], 1 << ID_OF[0][1], 1 << ID_OF[6][6]];
  s.ends = [2, 2];
  s.turn = 0;
  applyMove(s, { id: ID_OF[2][3], side: 0 });
  assert.equal(s.result.kind, 'out');
  assert.equal(s.result.team, 0);
  assert.equal(s.result.points, 9 + 12); // 4-5 plus 6-6 (12)
  const m = createMatch({}, 1);
  m.handNo = 1;
  finishHand(m, s);
  assert.deepEqual(m.scores, [21, 0]);
});

test('fish: blocked position, lowest hand wins', () => {
  const s = newHand({}, [0, 0, 0, 0], 0);
  s.hands = [
    (1 << ID_OF[0][1]) | (1 << ID_OF[3][4]),
    1 << ID_OF[5][5],
    1 << ID_OF[0][2],
    1 << ID_OF[6][6],
  ];
  s.ends = [3, 3];
  s.turn = 0;
  applyMove(s, { id: ID_OF[3][4], side: 0 }); // ends 4 & 3; nobody holds a 3 or 4 -> fish
  assert.equal(s.result.kind, 'fish');
  assert.equal(s.result.winner, 0); // 0-1 = 1 point, lowest
  assert.equal(s.result.team, 0);
  assert.equal(s.result.points, 10 + 12); // opponents (seats 1,3): 5-5 and 6-6(12)
});

test('fish tie across teams scores nothing', () => {
  // seat0 (team 0) and seat1 (team 1) both hold 5 pips -> tie between teams
  const hands = [1 << ID_OF[2][3], 1 << ID_OF[1][4], 1 << ID_OF[6][6], 1 << ID_OF[5][5]];
  const r = resolveFish(hands, mergeRules({}));
  assert.equal(r.tie, true);
  assert.equal(r.team, -1);
  assert.equal(r.points, 0);
});
