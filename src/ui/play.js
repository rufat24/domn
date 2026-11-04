// The playable table: you (seat 0, bottom) + partner (top, diagonal) vs two AI opponents (left/right).
import { createMatch, dealHand, finishHand, applyMove, legalMoves, teamOf } from '../engine/game.js';
import { TILES, TA, TB, PIPS, popcount, maskToIds, tileName } from '../engine/tiles.js';
import { handPips } from '../engine/game.js';
import { makeView } from '../ai/belief.js';
import { LEVELS } from '../ai/pimc.js';
import { aiChoose, aiProbs } from '../ai/client.js';
import { explainChoice } from '../ai/explain.js';
import { el, tileById, tileBack } from './tile.js';
import { renderBoard } from './board.js';
import { renderTracker } from './tracker.js';
import { load, save } from './storage.js';

const NAMES = ['Вы', 'Слева', 'Партнёр', 'Справа'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function mountPlay(root, settings) {
  const G = { match: null, s: null, snaps: [], busy: false, hint: null, pendingTile: null, logIdx: 0, token: 0, probs: null, stats: load('stats', { matches: 0, wins: 0, hands: 0, hints: 0 }) };

  root.innerHTML = `
    <div class="scorebar" id="scorebar"></div>
    <div class="table" id="table">
      <div class="seat top" id="seat2"></div>
      <div class="seat left" id="seat1"></div>
      <div class="board" id="board"></div>
      <div class="seat right" id="seat3"></div>
      <div class="seat me" id="seat0"></div>
    </div>
    <div class="toast" id="toast" aria-live="polite"></div>
    <div class="actions" id="actions"></div>
    <div class="panel hidden" id="hintbox"></div>
    <div class="panel hidden" id="resultbox"></div>
    <div class="panel hidden" id="trackerbox"></div>
  `;
  const $ = (id) => root.querySelector('#' + id);

  // ----------------------------------------------------------------- flow
  function newMatch() {
    G.token++;
    G.match = createMatch(settings.get().rules, (Math.random() * 2 ** 32) >>> 0);
    startHand();
  }

  function startHand() {
    G.token++;
    G.s = dealHand(G.match);
    G.snaps = [];
    G.hint = null;
    G.logIdx = 0;
    G.probs = null;
    $('resultbox').classList.add('hidden');
    $('hintbox').classList.add('hidden');
    const lead = G.s.leader;
    say(`Раздача ${G.match.handNo}. Открывает: ${NAMES[lead].toLowerCase()}${G.s.mustOpen != null ? ` (дубль ${tileName(G.s.mustOpen)})` : ''}.`);
    render();
    loop();
  }

  async function loop() {
    const tok = G.token;
    while (tok === G.token) {
      const s = G.s;
      if (s.over) return endHand();
      if (s.turn === 0) {
        render();
        refreshTracker();
        return;
      }
      G.busy = true;
      render();
      const view = makeView(s, s.turn);
      const [res] = await Promise.all([aiChoose(view, settings.get().level), sleep(settings.get().speed)]);
      if (tok !== G.token) return;
      doMove(res.move);
    }
  }

  function doMove(move) {
    const s = G.s;
    const who = s.turn;
    applyMove(s, move);
    announce(who, move);
    G.busy = false;
    render();
  }

  function announce(who, move) {
    const s = G.s;
    const msgs = [];
    const first = G.logIdx;
    for (let i = first; i < s.log.length; i++) {
      const e = s.log[i];
      if (e.type === 'play') msgs.push(`${NAMES[e.player]} ходит ${tileName(e.id)}`);
      else msgs.push(`${NAMES[e.player]} пасует — нет ${e.ends[0] === e.ends[1] ? e.ends[0] : e.ends[0] + ' и ' + e.ends[1]}`);
    }
    G.logIdx = s.log.length;
    if (msgs.length) say(msgs.join(' · '), msgs.some((m) => m.includes('пасует')));
  }

  function humanPlay(move) {
    if (G.s.turn !== 0 || G.s.over) return;
    const view = makeView(G.s, 0);
    if (legalMoves(G.s, 0).length > 1) G.snaps.push({ view, move });
    G.pendingTile = null;
    G.hint = null;
    $('hintbox').classList.add('hidden');
    doMove(move);
    loop();
  }

  async function endHand() {
    const s = G.s;
    const r = s.result;
    finishHand(G.match, s);
    G.stats.hands++;
    if (G.match.over) {
      G.stats.matches++;
      if (G.match.winnerTeam === 0) G.stats.wins++;
    }
    save('stats', G.stats);
    render();
    showResult();
  }

  // ----------------------------------------------------------------- render
  function say(text, warn = false) {
    const t = $('toast');
    t.textContent = text;
    t.classList.toggle('warn', warn);
  }

  function render() {
    const s = G.s;
    if (!s) return;
    const m = G.match;
    const sb = $('scorebar');
    sb.replaceChildren();
    const lossMode = m.rules.scoreMode === 'loser';
    sb.append(
      scoreCell('Мы (вы + партнёр)', m.scores[0], 'us'),
      el('div', 'goal', `${lossMode ? 'до козла' : 'до'} ${m.rules.target} · раздача ${m.handNo}`),
      scoreCell('Они', m.scores[1], 'them'),
    );

    for (const q of [1, 2, 3]) renderSeat(q);
    renderMe();
    const choose = G.pendingTile != null ? pendingChooser() : null;
    renderBoard($('board'), s, { choose });
    renderActions();
  }

  const scoreCell = (label, v, cls) => {
    const d = el('div', 'score ' + cls);
    d.append(el('small', '', label), el('b', '', String(v)));
    return d;
  };

  function renderSeat(q) {
    const s = G.s;
    const h = $('seat' + q);
    h.replaceChildren();
    h.classList.toggle('turn', s.turn === q && !s.over);
    const n = popcount(s.hands[q]);
    h.append(el('div', 'seatname', NAMES[q]), el('div', 'seatcount', `${n} ${plural(n)}`));
    const backs = el('div', 'backs');
    const vertical = q !== 2;
    for (let i = 0; i < n; i++) backs.append(tileBack(!vertical ? false : false));
    if (s.over) {
      backs.replaceChildren();
      for (const id of maskToIds(s.hands[q])) backs.append(tileById(id, true, 'mini'));
    }
    h.append(backs);
    if (settings.get().helper !== 'off' && !s.over) {
      const nums = [];
      for (let k = 0; k <= 6; k++) if (s.voids[q] & (1 << k)) nums.push(k);
      if (nums.length) h.append(el('div', 'voidline', 'нет: ' + nums.join(' ')));
    }
  }

  function renderMe() {
    const s = G.s;
    const h = $('seat0');
    h.replaceChildren();
    h.classList.toggle('turn', s.turn === 0 && !s.over);
    const moves = s.turn === 0 && !s.over ? legalMoves(s, 0) : [];
    const playable = new Set(moves.map((m) => m.id));
    const row = el('div', 'hand');
    for (const id of maskToIds(s.hands[0])) {
      const t = tileById(id, true, 'hand-tile');
      if (s.turn === 0 && !s.over) t.classList.add(playable.has(id) ? 'playable' : 'blocked');
      if (G.pendingTile === id) t.classList.add('picked');
      if (G.hint && G.hint.id === id) t.classList.add('hint');
      t.setAttribute('role', 'button');
      t.tabIndex = playable.has(id) ? 0 : -1;
      t.onclick = () => clickTile(id);
      t.onkeydown = (e) => (e.key === 'Enter' || e.key === ' ') && clickTile(id);
      row.append(t);
    }
    const label = el('div', 'seatname', 'Вы · ' + popcount(s.hands[0]) + ' ' + plural(popcount(s.hands[0])));
    h.append(label, row);
  }

  function clickTile(id) {
    const s = G.s;
    if (s.turn !== 0 || s.over) return;
    const ms = legalMoves(s, 0).filter((m) => m.id === id);
    if (!ms.length) {
      say('Этот камень сейчас не подходит ни к одному концу.', true);
      return;
    }
    if (ms.length === 1) return humanPlay(ms[0]);
    // fits both ends -> choose
    G.pendingTile = G.pendingTile === id ? null : id;
    render();
  }

  function pendingChooser() {
    const s = G.s;
    const id = G.pendingTile;
    return {
      left: s.ends[0],
      right: s.ends[1],
      onPick: (side) => humanPlay({ id, side }),
    };
  }

  function renderActions() {
    const a = $('actions');
    a.replaceChildren();
    const s = G.s;
    const btn = (text, fn, cls = '') => {
      const b = el('button', 'btn ' + cls, text);
      b.type = 'button';
      b.onclick = fn;
      a.append(b);
      return b;
    };
    if (s.over) return;
    if (s.turn === 0) btn('💡 Подсказка', giveHint);
    btn('🧮 Трекер', () => {
      const t = $('trackerbox');
      t.classList.toggle('hidden');
      refreshTracker();
    });
    btn('Новая партия', () => {
      if (confirm('Начать новую партию? Текущая будет потеряна.')) newMatch();
    }, 'ghostbtn');
    const st = G.stats;
    a.append(el('span', 'stat', `Партий: ${st.matches} · побед: ${st.wins} · подсказок: ${st.hints}`));
  }

  async function giveHint() {
    if (G.s.turn !== 0) return;
    const box = $('hintbox');
    box.classList.remove('hidden');
    box.textContent = 'Думаю…';
    G.stats.hints++;
    save('stats', G.stats);
    const view = makeView(G.s, 0);
    const tok = G.token;
    const res = await aiChoose(view, 'expert', { budgetMs: 700, maxWorlds: 400 });
    if (tok !== G.token || G.s.turn !== 0) return;
    G.hint = res.move;
    const lines = explainChoice(view, res);
    box.replaceChildren(el('h4', '', 'Подсказка'), ...lines.map((l) => el('p', '', l)));
    render();
  }

  async function refreshTracker() {
    const box = $('trackerbox');
    const mode = settings.get().helper;
    if (box.classList.contains('hidden')) return;
    const view = makeView(G.s, 0);
    if (mode === 'off') {
      box.textContent = 'Режим «Только память»: трекер выключен. Включить можно в «Настройках».';
      return;
    }
    renderTracker(box, view, G.probs && G.probs.view === G.s.played + ':' + G.s.turn ? G.probs.P : null, 'counts');
    if (mode === 'full') {
      const key = G.s.played + ':' + G.s.turn;
      const tok = G.token;
      const { P } = await aiProbs(view, 900);
      if (tok !== G.token) return;
      G.probs = { view: key, P };
      renderTracker(box, view, P, 'full');
    }
  }

  // ----------------------------------------------------------------- result + review
  function showResult() {
    const s = G.s;
    const m = G.match;
    const r = s.result;
    const box = $('resultbox');
    box.classList.remove('hidden');
    box.replaceChildren();
    const h = m.history[m.history.length - 1];
    const we = (t) => (t === 0 ? 'Мы' : 'Они');
    let title;
    if (r.kind === 'out') title = `${NAMES[r.winner]} ${r.winner === 0 ? 'вышли' : 'вышел'} — «домино»!`;
    else if (r.tie) title = 'Рыба: ничья между парами — очков никто не пишет.';
    else title = `Рыба! Меньше всех на руках у: ${NAMES[r.winner].toLowerCase()}.`;
    box.append(el('h3', '', title));
    const pips = el('p', '', 'Очки на руках: ' + [0, 1, 2, 3].map((q) => `${NAMES[q]} ${r.pips[q]}`).join(' · '));
    box.append(pips);
    if (h.scoring >= 0) box.append(el('p', 'big', `${we(h.scoring)} записывают ${r.points} очк.`));
    box.append(el('p', '', `Счёт: Мы ${m.scores[0]} — Они ${m.scores[1]}`));
    if (m.over) {
      const won = m.winnerTeam === 0;
      const lossMode = m.rules.scoreMode === 'loser';
      box.append(el('h3', won ? 'win' : 'lose', won ? '🏆 Партия выиграна!' : 'Партия проиграна.'));
      if (m.shutout) box.append(el('p', '', lossMode ? 'Сухая партия!' : 'Они остались на нуле — «сухая».'));
    }
    const row = el('div', 'actions');
    const next = el('button', 'btn primary', m.over ? 'Новая партия' : 'Следующая раздача');
    next.onclick = () => (m.over ? newMatch() : startHand());
    const rev = el('button', 'btn', '🔍 Разбор моих ходов');
    rev.onclick = () => runReview(box, rev);
    row.append(next, rev);
    box.append(row);
    say(title);
    box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  async function runReview(box, btn) {
    btn.disabled = true;
    const out = el('div', 'review');
    box.append(out);
    if (!G.snaps.length) {
      out.textContent = 'В этой раздаче у вас не было ходов с выбором.';
      return;
    }
    out.textContent = 'Разбираю ваши решения…';
    const list = [];
    let totalLoss = 0;
    let good = 0;
    for (const sn of G.snaps) {
      const res = await aiChoose(sn.view, 'expert', { budgetMs: 350, maxWorlds: 160, seedLock: true });
      const mine = res.evals.find((e) => e.move.id === sn.move.id && e.move.side === sn.move.side);
      const best = res.evals.reduce((a, b) => (b.ev > a.ev ? b : a));
      const loss = mine ? best.ev - mine.ev : 0;
      totalLoss += Math.max(0, loss);
      if (loss < 1.5) good++;
      else list.push({ sn, res, best, mine, loss });
    }
    out.replaceChildren();
    out.append(el('h4', '', `Разбор: ${good} из ${G.snaps.length} решений близки к лучшему`));
    if (!list.length) out.append(el('p', '', 'Серьёзных ошибок не найдено. Отлично!'));
    list.sort((a, b) => b.loss - a.loss);
    for (const it of list.slice(0, 5)) {
      const p = el('div', 'rev-item');
      const nm = (m) => `${tileName(m.id)}${it.sn.view.ends ? (m.side === 0 ? ' (слева)' : ' (справа)') : ''}`;
      p.append(
        el('b', '', `Вы сыграли ${nm(it.sn.move)}, сильнее было ${nm(it.best.move)}`),
        el('span', 'dim', ` — потеря ≈ ${it.loss.toFixed(1)} очк.`),
      );
      const why = explainChoice(it.sn.view, it.res).slice(2, 5);
      for (const l of why) p.append(el('div', 'dim', l));
      out.append(p);
    }
    out.append(el('p', 'dim', `Суммарная потеря по раздаче ≈ ${totalLoss.toFixed(1)} очк. Оценка по Монте-Карло, с точки зрения того, что вы знали в момент хода.`));
  }

  const plural = (n) => (n === 1 ? 'камень' : n >= 2 && n <= 4 ? 'камня' : 'камней');

  return { newMatch, rerender: render, start() { if (!G.match) newMatch(); else render(); } };
}
