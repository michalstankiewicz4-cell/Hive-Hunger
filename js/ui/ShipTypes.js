import { SHIP_KINDS, SHIP_GROUPS } from '../config.js';

/**
 * Ship types panel (bottom-right), attack ships above a line and support ships below it (SHIP_GROUPS):
 * how many of your units are yellow eaters, red laser ships,
 * blue storm ships, green tugs, purple bombers, magenta orb ships, white support ships and grey
 * cleaners — a slider each, linked: together they are always all your units (the Units slider plus
 * upgrades). The arrows on both sides of a slider move it by one ship. A checkbox in front of a
 * slider locks it: it can't be moved, and moving the others never changes it.
 *  - Moving a slider up takes the ships from the eaters first, then from the other types, the
 *    last one first (cleaners, support, orbs, bombers, tugs, storms, lasers); moving it down gives
 *    them to the eaters (if the eaters are locked: to the other types, the last one first).
 *  - Eaters are the rest: moving Eaters up takes from the other types, the last one first.
 */
const LABELS = { eaters: 'Eaters', lasers: 'Lasers', storms: 'Storms', tugs: 'Tugs', bombers: 'Bombers', orbs: 'Orbs', supports: 'Support', cleaners: 'Cleaners', drills: 'Drills', piercers: 'Piercers', snipers: 'Snipers', splashers: 'Splashers', boosters: 'Boosters' };
const OTHERS = SHIP_KINDS;
const TYPES = ['eaters', ...OTHERS].map((k) => [k, LABELS[k] || k]);
const LAST_FIRST = [...OTHERS].reverse();

export class ShipTypes {
  /**
   * @param {HTMLElement} root panel container
   * @param {{total:()=>number, get:(key:string)=>number, set:(key:string, n:number)=>void}} opts
   */
  constructor(root, opts) {
    this.opts = opts;
    this.root = root;
    this.locked = {};
    const title = document.createElement('div');
    title.className = 'ships-title';
    title.textContent = 'Ship types';
    root.appendChild(title);
    this.sliders = {};
    // in the Ship guide's order: attack ships, a line, support ships
    SHIP_GROUPS.forEach((group, n) => {
      if (n > 0) {
        const line = document.createElement('div');
        line.className = 'ships-sep';
        line.setAttribute('role', 'separator');
        root.appendChild(line);
      }
      for (const key of group.kinds) this.sliders[key] = this.slider(key, LABELS[key] || key, (v) => this.change(key, v));
    });
    this.sync();
  }

  /** Current split (each type clamped so that together they are all the units). */
  counts() {
    let left = this.total;
    const c = {};
    for (const key of OTHERS) {
      c[key] = Math.max(0, Math.min(this.opts.get(key), left));
      left -= c[key];
    }
    c.eaters = left;
    return c;
  }

  /** One slider moved: the other unlocked types make room (or take the ships back). */
  change(key, v) {
    if (this.locked[key]) return;
    const c = this.counts();
    let diff = v - c[key];
    const free = (k) => k !== key && !this.locked[k];
    if (diff > 0) {
      // take: eaters first (unless it is the eaters that moved), then the others, the last one first
      for (const k of (key === 'eaters' ? LAST_FIRST : ['eaters', ...LAST_FIRST])) {
        if (!free(k) || diff <= 0) continue;
        const take = Math.min(diff, c[k]);
        c[k] -= take; c[key] += take; diff -= take;
      }
    } else if (diff < 0) {
      // give back: to the eaters, or (eaters locked / moved) to the others, the last one first
      const to = key !== 'eaters' && free('eaters') ? 'eaters' : LAST_FIRST.find(free);
      if (to) { c[to] -= diff; c[key] += diff; }
    }
    for (const k of OTHERS) this.opts.set(k, c[k]);
  }

  slider(id, label, onInput) {
    const row = document.createElement('div');
    row.className = `control ships-row ships-${id}`;
    const lock = document.createElement('input');
    lock.type = 'checkbox';
    lock.id = `ships-lock-${id}`;
    lock.title = `Lock ${label}`;
    lock.setAttribute('aria-label', `Lock ${label}`);
    const l = document.createElement('label');
    l.htmlFor = `ships-${id}`;
    l.textContent = label;
    const input = document.createElement('input');
    input.type = 'range';
    input.id = `ships-${id}`;
    input.min = 0;
    input.step = 1;
    const out = document.createElement('output');
    out.htmlFor = input.id;
    lock.addEventListener('change', () => {
      this.locked[id] = lock.checked;
      input.disabled = lock.checked;
    });
    input.addEventListener('input', () => {
      onInput(Number(input.value));
      this.sync();
    });
    // arrows: one ship less / more
    const arrow = (dir, text, name) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `ships-arrow ships-${dir > 0 ? 'more' : 'less'}`;
      b.textContent = text;
      b.title = `${name} ${label}`;
      b.setAttribute('aria-label', `${name} ${label}`);
      b.addEventListener('click', () => {
        if (this.locked[id]) return;
        const v = Math.max(0, Math.min(this.total, Number(input.value) + dir));
        if (v === Number(input.value)) return;
        onInput(v);
        this.sync();
      });
      return b;
    };
    const less = arrow(-1, '◀', 'One fewer'), more = arrow(1, '▶', 'One more');
    lock.addEventListener('change', () => { less.disabled = more.disabled = lock.checked; });
    row.append(lock, l, less, input, more, out);
    this.root.appendChild(row);
    return { input, out, lock };
  }

  /** Follows the number of units (Units slider, upgrades, bombers lost) and the current split. */
  sync() {
    this.total = Math.max(0, Math.round(this.opts.total()));
    const c = this.counts();
    for (const [key] of TYPES) {
      const s = this.sliders[key];
      s.input.max = this.total;
      s.input.value = c[key];
      s.out.value = c[key];
    }
  }
}
