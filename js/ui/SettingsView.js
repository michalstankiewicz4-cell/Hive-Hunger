import { settings } from '../settings.js';
import { el, button } from './dom.js';

/** What the mouse (and touch) does, and the keys. */
const MOUSE = [
  ['Left click / tap', 'send the swarm there'],
  ['Click the tunnel', 'call the swarm back home'],
  ['Right button drag / two fingers', 'turn the camera (any way round)'],
  ['Wheel', 'zoom'],
  ['Click the points counter', 'upgrade tree'],
];
const KEYS = [
  ['Tab', 'upgrade tree'],
  ['Space', 'pause / carry on (single player)'],
  ['Esc', 'menu (single player); closes the upgrade tree'],
];

/**
 * The Settings screen in the menu: Mouse (what it does, camera turning and zoom speed), Keyboard
 * (the keys) and Graphics (FPS counter, render resolution, smooth edges, amount of effects).
 * Changes apply at once and are remembered in this browser (settings.js). The three are side by side
 * (one under another on narrow screens).
 */
export function fillSettings(card, onBack) {
  card.classList.add('is-wide', 'is-settings');
  const columns = el('div', 'settings-columns');
  card.append(columns);
  columns.append(
    section('Mouse', [
      keyList(MOUSE),
      slider('Camera turning', 'rotateSpeed', 0.25, 3, 0.05, (v) => `${v.toFixed(2)}×`),
      slider('Zoom speed', 'zoomSpeed', 0.25, 3, 0.05, (v) => `${v.toFixed(2)}×`),
    ]),
    section('Keyboard', [keyList(KEYS)]),
    section('Graphics', [
      checkbox('FPS counter', 'fps'),
      choices('Resolution', 'resolution', [[0.5, '50%'], [0.75, '75%'], [1, '100%'], ['native', 'Native']]),
      checkbox('Smooth edges', 'antialias'),
      choices('Effects', 'effects', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]),
    ]),
  );
  const reset = button('Reset settings', () => {
    settings.reset();
    card.replaceChildren(card.firstChild); // keep the title, draw the rest again
    fillSettings(card, onBack);
  });
  const back = button('Back', onBack, 'lobby-button is-primary');
  const row = el('div', 'settings-buttons');
  row.append(reset, back);
  card.appendChild(row);
  back.focus();
}

function section(title, children) {
  const s = el('section', 'settings-section');
  s.append(el('h3', 'settings-title', title), ...children);
  return s;
}

function keyList(rows) {
  const dl = el('dl', 'settings-keys');
  for (const [k, what] of rows) dl.append(el('dt', '', k), el('dd', '', what));
  return dl;
}

let uid = 0;
function slider(label, key, min, max, step, format) {
  const id = `setting-${key}-${uid++}`;
  const row = el('div', 'settings-row');
  const l = el('label', '', label);
  l.htmlFor = id;
  const input = el('input');
  Object.assign(input, { type: 'range', id, min, max, step, value: settings.get(key) });
  input.dataset.setting = key;
  const out = el('output', '', format(Number(input.value)));
  input.addEventListener('input', () => {
    settings.set(key, Number(input.value));
    out.textContent = format(Number(input.value));
  });
  row.append(l, input, out);
  return row;
}

function checkbox(label, key) {
  const id = `setting-${key}-${uid++}`;
  const row = el('div', 'settings-row is-check');
  const input = el('input');
  Object.assign(input, { type: 'checkbox', id, checked: Boolean(settings.get(key)) });
  input.dataset.setting = key;
  input.addEventListener('change', () => settings.set(key, input.checked));
  const l = el('label', '', label);
  l.htmlFor = id;
  row.append(l, input);
  return row;
}

function choices(label, key, options) {
  const row = el('div', 'settings-row');
  const group = el('div', 'settings-choices');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  const mark = () => {
    for (const b of group.children) b.setAttribute('aria-pressed', String(b.dataset.value === String(settings.get(key))));
  };
  for (const [value, text] of options) {
    const b = button(text, () => { settings.set(key, value); mark(); }, 'settings-choice');
    b.dataset.value = String(value);
    b.dataset.setting = key;
    group.appendChild(b);
  }
  mark();
  row.append(el('span', '', label), group);
  return row;
}
