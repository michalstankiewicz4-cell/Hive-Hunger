import { CONFIG, SHIP_KINDS, SHIP_GROUPS } from '../config.js';
import { el } from './dom.js';
import { SHIP_INFO, paintShip } from './ShipGuide.js';

const TW = 48, TH = 26; // thumbnail size (CSS pixels; the Ship guide's pictures, smaller)

/**
 * The ship bar along the bottom of the screen: a thumbnail of every ship type (attack ships, a line,
 * support ships — SHIP_GROUPS), each with how many you have. One group is chosen at a time (eaters
 * at first) and stays chosen: a click on a voxel or a drifting piece sends only that group there,
 * a click on your tunnel calls only that group home. The + on a thumbnail buys one ship of that
 * type (Shift: 10) — free for now — up to `swarm.maxCount` ships in all; the − sends one away (Shift: 10):
 * it jumps to hyperspace and is gone (every ship can go, the last one too; one still in the tunnel is gone at once). When not all thumbnails fit on the
 * screen, ◀ ▶ at the ends of the bar scroll it (so does a swipe over it).
 */
export class ShipBar {
  /**
   * @param {HTMLElement} root the bar's container
   * @param {{counts:()=>Record<string,number>|null, total:()=>number, chosen:()=>string,
   *   choose:(kind:string)=>void, buy:(kind:string, n:number)=>void}} opts
   */
  constructor(root, opts) {
    this.opts = opts;
    this.items = {};
    root.setAttribute('role', 'toolbar');
    // the thumbnails scroll inside a track; ◀ ▶ at the ends move it when not all fit on the screen
    const track = (this.track = el('div', 'shipbar-track'));
    this.left = this.arrow('◀', 'shipbar-left', -1);
    this.right = this.arrow('▶', 'shipbar-right', 1);
    root.append(this.left, track, this.right);
    SHIP_GROUPS.forEach((group, n) => {
      if (n > 0) {
        const line = el('div', 'shipbar-sep');
        line.setAttribute('role', 'separator');
        track.appendChild(line);
      }
      for (const kind of group.kinds) track.appendChild(this.item(kind));
    });
    track.addEventListener('scroll', () => this.fit(), { passive: true });
    window.addEventListener('resize', () => this.fit());
    this.sync();
    this.fit();
  }

  /** A scroll button: moves the track by most of what is visible, `dir` −1 left, +1 right. */
  arrow(text, cls, dir) {
    const b = el('button', `shipbar-scroll ${cls}`, text);
    b.type = 'button';
    b.title = dir < 0 ? 'Scroll the ships left' : 'Scroll the ships right';
    b.setAttribute('aria-label', b.title);
    b.addEventListener('click', () => {
      this.track.scrollBy({ left: dir * Math.max(60, this.track.clientWidth * 0.8), behavior: 'smooth' });
    });
    return b;
  }

  /** The arrows show only when the ships do not all fit, and grey out at the ends. */
  fit() {
    const t = this.track, over = t.scrollWidth - t.clientWidth > 1;
    this.left.hidden = this.right.hidden = !over;
    this.left.disabled = t.scrollLeft <= 1;
    this.right.disabled = t.scrollLeft >= t.scrollWidth - t.clientWidth - 1;
  }

  item(kind) {
    const name = SHIP_INFO[kind][0];
    const box = el('div', `shipbar-item shipbar-${kind}`);
    const pick = el('button', 'shipbar-pick');
    pick.type = 'button';
    pick.dataset.kind = kind;
    pick.title = `${name} — choose, then click a voxel (or your tunnel to call them home)`;
    const canvas = el('canvas', 'shipbar-pic');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = TW * dpr; canvas.height = TH * dpr;
    canvas.style.width = `${TW}px`; canvas.style.height = `${TH}px`;
    const g = canvas.getContext('2d');
    g.scale((dpr * TW) / 120, (dpr * TH) / 64);
    paintShip(g, kind);
    const label = el('span', 'shipbar-name', name);
    pick.append(canvas, label);
    const count = el('span', 'shipbar-count', '0');
    count.title = `${name}: how many you have`;
    pick.addEventListener('click', () => { this.opts.choose(kind); this.sync(); });
    const buy = el('button', 'shipbar-buy', '+');
    buy.type = 'button';
    buy.title = `Buy a ${name.toLowerCase().replace(/s$/, '')} (Shift: 10) — free for now`;
    buy.setAttribute('aria-label', `Buy ${name}`);
    buy.addEventListener('click', (e) => { this.opts.buy(kind, e.shiftKey ? 10 : 1); this.sync(); });
    const sell = el('button', 'shipbar-sell', '−');
    sell.type = 'button';
    sell.title = `Send one away: it jumps to hyperspace (Shift: 10)`;
    sell.setAttribute('aria-label', `Send ${name} away`);
    sell.addEventListener('click', (e) => { this.opts.sell(kind, e.shiftKey ? 10 : 1); this.sync(); });
    const foot = el('div', 'shipbar-foot');
    foot.append(sell, count, buy);
    box.append(pick, foot);
    this.items[kind] = { pick, count, buy, sell };
    return box;
  }

  /** Follows the numbers (buying, upgrades, bombers lost) and the chosen group. */
  sync() {
    const c = this.opts.counts();
    const full = this.opts.total() >= CONFIG.swarm.maxCount;
    const chosen = this.opts.chosen();
    for (const [kind, it] of Object.entries(this.items)) {
      const n = c ? c[kind] : 0;
      if (it.count.textContent !== String(n)) it.count.textContent = String(n);
      it.pick.setAttribute('aria-pressed', String(kind === chosen));
      it.pick.parentElement.classList.toggle('is-chosen', kind === chosen);
      it.buy.disabled = full;
      it.sell.disabled = !n;
    }
  }
}

/** How many ships of each type swarm `s` has (eaters: the rest), not counting those sent away (leaving). */
export function countsOf(s) {
  const c = {};
  let left = s.count;
  let i = 0;
  for (const k of SHIP_KINDS) {
    c[k] = Math.max(0, Math.min(s[k] || 0, left));
    left -= c[k];
    for (const end = i + c[k]; i < end; i++) if (s.leaving?.[i]) c[k]--;
  }
  c.eaters = left;
  for (; i < s.count; i++) if (s.leaving?.[i]) c.eaters--;
  return c;
}
