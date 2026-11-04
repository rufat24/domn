// Human-readable (Russian) reasons for a move, derived from public features + search values.
import { TA, TB, PIPS, HAS, IS_DOUBLE, popcount, tileName } from '../engine/tiles.js';
import { partnerOf, nextSeat } from '../engine/game.js';
import { simFromView } from './pimc.js';

const SEAT_NAMES = ['вы', 'соперник слева', 'партнёр', 'соперник справа'];
export const seatName = (q) => SEAT_NAMES[q];

function after(view, move) {
  const id = move.id;
  const hand = view.hand & ~(1 << id);
  let ends;
  if (!view.ends) ends = [TA[id], TB[id]];
  else {
    const e = view.ends[move.side];
    const o = TA[id] === e ? TB[id] : TA[id];
    ends = move.side === 0 ? [o, view.ends[1]] : [view.ends[0], o];
  }
  return { hand, ends, played: view.played | (1 << id) };
}

/** Facts about a move (list of {kind, text, weight}) — positive = good for us. */
export function moveFacts(view, move) {
  const me = view.seat;
  const part = partnerOf(me);
  const o1 = nextSeat(me);
  const o2 = (me + 3) & 3;
  const { hand, ends, played } = after(view, move);
  const id = move.id;
  const facts = [];
  if (hand === 0) return [{ kind: 'out', text: 'Это ваш последний камень — вы выходите («домино»).', weight: 9 }];
  if (IS_DOUBLE[id]) facts.push({ kind: 'double', text: `Сбрасывается дубль ${tileName(id)} — дубли тяжело пристроить позже, а на руках они «стоят» дорого.`, weight: 3 });
  if (PIPS[id] >= 9 && !IS_DOUBLE[id]) facts.push({ kind: 'heavy', text: `Сбрасывается тяжёлый камень (${PIPS[id]} очков): если раздача закончится не вами, он стоил бы дорого.`, weight: 2 });
  const seen = new Set();
  for (const e of ends) {
    if (seen.has(e)) continue;
    seen.add(e);
    const unseen = popcount(HAS[e] & ~played & ~hand);
    const mine = popcount(hand & HAS[e]);
    if (view.voids[part] & (1 << e)) facts.push({ kind: 'partnerVoid', text: `На открытом конце ${e} у партнёра нет камней (он пасовал по ${e}) — он пропустит ход.`, weight: -3 });
    if (view.voids[o1] & (1 << e) && view.voids[o2] & (1 << e)) facts.push({ kind: 'bothVoid', text: `Оба соперника пасовали по ${e}: конец ${e} им не подходит.`, weight: 3 });
    else if (view.voids[o1] & (1 << e)) facts.push({ kind: 'oppVoid', text: `Соперник слева пасовал по ${e}, значит на ${e} он не сыграет.`, weight: 2 });
    else if (view.voids[o2] & (1 << e)) facts.push({ kind: 'oppVoid', text: `Соперник справа пасовал по ${e}, значит на ${e} он не сыграет.`, weight: 2 });
    if (unseen === 0 && mine === 0) facts.push({ kind: 'dead', text: `Число ${e} закрыто полностью — на этом конце больше никто не сыграет.`, weight: 1 });
    else if (mine >= 2) facts.push({ kind: 'own', text: `У вас остаётся ${mine} камня с числом ${e} — вы сохраняете контроль над этим концом.`, weight: 2 });
  }
  const nums = [];
  for (let n = 0; n <= 6; n++) if (hand & HAS[n]) nums.push(n);
  if (nums.length <= 2 && popcount(hand) >= 3) facts.push({ kind: 'concentrate', text: `Рука сжимается до чисел ${nums.join(' и ')} — это легко разыгрывать, но вас могут «запереть».`, weight: 0 });
  return facts;
}

/** Build an explanation from a chooseMove result. */
export function explainChoice(view, res) {
  const lines = [];
  if (!res.evals || res.evals.length <= 1) {
    lines.push('Ход единственный — выбора нет.');
    return lines;
  }
  const sorted = res.evals.slice().sort((a, b) => b.ev - a.ev);
  const best = sorted[0];
  const second = sorted[1];
  const label = (m) => `${tileName(m.id)}${view.ends ? (m.side === 0 ? ' слева' : ' справа') : ''}`;
  lines.push(`Лучший ход: ${label(best.move)} (ожидание ${fmt(best.ev)} очк. за раздачу для вашей пары).`);
  if (res.worlds) lines.push(`Проверено ${res.worlds} вероятных раскладов чужих рук${res.exact ? ' (концовка просчитана точно)' : ''}.`);
  const facts = moveFacts(view, best.move).sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
  for (const f of facts.slice(0, 3)) lines.push('• ' + f.text);
  if (second) lines.push(`Следующий по качеству: ${label(second.move)} (${fmt(second.ev)}); разница ${fmt(best.ev - second.ev)}.`);
  const worst = sorted[sorted.length - 1];
  if (sorted.length > 2) lines.push(`Худший вариант: ${label(worst.move)} (${fmt(worst.ev)}).`);
  return lines;
}

const fmt = (v) => (v > 0 ? '+' : '') + v.toFixed(1);
