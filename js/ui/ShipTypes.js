/**
 * Ship types panel (bottom-right): how many of your units are eaters, red laser ships and
 * blue storm ships. The sliders are linked — together they are always all your units (the
 * Units slider plus upgrades):
 *  - Lasers / Storms take their ships from the eaters (and, if there are none left, from each other);
 *  - Eaters take theirs from the storm ships first, then from the laser ships.
 */
export class ShipTypes {
  /**
   * @param {HTMLElement} root panel container
   * @param {{total:()=>number, get:(key:'lasers'|'storms')=>number, set:(key:'lasers'|'storms', n:number)=>void}} opts
   */
  constructor(root, opts) {
    this.opts = opts;
    this.root = root;
    const title = document.createElement('div');
    title.className = 'ships-title';
    title.textContent = 'Ship types';
    root.appendChild(title);
    this.sliders = {
      eaters: this.slider('eaters', 'Eaters', (v) => {
        const rest = this.total - v;
        const lasers = Math.min(this.counts().lasers, rest);
        this.apply(lasers, rest - lasers);
      }),
      lasers: this.slider('lasers', 'Lasers', (v) => this.apply(v, Math.min(this.counts().storms, this.total - v))),
      storms: this.slider('storms', 'Storms', (v) => this.apply(Math.min(this.counts().lasers, this.total - v), v)),
    };
    this.sync();
  }

  counts() {
    const total = this.total;
    const lasers = Math.min(this.opts.get('lasers'), total);
    const storms = Math.min(this.opts.get('storms'), total - lasers);
    return { lasers, storms, eaters: total - lasers - storms };
  }

  apply(lasers, storms) {
    this.opts.set('lasers', lasers);
    this.opts.set('storms', storms);
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
    for (const key of ['eaters', 'lasers', 'storms']) {
      const s = this.sliders[key];
      s.input.max = this.total;
      s.input.value = c[key];
      s.out.value = c[key];
    }
  }
}
