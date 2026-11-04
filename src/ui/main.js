// App shell: tabs + lazy-loaded sections.
import { createSettings, mountSettings } from './settings.js';
import { mountPlay } from './play.js';

const settings = createSettings();
const $ = (s) => document.querySelector(s);
const play = mountPlay($('#tab-play'), settings);
const loaded = {};

mountSettings($('#tab-settings'), settings, { onRulesChanged() { /* applied on next "Новая партия" */ } });

async function lazy(name, path, fn) {
  if (loaded[name]) return;
  loaded[name] = true;
  try {
    const mod = await import(path);
    fn(mod);
  } catch (e) {
    console.error(e);
    $('#tab-' + name).textContent = 'Не удалось загрузить раздел: ' + e.message;
  }
}

function show(tab) {
  for (const b of document.querySelectorAll('#nav button')) b.classList.toggle('on', b.dataset.tab === tab);
  for (const s of document.querySelectorAll('.tab')) s.classList.toggle('hidden', s.id !== 'tab-' + tab);
  try { history.replaceState(null, '', '#' + tab); } catch { /* ignore */ }
  if (tab === 'drills') lazy('drills', './drills.js', (m) => m.mountDrills($('#tab-drills'), settings));
  if (tab === 'guide') lazy('guide', './guide.js', (m) => m.mountGuide($('#tab-guide')));
  window.scrollTo(0, 0);
}

$('#nav').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (b) show(b.dataset.tab);
});

play.start();
const h = location.hash.slice(1);
if (['drills', 'guide', 'settings'].includes(h)) show(h);
window.__domn = { settings, play };
