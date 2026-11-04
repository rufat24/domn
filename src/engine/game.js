import { TILES, TA, TB, PIPS, HAS, ID_OF, ALL, IS_DOUBLE, maskToIds, popcount, makeRng, shuffle, numMask } from './tiles.js';
import { mergeRules } from './rules.js';

export const teamOf = (seat) => seat & 1; // seats 0,2 vs 1,3 ; partner sits opposite (diagonal)
export const partnerOf = (seat) => (seat + 2) & 3;
export const nextSeat = (seat) => (seat + 1) & 3; // clockwise: 0 bottom -> 1 left -> 2 top -> 3 right

export function pipValue(id, rules) {
  if (id === ID_OF[0][0]) return rules.blankBlank;
  if (id === ID_OF[6][6]) return rules.sixSix;
  return PIPS[id];
}
export function handPips(mask, rules) {
  let s = 0;
  for (let id = 0; id < 28; id++) if (mask & (1 << id)) s += pipValue(id, rules);
  return s;
}

export function deal(rng) {
  const ids = shuffle(Array.from({ length: 28 }, (_, i) => i), rng);
  const hands = [0, 0, 0, 0];
  for (let p = 0; p < 4; p++) for (let k = 0; k < 7; k++) hands[p] |= 1 << ids[p * 7 + k];
  return hands;
}

/** Create a fresh hand state. `leader` opens. `mustOpen` is a tile id the leader must open with (or null). */
export function newHand(rulesIn, hands, leader, mustOpen = null, record = true) {
  const rules = mergeRules(rulesIn);
  return {
    rules,
    hands: hands.slice(),
    startHands: hands.slice(),
    ends: null,
    chain: record ? [] : null, // left->right oriented: {id, a, b, player}
    log: record ? [] : null, // {type:'play'|'pass', player, id?, side?, ends?}
    turn: leader,
    leader,
    mustOpen,
    played: 0,
    voids: [0, 0, 0, 0],
    plays: [0, 0, 0, 0],
    over: false,
    result: null,
    lastTile: -1,
    lastPlayer: -1,
  };
}

export function cloneState(s, record = false) {
  return {
    rules: s.rules,
    hands: s.hands.slice(),
    startHands: s.startHands,
    ends: s.ends ? s.ends.slice() : null,
    chain: record && s.chain ? s.chain.map((c) => ({ ...c })) : null,
    log: record && s.log ? s.log.map((c) => ({ ...c })) : null,
    turn: s.turn,
    leader: s.leader,
    mustOpen: s.mustOpen,
    played: s.played,
    voids: s.voids.slice(),
    plays: s.plays.slice(),
    over: s.over,
    result: s.result,
    lastTile: s.lastTile,
    lastPlayer: s.lastPlayer,
  };
}

/** Bitmask of tiles in `hand` playable on the current ends. */
export function playableMask(hand, ends) {
  if (!ends) return hand;
  return hand & (HAS[ends[0]] | HAS[ends[1]]);
}

/** Legal moves for seat (default: current turn). move = {id, side}. side 0 = left end, 1 = right end. */
export function legalMoves(s, seat = s.turn) {
  const hand = s.hands[seat];
  const out = [];
  if (!s.ends) {
    if (s.mustOpen != null && hand & (1 << s.mustOpen)) return [{ id: s.mustOpen, side: 0 }];
    for (let id = 0; id < 28; id++) if (hand & (1 << id)) out.push({ id, side: 0 });
    return out;
  }
  const [l, r] = s.ends;
  for (let id = 0; id < 28; id++) {
    if (!(hand & (1 << id))) continue;
    const a = TA[id];
    const b = TB[id];
    if (a === l || b === l) out.push({ id, side: 0 });
    if ((a === r || b === r) && l !== r) out.push({ id, side: 1 });
  }
  return out;
}

export function anyMove(s) {
  if (!s.ends) return true;
  const m = HAS[s.ends[0]] | HAS[s.ends[1]];
  return (s.hands[0] | s.hands[1] | s.hands[2] | s.hands[3]) & m ? true : false;
}

/** Apply a move for the current player, then advance the turn (auto-passes recorded). Mutates s. */
export function applyMove(s, move) {
  const seat = s.turn;
  const { id, side } = move;
  if (!(s.hands[seat] & (1 << id))) throw new Error(`seat ${seat} does not hold tile ${id}`);
  const a = TA[id];
  const b = TB[id];
  if (!s.ends) {
    s.ends = [a, b];
    if (s.chain) s.chain.push({ id, a, b, player: seat });
  } else {
    const e = s.ends[side];
    if (a !== e && b !== e) throw new Error('illegal move');
    const other = a === e ? b : a;
    if (side === 0) {
      s.ends[0] = other;
      if (s.chain) s.chain.unshift({ id, a: other, b: e, player: seat });
    } else {
      s.ends[1] = other;
      if (s.chain) s.chain.push({ id, a: e, b: other, player: seat });
    }
  }
  s.hands[seat] &= ~(1 << id);
  s.played |= 1 << id;
  s.plays[seat]++;
  s.lastTile = id;
  s.lastPlayer = seat;
  if (s.log) s.log.push({ type: 'play', player: seat, id, side });
  if (s.hands[seat] === 0) return finish(s, 'out', seat);
  advance(s, seat);
  return s;
}

function advance(s, from) {
  if (!anyMove(s)) return finish(s, 'fish', from);
  let t = nextSeat(from);
  const m = HAS[s.ends[0]] | HAS[s.ends[1]];
  for (let i = 0; i < 4; i++) {
    if (s.hands[t] & m) {
      s.turn = t;
      return s;
    }
    // forced pass: this player has none of the end numbers
    s.voids[t] |= (1 << s.ends[0]) | (1 << s.ends[1]);
    if (s.log) s.log.push({ type: 'pass', player: t, ends: s.ends.slice() });
    t = nextSeat(t);
  }
  return finish(s, 'fish', from);
}

function roundScore(p, rules) {
  return rules.roundTo5 ? Math.round(p / 5) * 5 : p;
}

/** Pure scoring helpers (shared with the exact solver). */
export function resolveOut(hands, seat, lastTile, rules) {
  const hp = hands.map((h) => handPips(h, rules));
  let pts = hp[(seat + 1) & 3] + hp[(seat + 3) & 3];
  if (rules.outScoring === 'all-others') pts += hp[(seat + 2) & 3];
  if (lastTile === ID_OF[0][0]) pts += rules.outBonus00;
  return { kind: 'out', winner: seat, team: teamOf(seat), points: roundScore(pts, rules), pips: hp };
}

export function resolveFish(hands, rules) {
  const hp = hands.map((h) => handPips(h, rules));
  let min = Infinity;
  for (const v of hp) if (v < min) min = v;
  const seats = [0, 1, 2, 3].filter((i) => hp[i] === min);
  const teams = new Set(seats.map(teamOf));
  if (teams.size > 1) return { kind: 'fish', winner: -1, team: -1, points: 0, pips: hp, tie: true };
  const team = [...teams][0];
  const w = seats[0];
  const pts = rules.fishScoring === 'all' ? hp[0] + hp[1] + hp[2] + hp[3] : hp[(w + 1) & 3] + hp[(w + 3) & 3];
  return { kind: 'fish', winner: w, team, points: roundScore(pts, rules), pips: hp };
}

function finish(s, kind, seat) {
  s.over = true;
  s.result = kind === 'out' ? resolveOut(s.hands, seat, s.lastTile, s.rules) : resolveFish(s.hands, s.rules);
  s.turn = -1;
  return s;
}

// ---------------------------------------------------------------- match

export function createMatch(rulesIn = {}, seed = Date.now() >>> 0) {
  const rules = mergeRules(rulesIn);
  const m = {
    rules,
    seed,
    rng: makeRng(seed),
    scores: [0, 0],
    handNo: 0,
    leaderNext: null,
    history: [], // finished hand records
    over: false,
    loserTeam: null,
    winnerTeam: null,
  };
  return m;
}

export function dealHand(match, handsOverride = null) {
  const rules = match.rules;
  const hands = handsOverride || deal(match.rng);
  let leader;
  let mustOpen = null;
  if (match.handNo === 0 || match.leaderNext == null) {
    const t = rules.firstTile === '6-6' ? ID_OF[6][6] : ID_OF[1][1];
    leader = hands.findIndex((h) => h & (1 << t));
    mustOpen = t;
  } else {
    leader = match.leaderNext;
  }
  match.handNo++;
  return newHand(rules, hands, leader, mustOpen, true);
}

/** Records the finished hand into the match and sets up the next leader. */
export function finishHand(match, state) {
  const r = state.result;
  const rules = match.rules;
  let scoring = -1;
  if (r.team >= 0 && r.points > 0) scoring = rules.scoreMode === 'winner' ? r.team : 1 - r.team;
  if (scoring >= 0) match.scores[scoring] += r.points;
  match.history.push({ handNo: match.handNo, result: r, scoring, scores: match.scores.slice(), leader: state.leader });
  if (r.kind === 'out') match.leaderNext = r.winner;
  else if (r.winner >= 0 && rules.nextLeaderAfterFish === 'winner') match.leaderNext = r.winner;
  else match.leaderNext = state.leader;
  const t = rules.target;
  if (rules.scoreMode === 'winner') {
    for (const team of [0, 1]) if (match.scores[team] >= t && !match.over) { match.over = true; match.winnerTeam = team; }
    if (match.over && match.scores[0] >= t && match.scores[1] >= t) match.winnerTeam = match.scores[0] >= match.scores[1] ? 0 : 1;
  } else {
    for (const team of [0, 1]) if (match.scores[team] >= t && !match.over) { match.over = true; match.loserTeam = team; match.winnerTeam = 1 - team; }
  }
  if (match.over) match.shutout = match.scores[1 - match.winnerTeam] === 0;
  return match;
}

export { TILES, TA, TB, PIPS, HAS, ID_OF, ALL, IS_DOUBLE, maskToIds, popcount, numMask };
