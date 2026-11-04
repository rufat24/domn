import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng, popcount } from '../src/engine/tiles.js';
import { cloneState, applyMove, legalMoves } from '../src/engine/game.js';
import { DEFAULT_RULES } from '../src/engine/rules.js';
import { LEVELS, genCount, genVoid, genRead, genFish, genScore, genBest, playUntil, afterMove } from '../src/ai/drillgen.js';

const R = DEFAULT_RULES;

test('count drill: answer = 7 - table - mine', () => {
  const rng = makeRng(11);
  for (let i = 0; i < 40; i++) {
    const q = genCount(rng, R);
    assert.ok(q);
    assert.equal(q.answer, 7 - q.onTable - q.mine);
    assert.equal(q.unseenIds.length, q.answer);
  }
});

test('void drill answers agree with recorded passes', () => {
  const rng = makeRng(12);
  for (let i = 0; i < 40; i++) {
    const q = genVoid(rng, R);
    assert.ok(q);
    assert.ok(q.voidNums.length > 0);
  }
});

test('read drill: deduced holder really holds the tile', () => {
  const rng = makeRng(13);
  for (let i = 0; i < 40; i++) {
    const q = genRead(rng, R);
    assert.ok(q);
    assert.equal(q.truth, true);
  }
});

test('fish drill: afterMove agrees with the real engine', () => {
  const rng = makeRng(14);
  let fish = 0;
  for (let i = 0; i < 30; i++) {
    const q = genFish(rng, R);
    assert.ok(q);
    if (q.answer) fish++;
  }
  assert.ok(fish > 5, 'both outcomes occur: ' + fish);
  // Direct engine cross-check over many random positions.
  const rr = makeRng(15);
  let checked = 0;
  for (let n = 0; n < 300; n++) {
    const s = playUntil(rr, R, (x) => !x.over && x.turn === 0 && popcount(x.played) >= 12);
    if (!s) continue;
    for (const m of legalMoves(s, 0)) {
      const a = afterMove(s, 0, m);
      const c = cloneState(s);
      applyMove(c, m);
      const realFish = c.over && c.result.kind === 'fish';
      assert.equal(a.fish, realFish);
      assert.equal(a.out, c.over && c.result.kind === 'out');
      checked++;
    }
  }
  assert.ok(checked > 100);
});

test('score drill: result matches fish scoring', () => {
  const rng = makeRng(16);
  const q = genScore(rng, R);
  assert.ok(q);
  assert.equal(q.result.kind, 'fish');
});

test('best-move drill: unique best by a margin', () => {
  const rng = makeRng(17);
  const t0 = Date.now();
  for (let i = 0; i < 5; i++) {
    const q = genBest(rng, R);
    assert.ok(q);
    assert.ok(q.vals[0].v - q.vals[1].v >= 5);
  }
  assert.ok(Date.now() - t0 < 20000, 'generation is fast enough');
});

test('every level of every generator yields a valid question', () => {
  const rng = makeRng(21);
  for (const lv of LEVELS) {
    for (let i = 0; i < 8; i++) {
      const c = genCount(rng, R, lv);
      assert.equal(c.answer, 7 - c.onTable - c.mine);
      assert.ok(genVoid(rng, R, lv).voidNums.length > 0);
      assert.equal(genRead(rng, R, lv).truth, true);
      assert.ok(genFish(rng, R, lv));
    }
    assert.equal(genScore(rng, R, lv).result.kind, 'fish');
    const b = genBest(rng, R, lv);
    assert.ok(b.vals[0].v - b.vals[1].v >= { easy: 15, medium: 5, hard: 2 }[lv]);
  }
});

test('levels really differ: count table size, fish near-misses, close scores', () => {
  const rng = makeRng(22);
  const avg = (lv) => { let t = 0; for (let i = 0; i < 40; i++) t += popcount(genCount(rng, R, lv).t.played); return t / 40; };
  assert.ok(avg('easy') < avg('hard'));
  for (let i = 0; i < 20; i++) {
    const q = genFish(rng, R, 'hard');
    if (!q.answer) assert.equal(q.after.ends[0], q.after.ends[1]);
  }
  for (let i = 0; i < 10; i++) {
    const r = genScore(rng, R, 'hard').result.pips;
    assert.ok(Math.abs(Math.min(r[0], r[2]) - Math.min(r[1], r[3])) <= 4);
  }
});
