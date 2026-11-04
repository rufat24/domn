// Drills tab: menu of exercises + a small runner. All answers come from src/ai/drillgen.js (deterministic).
import { makeRng, tileName, maskToIds } from '../engine/tiles.js';
import { el, tileById } from './tile.js';
import { renderBoard } from './board.js';
import { load, save } from './storage.js';
import { SEAT_NAMES, genCount, genVoid, genRead, genFish, genScore, genBest } from '../ai/drillgen.js';

const SEAT_ACC = ['вас', 'соперника слева', 'партнёра', 'соперника справа'];
const SEAT_AREA = ['me', 'left', 'top', 'right'];

// ---------------------------------------------------------------- the desk (same look as the real table)
/**
 * t: {chain, ends, hand, counts, passes}.  o.hands: optional masks per seat to show face up (otherwise only yours).
 * o.passes: show each seat's passes as chips.  o.focus: seat to highlight.  o.onTile(id, node): make your tiles clickable.
 */
function desk(t, o = {}) {
  const d = el('div', 'table desk');
  for (let q = 0; q < 4; q++) {
    const h = el('div', 'seat ' + SEAT_AREA[q]);
    if (o.focus === q) h.classList.add('turn');
    const open = q === 0 ? (o.hands ? o.hands[0] : t.hand) : o.hands ? o.hands[q] : null;
    const n = open != null ? maskToIds(open).length : t.counts[q];
    h.append(el('div', 'seatname', SEAT_NAMES[q]), el('div', 'seatcount', `${n} шт`));
    if (q === 0) {
      const row = el('div', 'hand');
      for (const id of maskToIds(open)) {
        const tile = tileById(id, true, 'hand-tile');
        tile.dataset.id = id;
        if (o.onTile) {
          tile.setAttribute('role', 'button');
          tile.tabIndex = 0;
          tile.onclick = () => o.onTile(id, tile);
          tile.onkeydown = (e) => (e.key === 'Enter' || e.key === ' ') && o.onTile(id, tile);
        } else tile.style.cursor = 'default';
        row.append(tile);
      }
      h.append(row);
    } else {
      const row = el('div', 'backs' + (open != null ? ' open' : ''));
      if (open != null) for (const id of maskToIds(open)) row.append(tileById(id, true, 'mini'));
      else for (let i = 0; i < n; i++) row.append(el('span', 'tile back v'));
      h.append(row);
    }
    if (o.passes) {
      for (const p of t.passes.filter((x) => x.player === q)) {
        const [a, b] = p.ends;
        h.append(el('div', 'voidline', `пас · концы ${a === b ? a : a + ' и ' + b}`));
      }
    }
    d.append(h);
  }
  const board = el('div', 'board');
  renderBoard(board, { chain: t.chain, ends: t.ends });
  d.append(board);
  return d;
}

const inlineTile = (id) => {
  const s = el('span', 'inl');
  s.append(tileById(id, false, 'mini'));
  return s;
};
const para = (...parts) => {
  const p = el('p', 'qtext');
  for (const x of parts) p.append(typeof x === 'string' ? document.createTextNode(x) : x);
  return p;
};
const seatBtn = (q) => ({ text: SEAT_NAMES[q], value: q });
const key = (m) => m.id + ':' + m.side;

// ---------------------------------------------------------------- drill definitions
// make(rng, rules) -> { node, choices:[{text|node, value}], answer, explain:Node|string, setup?(ctx), onFinish?(ok) }
const DRILLS = [
  {
    id: 'count',
    title: 'Счёт чисел',
    desc: 'Сколько камней с данным числом ещё не видно? Это основа всего счёта.',
    make(rng, rules) {
      const q = genCount(rng, rules);
      const node = el('div');
      node.append(para(`Сколько камней с числом ${q.n} сейчас у остальных троих (не на столе и не у вас)? Дубль ${q.n}-${q.n} считается один раз.`), desk(q.t));
      const ex = el('div');
      ex.append(el('p', '', `Всего 7 камней с числом ${q.n}. На столе: ${q.onTable}, у вас: ${q.mine}. Значит у остальных 7 − ${q.onTable} − ${q.mine} = ${q.answer}.`));
      if (q.unseenIds.length) {
        const r = el('div', 'drill-tiles');
        for (const id of q.unseenIds) r.append(tileById(id, false, 'mini'));
        ex.append(el('p', '', 'Эти камни ещё не видны:'), r);
      }
      return { node, choices: [0, 1, 2, 3, 4, 5, 6, 7].map((n) => ({ text: String(n), value: n })), answer: q.answer, explain: ex };
    },
  },
  {
    id: 'void',
    title: 'Кто что не держит',
    desc: 'Пас = «у меня нет этого числа». Может ли у игрока быть такой камень?',
    make(rng, rules) {
      const q = genVoid(rng, rules);
      const node = el('div');
      node.append(para(`${SEAT_NAMES[q.q]} пасовал. Может ли у него ещё быть камень `, inlineTile(q.id), '? Рядом с игроками написано, на каких концах они пасовали.'), desk(q.t, { passes: true, focus: q.q }));
      const nums = q.voidNums.join(', ');
      const ex = `${SEAT_NAMES[q.q]} пасовал на числа: ${nums} — значит ни одного камня с ${q.voidNums.length > 1 ? 'этими числами' : 'этим числом'} у него нет. ` +
        (q.answer ? `В камне ${tileName(q.id)} таких чисел нет, поэтому он может его держать.` : `Камень ${tileName(q.id)} содержит одно из них — у него его точно нет.`);
      return { node, choices: [{ text: 'Может быть', value: true }, { text: 'Точно нет', value: false }], answer: q.answer, explain: ex };
    },
  },
  {
    id: 'read',
    title: 'Вычислите руки',
    desc: 'Один неизвестный камень может лежать только у одного игрока. У кого?',
    make(rng, rules) {
      const q = genRead(rng, rules);
      const node = el('div');
      node.append(para('Кто держит камень ', inlineTile(q.id), '? Он не на столе и не у вас. Вычислите по пасам.'), desk(q.t, { passes: true }));
      const reasons = q.why.map((w) => `${SEAT_NAMES[w.q]} не может (пасовал на ${w.nums.join(' и ')})`).join('; ');
      return { node, choices: [1, 2, 3].map(seatBtn), answer: q.answer, explain: `${reasons}. Остаётся только ${SEAT_NAMES[q.answer]}.` };
    },
  },
  {
    id: 'fish',
    title: 'Рыба или выход?',
    desc: 'После вашего хода: игра закроется (рыба) или кто-то ещё сможет сыграть? Как друзья видят это заранее.',
    make(rng, rules) {
      const q = genFish(rng, rules);
      const node = el('div');
      const side = q.t.ends[0] === q.t.ends[1] ? '' : q.move.side === 0 ? ' на левый конец' : ' на правый конец';
      node.append(para(`Концы стола: ${q.t.ends[0]} и ${q.t.ends[1]}. Вы кладёте `, inlineTile(q.move.id), `${side}. Что будет дальше: рыба (никто не сможет ходить) или игра продолжится?`), desk(q.t, { focus: 0 }));
      const [nl, nr] = q.after.ends;
      const ex = el('div');
      ex.append(
        el('p', '', `Новые концы: ${nl} и ${nr}. Камней с ${nl}, которых нет на столе (у других или у вас в руке): ${q.after.left}${nl === nr ? '' : `; с ${nr}: ${q.after.right}`}.`),
        el('p', '', q.answer
          ? 'Таких камней нет — никто не может сыграть, рыба. Заметьте: рыба возможна, только если оба конца — одно число и все 7 камней с ним уже сыграны.'
          : 'Камни на концах ещё есть — у кого-то из игроков (или у вас) остался ход, игра продолжается.'),
      );
      return { node, choices: [{ text: 'Рыба', value: true }, { text: 'Игра продолжится', value: false }], answer: q.answer, explain: ex };
    },
  },
  {
    id: 'score',
    title: 'Очки за рыбу',
    desc: 'Игра закрыта. Чья пара побеждает и сколько очков пишет?',
    make(rng, rules) {
      const q = genScore(rng, rules);
      const r = q.result;
      const node = el('div');
      node.append(
        para('Игра закрылась (рыба), все камни открыты. Чья пара пишет очки и сколько? Ваша пара — вы и партнёр сверху.'),
        desk({ chain: q.chain, ends: q.ends, hand: q.hands[0], counts: [], passes: [] }, { hands: q.hands }),
      );
      const lab = (team, pts) => (team < 0 ? 'Ничья, никто не пишет' : `${team === 0 ? 'Наша пара' : 'Соперники'} пишут ${pts}`);
      const correct = lab(r.team, r.points);
      const rnd = (v) => (rules.roundTo5 ? Math.round(v / 5) * 5 : v);
      const sum = (...i) => rnd(i.reduce((x, k) => x + r.pips[k], 0));
      const w = r.team < 0 ? 0 : r.team;
      const labels = [correct, lab(1 - w, sum(1 - w, 1 - w + 2)), lab(w, sum(0, 1, 2, 3)), lab(w, sum(w, w + 2)), lab(1 - w, sum(w, w + 2))];
      const list = [...new Set(labels)].slice(0, 4);
      if (!list.includes(correct)) list[0] = correct;
      list.sort(() => rng() - 0.5);
      const hp = r.pips;
      const ex = el('div');
      ex.append(
        el('p', '', `Очки в руках: вы ${hp[0]}, слева ${hp[1]}, партнёр ${hp[2]}, справа ${hp[3]} (0-0 считается ${q.rules.blankBlank}, 6-6 — ${q.rules.sixSix}).`),
        el('p', '', r.team < 0
          ? 'Самые лёгкие руки у обеих пар поровну — по умолчанию в такой ничьей никто не пишет.'
          : `Самая лёгкая рука — у ${SEAT_ACC[r.winner]}, пишет ${r.team === 0 ? 'наша пара' : 'пара соперников'}. ${q.rules.fishScoring === 'all' ? 'Очки всех четырёх рук.' : 'Очки двух рук противника.'}`),
      );
      return { node, choices: list.map((t) => ({ text: t, value: t })), answer: correct, explain: ex };
    },
  },
  {
    id: 'best',
    title: 'Концовка: лучший ход',
    desc: 'Все руки открыты, камней осталось мало. Нажмите на камень, которым пошли бы. Точный перебор покажет лучший ход.',
    make(rng, rules) {
      const q = genBest(rng, rules);
      const key = (m) => m.id + ':' + (q.ends[0] === q.ends[1] ? 0 : m.side);
      const legal = new Map();
      for (const v of q.vals) legal.set(v.move.id, [...(legal.get(v.move.id) || []), v.move]);
      let ctxRef = null;
      let picked = null;
      let tilesEl = null;
      const sideText = (m) => `${tileName(m.id)} на ${q.ends[m.side]}${q.ends[0] === q.ends[1] ? '' : m.side === 0 ? ' (слева)' : ' (справа)'}`;
      const onTile = (id, tile) => {
        if (!ctxRef) return;
        const ms = legal.get(id);
        if (!ms) return ctxRef.say('Этот камень сейчас не подходит ни к одному концу стола.');
        ctxRef.say('');
        picked = tile;
        if (ms.length === 1 || q.ends[0] === q.ends[1]) return ctxRef.finish(key(ms[0]));
        ctxRef.choose(ms.map((m) => ({ text: sideText(m), value: key(m) })));
      };
      const node = el('div');
      const dk = desk({ chain: q.t.chain, ends: q.ends, hand: q.hands[0], counts: [], passes: [] }, { hands: q.hands, focus: 0, onTile });
      tilesEl = dk;
      node.append(para(`Концы: ${q.ends[0]} и ${q.ends[1]}. Ваш ход, все руки открыты (в настоящей игре так не бывает, но логику концовки удобно тренировать именно так). Нажмите на камень, которым пошли бы лучше всего для вашей пары.`), dk);
      const ex = el('div');
      ex.append(el('p', '', 'Ожидаемый результат (очки вашей пары, «+» — вы пишете, «−» — соперники) при точной игре всех четверых:'));
      const ul = el('ul');
      for (const v of q.vals) ul.append(el('li', '', `${sideText(v.move)}: ${v.v > 0 ? '+' : ''}${v.v}`));
      ex.append(ul, el('p', 'dim', 'Подсказка: обычно выигрывает ход, после которого соперникам нечем ходить, или который сохраняет вам связь с партнёром.'));
      return {
        node, choices: [], answer: key(q.answer), explain: ex,
        setup: (c) => { ctxRef = c; },
        onFinish: (ok) => {
          const right = tilesEl.querySelector(`.hand-tile[data-id="${q.answer.id}"]`);
          if (right) right.classList.add('picked');
          if (picked && !ok) picked.classList.add('wrongtile');
          if (picked && ok) picked.classList.add('righttile');
        },
      };
    },
  },
  {
    id: 'quiz',
    title: 'Игра в паре: тест',
    desc: 'Короткие вопросы по взаимодействию с партнёром и по счёту очков.',
    quiz: true,
  },
];

const QUIZ = [
  {
    q: 'Партнёр спасовал на 5. У вас есть равноценный выбор: оставить на конце 5 или 2 (партнёр на 2 не пасовал). Что лучше?',
    a: ['Оставить 2', 'Оставить 5'], right: 0,
    why: 'Пас на 5 значит, что у партнёра 5 нет. Конец 5 ему не поможет, а на 2 он, возможно, сможет сходить.',
  },
  {
    q: 'Соперник слева пасовал на 3. Вы можете положить 3 на конец. Что это даст?',
    a: ['Он, скорее всего, снова пропустит ход', 'Он обязательно сходит', 'Ничего не меняется'], right: 0,
    why: 'Пока на конце 3, у него нет чем ходить на этот конец — он снова пасует (если второй конец ему тоже не подходит), и ход возвращается быстрее.',
  },
  {
    q: 'Оба соперника пасовали на 5, партнёр — нет. Какой конец выгодно оставить?',
    a: ['Конец 5', 'Любой другой — разницы нет'], right: 0,
    why: 'Соперники на конец 5 сходить не смогут, поэтому ходить будете вы и партнёр — темп ваш.',
  },
  {
    q: 'Какой камень опаснее всего остаться в руке при рыбе по правилам по умолчанию?',
    a: ['6-6 (12 очков)', '0-0 (10 очков)', '6-5 (11 очков)'], right: 0,
    why: 'По умолчанию 6-6 стоит 12 очков, 6-5 — 11, 0-0 — 10. Проверьте в Настройках, как считают ваши друзья.',
  },
  {
    q: 'Все трое остальных пасовали и на 1, и на 4. Где могут быть оставшиеся камни с 1 и с 4?',
    a: ['На столе или у вас в руке', 'У партнёра', 'У соперников'], right: 0,
    why: 'Каждый, кто пасовал на число, держит ноль камней с ним. Значит все ещё не сыгранные камни с 1 и 4 — только у вас.',
  },
  {
    q: 'Когда рыба закрывает игру?',
    a: ['Только если на обоих концах одно и то же число, и все 7 камней с ним уже сыграны', 'Если на столе разные концы и сыграно больше 20 камней', 'Когда у кого-то остался один камень'], right: 0,
    why: 'Если концы разные, то каждое из этих чисел встречается в цепочке нечётное число раз, а всего половинок с числом 8 — значит, камень с ним ещё остаётся у кого-то. Поэтому закрыть игру можно только одинаковыми концами. Закон проверен автотестом на тысячах случайных партий.',
  },
  {
    q: 'Можно ли подавать партнёру условные знаки (паузами, кашлем, интонацией)?',
    a: ['Нет — только открытая информация: ходы, пасы, выбор начала', 'Да, если соперники не заметят'], right: 0,
    why: 'Это нечестно, и тренировать здесь нечего. Партнёр читает ваши ходы и пасы, вы — его; этого достаточно.',
  },
  {
    q: 'У вашей пары лёгкие руки, впереди возможна рыба. Как лучше играть?',
    a: ['Помогать закрыть игру и не торопиться выходить', 'Бросаться тяжёлыми камнями', 'Не обращать внимания'], right: 0,
    why: 'Рыба выигрывается лёгкой рукой: меньше очков в сумме — вы побеждаете и пишете очки соперников.',
  },
];

// ---------------------------------------------------------------- runner
export function mountDrills(root, settings) {
  const stats = load('drillstats', {});
  const rngObj = makeRng((Date.now() ^ 0x9e3779b9) >>> 0);

  function menu() {
    root.replaceChildren();
    root.append(el('h1', '', 'Тренировки'));
    root.append(el('p', 'dim', 'Ответы всегда считаются точно по правилам, а не «на глаз». Начните со «Счёта чисел» и каждый день делайте по 10 задач.'));
    const cards = el('div', 'cards');
    for (const d of DRILLS) {
      const b = el('button', 'card');
      b.type = 'button';
      b.append(el('h3', '', d.title), el('p', '', d.desc));
      const st = stats[d.id];
      b.append(el('p', 'dim', st ? `Всего верно: ${st.right} из ${st.total}` : 'Ещё не пробовали'));
      b.addEventListener('click', () => run(d));
      cards.append(b);
    }
    root.append(cards);
  }

  function run(d) {
    let done = 0;
    let right = 0;
    let quizOrder = d.quiz ? QUIZ.map((_, i) => i).sort(() => rngObj() - 0.5) : null;
    const rules = settings.get().rules;
    function next() {
      root.replaceChildren();
      window.scrollTo(0, 0);
      const top = el('div', 'drillbar');
      const back = el('button', 'btn ghostbtn', '← Все тренировки');
      back.type = 'button';
      back.addEventListener('click', menu);
      top.append(back, el('span', 'dim', `${d.title} · верно ${right} из ${done}`));
      root.append(top);
      let item;
      if (d.quiz) {
        if (!quizOrder.length) quizOrder = QUIZ.map((_, i) => i).sort(() => rngObj() - 0.5);
        const qq = QUIZ[quizOrder.pop()];
        const order = qq.a.map((_, i) => i).sort(() => rngObj() - 0.5);
        item = { node: el('p', 'qtext', qq.q), choices: order.map((i) => ({ text: qq.a[i], value: i })), answer: qq.right, explain: qq.why };
      } else {
        item = d.make(rngObj, rules);
      }
      const box = el('div', 'drillbox');
      box.append(item.node);
      const toast = el('div', 'toast warn');
      const choices = el('div', 'choices');
      const fb = el('div', 'feedback');
      box.append(toast, choices, fb);
      root.append(box);
      let locked = false;
      let btns = [];
      function choose(list) {
        choices.replaceChildren();
        btns = list.map((c) => {
          const b = el('button', 'btn choice');
          b.type = 'button';
          if (c.node) b.append(c.node);
          else b.textContent = c.text;
          b.addEventListener('click', () => finish(c.value, b));
          choices.append(b);
          return { b, c };
        });
      }
      function finish(value, btn) {
        if (locked) return;
        locked = true;
        toast.textContent = '';
        const ok = value === item.answer;
        done++;
        if (ok) right++;
        stats[d.id] = { right: (stats[d.id]?.right || 0) + (ok ? 1 : 0), total: (stats[d.id]?.total || 0) + 1 };
        save('drillstats', stats);
        for (const x of btns) {
          x.b.disabled = true;
          if (x.c.value === item.answer) x.b.classList.add('right');
          else if (x.b === btn) x.b.classList.add('wrong');
        }
        if (item.onFinish) item.onFinish(ok, value);
        const ex = el('div', 'explain');
        ex.append(el('b', '', ok ? 'Верно. ' : 'Не совсем. '));
        if (typeof item.explain === 'string') ex.append(document.createTextNode(item.explain));
        else ex.append(item.explain);
        const nb = el('button', 'btn primary', 'Следующая задача');
        nb.type = 'button';
        nb.addEventListener('click', next);
        fb.append(ex, nb);
        nb.focus();
      }
      choose(item.choices);
      if (item.setup) item.setup({ finish, choose, say: (m) => { toast.textContent = m; } });
    }
    next();
  }

  menu();
}
