/**
 * Ship types panel (bottom-right): how many of your units are eaters and how many are red
 * laser ships. The two sliders are linked — together they are always all your units (the
 * Units slider plus upgrades), so moving one moves the other.
 */
export class ShipTypes {
  /**
   * @param {HTMLElement} root panel container
   * @param {{total:()=>number, get:()=>number, set:(lasers:number)=>void}} opts
   *   total: your units now; get/set: how many of them are lasers
   */
  constructor(root, opts) {
    this.opts = opts;
    this.root = root;
    const title = document.createElement('div');
    title.className = 'ships-title';
    title.textContent = 'Ship types';
    root.appendChild(title);
    this.eaters = this.slider('eaters', 'Eaters', (v) => opts.set(this.total - v));
    this.lasers = this.slider('lasers', 'Lasers', (v) => opts.set(v));
    this.sync();
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
      this.sync(true);
    });
    row.append(l, input, out);
    this.root.appendChild(row);
    return { input, out };
  }

  /** Follows the number of units (Units slider, upgrades) and the current split. */
  sync() {
    const total = Math.max(0, Math.round(this.opts.total()));
    const lasers = Math.min(this.opts.get(), total);
    this.total = total;
    for (const [s, v] of [[this.eaters, total - lasers], [this.lasers, lasers]]) {
      s.input.max = total;
      s.input.value = v;
      s.out.value = v;
    }
  }
}
