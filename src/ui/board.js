// Draws the chain of played tiles. Doubles stand across the line.
import { el, tileFace } from './tile.js';

/**
 * state: game state with .chain (left->right) and .ends
 * opts.choose: {left:n, right:n, onPick(side)} to show end buttons
 */
export function renderBoard(host, s, opts = {}) {
  host.replaceChildren();
  const info = el('div', 'ends');
  if (s.ends) {
    info.append(el('span', 'endchip', s.ends[0]), el('span', 'endsep', 'концы'), el('span', 'endchip', s.ends[1]));
  } else info.append(el('span', 'endsep', 'Стол пуст — первый ход'));
  host.append(info);
  const row = el('div', 'chain');
  host.append(row);
  const ch = s.chain || [];
  if (opts.choose) row.append(ghost(opts.choose.left, 0, opts.choose.onPick, 'left'));
  ch.forEach((c, i) => {
    const dbl = c.a === c.b;
    const t = tileFace(c.a, c.b, dbl, 'chain-tile by' + c.player + (c === ch[ch.length - 1] || false ? '' : ''));
    if (s.lastTile === c.id && !s.over) t.classList.add('last');
    if (i === 0 || i === ch.length - 1) t.classList.add('endtile');
    t.title = ['Вы', 'Слева', 'Партнёр', 'Справа'][c.player];
    row.append(t);
  });
  if (opts.choose) row.append(ghost(opts.choose.right, 1, opts.choose.onPick, 'right'));
}

function ghost(n, side, onPick, cls) {
  const b = el('button', 'ghost ' + cls, side === 0 ? `← ${n}` : `${n} →`);
  b.type = 'button';
  b.onclick = () => onPick(side);
  return b;
}
