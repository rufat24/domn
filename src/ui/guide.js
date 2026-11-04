// Strategy guide view. Content is trusted static HTML from content/guide.js.
import { GUIDE } from '../../content/guide.js';
import { el } from './tile.js';

export function mountGuide(root) {
  root.replaceChildren();
  const wrap = el('div', 'guide');
  wrap.append(el('h1', '', 'Гид: как считать камни и читать руки'));
  const toc = el('nav', 'toc');
  toc.setAttribute('aria-label', 'Содержание');
  for (const s of GUIDE) {
    const a = el('a', '', s.title);
    a.href = '#g-' + s.id; // real link for no-JS / copy; click handled below so the tab hash is not clobbered
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const t = wrap.querySelector('#g-' + s.id);
      if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    toc.append(a);
  }
  wrap.append(toc);
  for (const s of GUIDE) {
    const sec = el('section');
    sec.id = 'g-' + s.id;
    sec.append(el('h2', '', s.title));
    const body = el('div', 'gbody');
    body.innerHTML = s.html;
    sec.append(body);
    wrap.append(sec);
  }
  root.append(wrap);
}
