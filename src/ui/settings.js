// Settings: persisted, with a rules form generated from RULE_LABELS.
import { DEFAULT_RULES, RULE_LABELS } from '../engine/rules.js';
import { el } from './tile.js';
import { load, save } from './storage.js';

const DEFAULTS = { rules: {}, level: 'hard', speed: 700, helper: 'counts' };
const LEVEL_OPTS = [
  ['easy', 'Новичок (играет просто и иногда ошибается)'],
  ['normal', 'Обычный (аккуратная эвристика)'],
  ['hard', 'Сильный (угадывает ваши камни по пасам, считает варианты)'],
  ['expert', 'Эксперт (думает дольше, в конце раздачи считает точно)'],
];
const HELPER_OPTS = [
  ['off', 'Без помощи — тренируем память (трекер скрыт)'],
  ['counts', 'Счётчики: сколько камней каждого числа осталось + пасы'],
  ['full', 'Полный трекер: вероятности, у кого какой камень'],
];

export function createSettings() {
  const stored = load('settings', {});
  const rv = stored.rv || 1;
  // v2: the default value of 0-0 changed from 25 to 10; drop the old saved default so it does not stick.
  if (rv < 2 && stored.rules && stored.rules.blankBlank === 25) delete stored.rules.blankBlank;
  const st = { ...DEFAULTS, ...stored };
  st.rules = { ...DEFAULT_RULES, ...(st.rules || {}) };
  // Save only the rules the player changed, so future default changes reach them.
  const persist = () => {
    const rules = {};
    for (const k of Object.keys(st.rules)) if (st.rules[k] !== DEFAULT_RULES[k]) rules[k] = st.rules[k];
    save('settings', { ...st, rules, rv: 2 });
  };
  return {
    get: () => ({ rules: { ...st.rules }, level: st.level, speed: st.speed, helper: st.helper }),
    set(patch) {
      Object.assign(st, patch);
      persist();
    },
    setRule(k, v) {
      st.rules[k] = v;
      persist();
    },
    reset() {
      st.rules = { ...DEFAULT_RULES };
      persist();
    },
  };
}

export function mountSettings(root, settings, { onRulesChanged }) {
  const draw = () => {
    const cur = settings.get();
    root.replaceChildren();
    const wrap = el('div', 'panel settings');
    wrap.append(el('h2', '', 'Настройки'));

    const field = (label, control, hint) => {
      const f = el('label', 'field');
      f.append(el('span', 'flabel', label), control);
      if (hint) f.append(el('small', 'dim', hint));
      return f;
    };
    const select = (opts, value, onChange) => {
      const s = el('select');
      for (const [v, t] of opts) {
        const o = el('option', '', t);
        o.value = v;
        if (String(v) === String(value)) o.selected = true;
        s.append(o);
      }
      s.onchange = () => onChange(s.value);
      return s;
    };

    wrap.append(
      field('Сила соперников', select(LEVEL_OPTS, cur.level, (v) => settings.set({ level: v }))),
      field('Помощь при игре', select(HELPER_OPTS, cur.helper, (v) => settings.set({ helper: v }))),
      field(
        'Скорость ходов соперников',
        select(
          [[250, 'Быстро'], [700, 'Нормально'], [1300, 'Медленно (успеваю считать)']],
          cur.speed,
          (v) => settings.set({ speed: Number(v) }),
        ),
      ),
    );

    wrap.append(el('h3', '', 'Правила партии'));
    wrap.append(el('p', 'dim', 'Домино 101 играют по-разному. Настройте так, как играете с друзьями — изменения применяются к новой партии.'));
    for (const [key, spec] of Object.entries(RULE_LABELS)) {
      let control;
      if (spec.type === 'select') {
        control = select(spec.options, cur.rules[key], (v) => { settings.setRule(key, v); onRulesChanged(); });
      } else if (spec.type === 'bool') {
        control = el('input');
        control.type = 'checkbox';
        control.checked = !!cur.rules[key];
        control.onchange = () => { settings.setRule(key, control.checked); onRulesChanged(); };
      } else {
        control = el('input');
        control.type = 'number';
        control.min = spec.min;
        control.max = spec.max;
        control.value = cur.rules[key];
        control.onchange = () => {
          const n = Math.max(spec.min, Math.min(spec.max, Number(control.value) || DEFAULT_RULES[key]));
          control.value = n;
          settings.setRule(key, n);
          onRulesChanged();
        };
      }
      wrap.append(field(spec.ru, control));
    }
    const reset = el('button', 'btn ghostbtn', 'Сбросить правила по умолчанию');
    reset.type = 'button';
    reset.onclick = () => { settings.reset(); onRulesChanged(); draw(); };
    wrap.append(reset);
    root.append(wrap);
  };
  draw();
}
