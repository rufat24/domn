// Seeded self-play benchmark: level A (team 0/2) vs level B (team 1/3) on identical deals, sides swapped.
// usage: node scripts/benchmark.mjs [A=expert] [B=normal] [deals=100] [seed=1]
import { makeRng } from '../src/engine/tiles.js';
import { deal, newHand, applyMove, ID_OF, teamOf } from '../src/engine/game.js';
import { makeView } from '../src/ai/belief.js';
import { chooseMove, LEVELS } from '../src/ai/pimc.js';
import { DEFAULT_RULES } from '../src/engine/rules.js';

const [A = 'expert', B = 'normal', N = '100', SEED = '1'] = process.argv.slice(2);
const deals = +N;
const rng = makeRng(+SEED);
const fast = process.env.FAST ? { budgetMs: 40, maxWorlds: 16 } : {};

function playHand(hands, levels, seed) {
  const t = ID_OF[1][1];
  const leader = hands.findIndex((h) => h & (1 << t));
  const s = newHand(DEFAULT_RULES, hands, leader, t, false);
  const r = makeRng(seed);
  while (!s.over) {
    const lv = levels[s.turn];
    const res = chooseMove(makeView(s, s.turn), { level: lv, rng: r, ...fast });
    applyMove(s, res.move);
  }
  return s.result;
}

let swingA = 0;
let winsA = 0;
let winsB = 0;
let n = 0;
const t0 = Date.now();
for (let d = 0; d < deals; d++) {
  const hands = deal(rng);
  for (const flip of [0, 1]) {
    // flip=0: A sits seats 0/2 ; flip=1: A sits seats 1/3
    const levels = flip ? [B, A, B, A] : [A, B, A, B];
    const res = playHand(hands, levels, d * 2 + flip + 1000);
    const aTeam = flip ? 1 : 0;
    const u = res.team < 0 ? 0 : res.team === aTeam ? res.points : -res.points;
    swingA += u;
    if (res.team === aTeam) winsA++;
    else if (res.team >= 0) winsB++;
    n++;
  }
}
console.log(`${A} vs ${B}: ${n} hands, A won ${winsA}, B won ${winsB}, avg point swing for A: ${(swingA / n).toFixed(2)} per hand  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
