// Tile tracker: per-number counters, passes ("voids") and per-tile holder probabilities.
import { TA, TB, HAS, ID_OF, popcount } from '../engine/tiles.js';
import { el, tileFace } from './tile.js';

const SEAT_SHORT = { 1: 'Слева', 2: 'Партнёр', 3: 'Справа' };
const SEAT_COLOR = { 1: 'c1', 2: 'c2', 3: 'c3' };

/**
 * mode: 'counts' | 'full'.  P = tileProbabilities().P or null.
 */
export function renderTracker(host, view, P, mode) {
  host.replaceChildren();
  // 1) counters per number: how many of the 7 tiles with that number are still unseen
  const counters = el('div', 'counters');
  for (let n = 0; n <= 6; n++) {
    const unseen = popcount(HAS[n] & ~view.played & ~view.hand);
    const c = el('div', 'counter' + (unseen === 0 ? ' zero' : ''));
    c.append(el('b', '', String(n)), el('span', '', `ещё ${unseen}`));
    c.title = `Число ${n}: всего 7 камней; сыграно ${popcount(HAS[n] & view.played)}, у вас ${popcount(HAS[n] & view.hand)}.`;
    counters.append(c);
  }
  host.append(el('div', 'tr-title', 'Сколько камней с числом ещё не видно (из 7)'), counters);

  // 2) passes
  const voids = el('div', 'voids');
  for (const q of [1, 2, 3]) {
    const row = el('div', 'voidrow ' + SEAT_COLOR[q]);
    row.append(el('b', '', SEAT_SHORT[q] + ': '));
    const nums = [];
    for (let n = 0; n <= 6; n++) if (view.voids[q] & (1 << n)) nums.push(n);
    if (!nums.length) row.append(el('span', 'dim', 'не пасовал'));
    else for (const n of nums) row.append(el('span', 'voidchip', 'нет ' + n));
    voids.append(row);
  }
  host.append(el('div', 'tr-title', 'Пасы (у кого нет числа)'), voids);

  // 3) tile matrix
  const grid = el('div', 'matrix');
  for (let a = 0; a <= 6; a++) {
    for (let b = 0; b <= 6; b++) {
      if (b < a) {
        grid.append(el('span', 'mcell empty'));
        continue;
      }
      const id = ID_OF[a][b];
      const cell = el('span', 'mcell');
      const bit = 1 << id;
      cell.append(el('span', 'mname', `${a}-${b}`));
      if (view.played & bit) cell.classList.add('played');
      else if (view.hand & bit) cell.classList.add('mine');
      else if (mode === 'full' && P) {
        const bar = el('span', 'mbar');
        let top = 1;
        let topP = -1;
        for (const q of [1, 2, 3]) {
          const p = P[id][q];
          const seg = el('i', SEAT_COLOR[q]);
          seg.style.flexGrow = String(p);
          bar.append(seg);
          if (p > topP) {
            topP = p;
            top = q;
          }
        }
        cell.append(bar);
        cell.append(el('span', 'mtop ' + SEAT_COLOR[top], `${['', 'Л', 'П', 'Пр'][top]} ${Math.round(topP * 100)}%`));
        cell.title = `${a}-${b}: слева ${pct(P[id][1])}, партнёр ${pct(P[id][2])}, справа ${pct(P[id][3])}`;
        if (topP > 0.97) cell.classList.add('sure');
      }
      grid.append(cell);
    }
  }
  const legend = el('div', 'legend');
  legend.append(
    el('span', 'lg mine', 'ваши'),
    el('span', 'lg played', 'сыграны'),
    el('span', 'lg c1', 'Л — слева'),
    el('span', 'lg c2', 'П — партнёр'),
    el('span', 'lg c3', 'Пр — справа'),
  );
  host.append(el('div', 'tr-title', mode === 'full' ? 'Где лежат остальные камни (вероятности)' : 'Все 28 камней'), grid, legend);
}

const pct = (p) => Math.round(p * 100) + '%';
