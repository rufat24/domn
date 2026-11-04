// Perfect-information Monte Carlo move chooser.
// Samples worlds consistent with what the seat has seen (own hand, played tiles, passes),
// then plays each candidate move out in every world and averages the team-point swing.
import { popcount, makeRng } from '../engine/tiles.js';
import { legalMoves, applyMove, cloneState, teamOf } from '../engine/game.js';
import { policyMove, DEFAULT_W } from './policy.js';
import { sampleWorld } from './belief.js';
import { solvePosition } from './solver.js';

export const LEVELS = {
  easy: { name: 'Новичок', mode: 'policy', eps: 0.35 },
  normal: { name: 'Игрок', mode: 'policy', eps: 0.04 },
  hard: { name: 'Сильный', mode: 'pimc', budgetMs: 220, maxWorlds: 48, rollouts: 1, solveBelow: 8, rolloutEps: 0.12 },
  expert: { name: 'Эксперт', mode: 'pimc', budgetMs: 650, maxWorlds: 220, rollouts: 2, solveBelow: 11, rolloutEps: 0.08 },
};

/** Build a perfect-info simulation state from a seat's view and one sampled world. */
export function simFromView(view, hands) {
  return {
    rules: view.rules,
    hands: hands.slice(),
    startHands: hands.slice(),
    ends: view.ends ? view.ends.slice() : null,
    chain: null,
    log: null,
    turn: view.turn,
    leader: view.turn,
    mustOpen: view.mustOpen,
    played: view.played,
    voids: view.voids.slice(),
    plays: view.plays.slice(),
    over: false,
    result: null,
    lastTile: -1,
    lastPlayer: -1,
  };
}

const utility = (res, team) => (res.team < 0 ? 0 : res.team === team ? res.points : -res.points);

function rollout(s, rng, eps, W) {
  while (!s.over) applyMove(s, policyMove(s, s.turn, rng, eps, W));
  return s.result;
}

const remaining = (s) => popcount(s.hands[0]) + popcount(s.hands[1]) + popcount(s.hands[2]) + popcount(s.hands[3]);

/**
 * Choose a move for view.seat (it must be that seat's turn).
 * returns { move, evals:[{move, ev, n}], worlds, ms, exact }
 */
export function chooseMove(view, opts = {}) {
  const level = typeof opts.level === 'string' ? LEVELS[opts.level] : opts.level || LEVELS.expert;
  const cfg = { ...level, ...opts };
  const seat = view.seat;
  const team = teamOf(seat);
  const W = cfg.W || DEFAULT_W;
  const rng = cfg.rng || makeRng((Math.random() * 2 ** 32) >>> 0);
  const t0 = now();
  const probe = simFromView(view, [0, 0, 0, 0].map((_, q) => (q === seat ? view.hand : 0)));
  const moves = legalMoves(probe, seat);
  if (moves.length === 1) return { move: moves[0], evals: [{ move: moves[0], ev: 0, n: 0 }], worlds: 0, ms: 0, exact: false };

  if (cfg.mode === 'policy') {
    const m = policyMove(probe, seat, rng, cfg.eps || 0, W);
    return { move: m, evals: moves.map((mv) => ({ move: mv, ev: 0, n: 0 })), worlds: 0, ms: now() - t0, exact: false };
  }

  const sum = new Float64Array(moves.length);
  const sumSq = new Float64Array(moves.length);
  let worlds = 0;
  let exactCount = 0;
  const maxWorlds = cfg.maxWorlds || 100;
  const budget = cfg.budgetMs || 300;
  while (worlds < maxWorlds && (worlds < 6 || now() - t0 < budget)) {
    const hands = sampleWorld(view, rng);
    if (!hands) break;
    const seedBase = (rng() * 2 ** 32) >>> 0;
    worlds++;
    for (let mi = 0; mi < moves.length; mi++) {
      const base = simFromView(view, hands);
      applyMove(base, moves[mi]);
      let v;
      if (base.over) v = utility(base.result, team);
      else {
        let solved = null;
        if (remaining(base) <= cfg.solveBelow) {
          solved = solvePosition(base.hands, base.ends[0], base.ends[1], base.turn, base.rules, team, cfg.nodeLimit || 60000);
        }
        if (solved !== null) {
          v = solved;
          exactCount++;
        } else {
          let acc = 0;
          const reps = cfg.rollouts || 1;
          for (let k = 0; k < reps; k++) {
            const sim = cloneState(base);
            // common random numbers: the same stream for every candidate move in this world
            acc += utility(rollout(sim, makeRng(seedBase + k * 7919), cfg.rolloutEps ?? 0.1, W), team);
          }
          v = acc / reps;
        }
      }
      sum[mi] += v;
      sumSq[mi] += v * v;
    }
  }
  if (!worlds) return { move: policyMove(probe, seat, rng, 0, W), evals: [], worlds: 0, ms: now() - t0, exact: false };
  const evals = moves.map((move, i) => ({ move, ev: sum[i] / worlds, n: worlds }));
  let best = 0;
  for (let i = 1; i < evals.length; i++) if (evals[i].ev > evals[best].ev + 1e-9) best = i;
  return { move: evals[best].move, evals, worlds, ms: now() - t0, exact: exactCount > 0 };
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
