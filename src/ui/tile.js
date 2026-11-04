// DOM helpers for drawing dominoes.
import { TA, TB } from '../engine/tiles.js';

const PIP_CELLS = [[], [4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]];

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function half(n) {
  const h = el('span', 'half');
  const on = new Set(PIP_CELLS[n]);
  for (let i = 0; i < 9; i++) h.append(el('i', 'pip' + (on.has(i) ? ' on' : '')));
  return h;
}

/** A domino showing numbers a|b. vertical = stacked halves. */
export function tileFace(a, b, vertical = false, cls = '') {
  const t = el('span', 'tile' + (vertical ? ' v' : '') + (cls ? ' ' + cls : ''));
  t.append(half(a), half(b));
  t.dataset.a = a;
  t.dataset.b = b;
  return t;
}

export const tileById = (id, vertical = false, cls = '') => tileFace(TA[id], TB[id], vertical, cls);

export function tileBack(vertical = false) {
  const t = el('span', 'tile back' + (vertical ? ' v' : ''));
  return t;
}
