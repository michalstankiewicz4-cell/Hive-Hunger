/**
 * Ship types panel (bottom-right): how many of your units are yellow eaters, red laser ships,
 * blue storm ships, green tugs and purple bombers — a slider each, linked: together they are
 * always all your units (the Units slider plus upgrades). A checkbox in front of a slider locks
 * it: it can't be moved, and moving the others never changes it.
 *  - Moving a slider up takes the ships from the eaters first, then from the other types, the
 *    last one first (bombers, tugs, storms, lasers); moving it down gives them to the eaters
 *    (if the eaters are locked: to the other types, the last one first).
 *  - Eaters are the rest: moving Eaters up takes from the other types, the last one first.
 */
const TYPES = [['eaters', 'Eaters'], ['lasers', 'Lasers'], ['storms', 'Storms'], ['tugs', 'Tugs'], ['bombers', 'Bombers']];
const OTHERS = ['lasers', 'storms', 'tugs', 'bombers'];
const LAST_FIRST = ['bombers', 'tugs', 'storms', 'lasers'];

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
    for (const [key, label] of TYPES) this.sliders[key] = this.slider(key, label, (v) => this.change(key, v));
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
    row.append(lock, l, input, out);
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
