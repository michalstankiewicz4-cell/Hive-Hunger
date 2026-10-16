/**
 * Ship types panel (bottom-right): how many of your units are yellow eaters, red laser ships,
 * blue storm ships and green tugs — a slider each. The sliders are linked: together they are
 * always all your units (the Units slider plus upgrades).
 *  - Moving Lasers, Storms or Tugs takes the ships from the eaters; when there are none left,
 *    from the other types, the last one first (tugs, then storms, then lasers).
 *  - Moving Eaters takes the ships from the tugs first, then the storm ships, then the lasers.
 */
const TYPES = [['eaters', 'Eaters'], ['lasers', 'Lasers'], ['storms', 'Storms'], ['tugs', 'Tugs']];
const OTHERS = ['lasers', 'storms', 'tugs'];

export class ShipTypes {
  /**
   * @param {HTMLElement} root panel container
   * @param {{total:()=>number, get:(key:string)=>number, set:(key:string, n:number)=>void}} opts
   */
  constructor(root, opts) {
    this.opts = opts;
    this.root = root;
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

  /** One slider moved: fit the others around it. */
  change(key, v) {
    const c = this.counts();
    if (key === 'eaters') {
      let over = c.lasers + c.storms + c.tugs - (this.total - v);
      for (const k of ['tugs', 'storms', 'lasers']) {
        const take = Math.min(over, c[k]);
        c[k] -= take;
        over -= take;
      }
    } else {
      c[key] = v;
      let over = c.lasers + c.storms + c.tugs - this.total;
      for (const k of ['tugs', 'storms', 'lasers']) {
        if (k === key || over <= 0) continue;
        const take = Math.min(over, c[k]);
        c[k] -= take;
        over -= take;
      }
    }
    for (const k of OTHERS) this.opts.set(k, c[k]);
  }

  slider(id, label, onInput) {
    const row = document.createElement('div');
    row.className = `control ships-${id}`;
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
    input.addEventListener('input', () => {
      onInput(Number(input.value));
      this.sync();
    });
    row.append(l, input, out);
    this.root.appendChild(row);
    return { input, out };
  }

  /** Follows the number of units (Units slider, upgrades) and the current split. */
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
