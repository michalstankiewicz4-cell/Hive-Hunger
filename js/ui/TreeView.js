import { NODES, NODE, BRANCHES } from '../core/SkillTree.js';

/**
 * The upgrade tree (Tab). Drawn on a small canvas and scaled up without smoothing, so it
 * comes out as pixel art. The tree grows upwards from the Hive core at the bottom; rings
 * behind it mark the depth. Diamonds are nodes: big ones with an icon start a branch.
 *
 * Owned nodes are filled with the branch colour, nodes you can buy blink, locked ones are grey.
 * Hover shows what a node does; click buys it.
 */

// 8 × 8 pixel icons
const ICONS = {
  core: ['..####..', '.#....#.', '#..##..#', '#.#..#.#', '#.#..#.#', '#..##..#', '.#....#.', '..####..'],
  units: ['........', '.#....#.', '###..###', '.#....#.', '........', '...#....', '..###...', '...#....'],
  speed: ['........', '#...#...', '.#...#..', '..#...#.', '..#...#.', '.#...#..', '#...#...', '........'],
  power: ['#......#', '.#....#.', '..####..', '.######.', '.######.', '..####..', '.#....#.', '#......#'],
  bolt: ['....###.', '...###..', '..###...', '.######.', '...###..', '..###...', '.##.....', '#.......'],
  arcs: ['........', '#.......', '.#...#..', '..#.#.#.', '...#...#', '........', '.#.#.#.#', '........'],
  volt: ['..####..', '.#....#.', '.#.##.#.', '.#.##.#.', '.#....#.', '.#.##.#.', '.#....#.', '.######.'],
  cap: ['..####..', '.#....#.', '#..#...#', '#..#...#', '#..###.#', '#......#', '.#....#.', '..####..'],
};

const DIGITS = [
  ['###', '#.#', '#.#', '#.#', '###'], ['.#.', '##.', '.#.', '.#.', '###'], ['###', '..#', '###', '#..', '###'],
  ['###', '..#', '.##', '..#', '###'], ['#.#', '#.#', '###', '..#', '..#'], ['###', '#..', '###', '..#', '###'],
];
const NODES_BY_ID = Object.fromEntries(NODES.map((n) => [n.id, n]));

const BG = [13, 8, 24];
const RING = [42, 29, 69];
const LOCKED = [70, 60, 96];
const DARK = [20, 12, 34];

const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export class TreeView {
  /**
   * @param {HTMLElement} root
   * @param {{getTree:()=>import('../core/SkillTree.js').SkillTree|null, getPoints:()=>number, onBuy:(id:string)=>void,
   *   onOpen?:()=>void, onClose?:()=>void}} opts  onOpen / onClose: single player pauses while it is open
   */
  constructor(root, opts) {
    const { getTree, getPoints, onBuy } = opts;
    this.opts = opts;
    this.root = root;
    this.getTree = getTree;
    this.getPoints = getPoints;
    this.onBuy = onBuy;
    this.hover = null;
    this.t = 0;

    this.header = document.createElement('div');
    this.header.className = 'tree-header';
    this.title = document.createElement('div');
    this.title.className = 'tree-title';
    this.title.textContent = 'Upgrade tree';
    this.pointsEl = document.createElement('div');
    this.pointsEl.className = 'tree-points';
    const hint = document.createElement('div');
    hint.className = 'tree-hint';
    hint.textContent = 'Click a blinking node to buy it · Tab / Esc: close';
    this.header.append(this.title, this.pointsEl, hint);

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'tree-canvas';
    this.ctx = this.canvas.getContext('2d');
    this.tip = document.createElement('div');
    this.tip.className = 'tree-tip';
    this.tip.hidden = true;
    root.append(this.canvas, this.header, this.tip);

    this.canvas.addEventListener('pointermove', (e) => this.onMove(e));
    this.canvas.addEventListener('pointerleave', () => { this.hover = null; this.tip.hidden = true; });
    this.canvas.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('resize', () => this.isOpen && this.layout());
  }

  get isOpen() {
    return !this.root.hidden;
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  open() {
    if (!this.getTree()) return;
    this.root.hidden = false;
    document.body.classList.add('tree-open');
    this.opts.onOpen?.();
    this.layout();
    const loop = () => {
      if (!this.isOpen) return;
      this.t++;
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  close() {
    if (this.isOpen) this.opts.onClose?.();
    this.root.hidden = true;
    document.body.classList.remove('tree-open');
    this.tip.hidden = true;
    cancelAnimationFrame(this.raf);
  }

  /** Canvas in "art pixels" (P screen pixels each) and node positions: the tree grows upwards. */
  layout() {
    const P = window.innerWidth < 640 ? 2 : 3;
    this.P = P;
    const W = Math.ceil(window.innerWidth / P), H = Math.ceil(window.innerHeight / P);
    this.canvas.width = W;
    this.canvas.height = H;
    this.W = W; this.H = H;
    const cx = W >> 1, cy = H - 20;
    // level d sits on a ring R0 + d·ring from the core (R0 keeps the first level off the core);
    // angles are squeezed a little so the widest branches stay above the core's line
    const SQ = 0.82, R0 = 0.45;
    const maxDepth = Math.max(...NODES.map((n) => n.depth));
    const maxSin = Math.max(...NODES.map((n) => Math.abs(Math.sin((n.angle * SQ * Math.PI) / 180)) * (n.depth + R0)));
    this.ring = Math.max(12, Math.min((cy - 44) / (maxDepth + R0), (W / 2 - 22) / maxSin));
    this.radius = (d) => (d <= 0 ? 0 : (d + R0) * this.ring);
    this.cx = cx; this.cy = cy;
    this.pos = {};
    for (const n of NODES) {
      const a = (n.angle * SQ * Math.PI) / 180, r = this.radius(n.depth);
      this.pos[n.id] = { x: Math.round(cx + r * Math.sin(a)), y: Math.round(cy - r * Math.cos(a)) };
    }
  }

  /** Size by kind: the core, ships (hexagons) bigger, the swarm's traits (diamonds), ships' properties (small circles). */
  size(n) {
    return { core: 11, ship: 8, swarm: n.icon ? 7 : 5, prop: 3 }[n.kind] ?? 4;
  }

  // --- pixel helpers ---

  px(x, y, c) {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(x, y, 1, 1);
  }

  line(x0, y0, x1, y1, c) {
    this.ctx.fillStyle = c;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.ctx.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /** Diamond |dx| + |dy| ≤ r: filled, with an outline and an optional glow. */
  diamond(x, y, r, fill, outline, glow) {
    const ctx = this.ctx;
    for (let dy = -r - 2; dy <= r + 2; dy++) {
      for (let dx = -r - 2; dx <= r + 2; dx++) {
        const d = Math.abs(dx) + Math.abs(dy);
        let c = null;
        if (d <= r - 1) c = fill;
        else if (d <= r) c = outline;
        else if (glow && d <= r + 2) c = glow;
        if (c) { ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy, 1, 1); }
      }
    }
  }

  /** Pointy-top hexagon of radius r (a ship). */
  hexagon(x, y, r, fill, outline, glow) {
    const ctx = this.ctx, k = Math.sqrt(3) / 2;
    const inside = (dx, dy, rr) => Math.abs(dx) <= rr * k && Math.abs(dx) * 0.5 + Math.abs(dy) * k <= rr * k;
    for (let dy = -r - 3; dy <= r + 3; dy++) {
      for (let dx = -r - 3; dx <= r + 3; dx++) {
        let c = null;
        if (inside(dx, dy, r - 1.2)) c = fill;
        else if (inside(dx, dy, r)) c = outline;
        else if (glow && inside(dx, dy, r + 2)) c = glow;
        if (c) { ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy, 1, 1); }
      }
    }
  }

  /** A small round node of radius r (a ship's property). */
  circle(x, y, r, fill, outline, glow) {
    const ctx = this.ctx;
    for (let dy = -r - 2; dy <= r + 2; dy++) {
      for (let dx = -r - 2; dx <= r + 2; dx++) {
        const d = Math.hypot(dx, dy);
        let c = null;
        if (d <= r - 0.8) c = fill;
        else if (d <= r + 0.4) c = outline;
        else if (glow && d <= r + 2) c = glow;
        if (c) { ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy, 1, 1); }
      }
    }
  }

  /** A digit 0–9 in a 3 × 5 pixel font (the level numbers). */
  digit(d, x, y, c) {
    const rows = DIGITS[d];
    this.ctx.fillStyle = c;
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (rows[j][i] === '#') this.ctx.fillRect(x + i, y + j, 1, 1);
  }

  /** A dotted pixel line (a link across branches: either parent is enough). */
  dotted(x0, y0, x1, y1, c) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    this.ctx.fillStyle = c;
    for (let i = 0; i <= n; i++) {
      if (i % 4 > 1) continue;
      this.ctx.fillRect(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), 1, 1);
    }
  }

  icon(name, x, y, c) {
    const rows = ICONS[name];
    if (!rows) return;
    this.ctx.fillStyle = c;
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
      if (rows[j][i] === '#') this.ctx.fillRect(x - 4 + i, y - 4 + j, 1, 1);
    }
  }

  // --- drawing ---

  draw() {
    const tree = this.getTree();
    if (!tree) return;
    const points = this.getPoints();
    const { ctx, W, H, cx, cy } = this;
    this.pointsEl.textContent = `◆ ${points.toLocaleString('en')} points`;

    ctx.fillStyle = rgb(BG, 0.94);
    ctx.clearRect(0, 0, W, H);
    ctx.fillRect(0, 0, W, H);

    // the level rings (pixel arcs) behind the tree, numbered 0 … 5 on the left
    for (let d = 1; d <= 5; d++) {
      const r = this.radius(d);
      const c = rgb(RING, d % 2 ? 0.9 : 0.55);
      for (let a = -80; a <= 80; a += 0.6) {
        const t = (a * Math.PI) / 180;
        this.px(Math.round(cx + r * Math.sin(t)), Math.round(cy - r * Math.cos(t)), c);
      }
      // (where the ring is still on screen on a narrow window)
      const t = -Math.min((80 * Math.PI) / 180, Math.asin(Math.min(1, (cx - 10) / r)));
      this.digit(d, Math.round(cx + r * Math.sin(t)) - 5, Math.round(cy - r * Math.cos(t)) - 2, rgb(BRANCHES.core.color, 0.8));
    }
    this.digit(0, cx - 20, cy - 2, rgb(BRANCHES.core.color, 0.8));
    // twinkling dust
    for (let i = 0; i < 70; i++) {
      const x = (i * 97 + 13) % W, y = (i * 53 + 7) % H;
      if ((i + (this.t >> 4)) % 5 === 0) this.px(x, y, rgb([120, 100, 180], 0.6));
    }

    // edges: bought = branch colour, buyable = dim, locked / not built yet = grey. A link across
    // branches is lighter: dotted when either parent is enough, solid when it needs both
    for (const n of NODES) {
      for (const pid of n.parents) {
        const a = this.pos[pid], b = this.pos[n.id];
        const col = BRANCHES[n.branch].color;
        const st = tree.state(n.id);
        const cross = NODES_BY_ID[pid].branch !== n.branch && NODES_BY_ID[pid].kind !== 'core' && n.kind !== 'prop';
        const base = st === 'owned' ? col : st === 'available' ? mix(col, BG, 0.55) : st === 'soon' ? mix(col, BG, 0.72) : LOCKED;
        const c = cross ? rgb(mix(base, [255, 255, 255], 0.35), 0.75) : rgb(base, st === 'locked' ? 0.6 : 1);
        if (cross && !n.all) this.dotted(a.x, a.y, b.x, b.y, c);
        else this.line(a.x, a.y, b.x, b.y, c);
      }
    }

    // nodes
    const blink = (this.t >> 4) % 2 === 0;
    for (const n of NODES) {
      const { x, y } = this.pos[n.id];
      const col = BRANCHES[n.branch].color;
      const st = tree.state(n.id);
      const r = this.size(n);
      const hovered = this.hover === n.id;
      let fill, outline, glow, iconC;
      if (st === 'owned') {
        fill = rgb(col);
        outline = rgb(mix(col, [255, 255, 255], 0.55));
        glow = rgb(col, 0.35);
        iconC = rgb(DARK);
      } else if (st === 'available') {
        const affordable = points >= n.cost;
        fill = rgb(mix(DARK, col, 0.18));
        outline = rgb(affordable && blink ? mix(col, [255, 255, 255], 0.4) : col);
        glow = affordable ? rgb(col, blink ? 0.45 : 0.2) : null;
        iconC = rgb(col);
      } else if (st === 'soon') {
        // not built yet: in its colour, dimmed
        fill = rgb(mix(DARK, col, 0.12));
        outline = rgb(mix(col, BG, 0.45));
        glow = null;
        iconC = rgb(mix(col, BG, 0.45));
      } else {
        fill = rgb(DARK);
        outline = rgb(LOCKED);
        glow = null;
        iconC = rgb(LOCKED);
      }
      if (hovered) outline = rgb([255, 255, 255]);
      if (n.kind === 'ship') {
        this.hexagon(x, y, r, fill, outline, glow);
        this.hexagon(x, y, 3, outline, outline, null); // a small hexagon inside
      } else if (n.kind === 'prop') this.circle(x, y, r, fill, outline, glow);
      else this.diamond(x, y, r, fill, outline, glow);
      if (n.icon) this.icon(n.icon, x, y, iconC);
    }
  }

  // --- input ---

  nodeAt(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * this.W, y = ((e.clientY - rect.top) / rect.height) * this.H;
    let best = null, bestD = Infinity;
    for (const n of NODES) {
      const p = this.pos[n.id];
      const d = n.kind === 'ship' || n.kind === 'prop' ? Math.hypot(x - p.x, y - p.y) : Math.abs(x - p.x) + Math.abs(y - p.y);
      if (d <= this.size(n) + 3 && d < bestD) { bestD = d; best = n.id; }
    }
    return best;
  }

  onMove(e) {
    this.hover = this.nodeAt(e);
    if (!this.hover) { this.tip.hidden = true; return; }
    this.showTip(this.hover, e.clientX, e.clientY);
  }

  onClick(e) {
    const id = this.nodeAt(e);
    if (!id) return;
    const tree = this.getTree();
    if (tree.canBuy(id, this.getPoints())) this.onBuy(id);
    setTimeout(() => this.showTip(id, e.clientX, e.clientY), 50);
  }

  showTip(id, x, y) {
    const n = NODE[id], tree = this.getTree(), points = this.getPoints();
    const st = tree.state(id);
    const col = rgb(BRANCHES[n.branch].color);
    let status;
    if (id === 'core') status = '';
    else if (st === 'owned') status = 'Owned';
    else if (st === 'soon') status = 'Coming soon';
    else if (st === 'locked') status = `Locked — buy ${n.parents.map((p) => NODE[p].name).join(n.all ? ' and ' : ' or ')} first`;
    else if (points >= n.cost) status = 'Click to buy';
    else status = `Need ${(n.cost - points).toLocaleString('en')} more points`;
    this.tip.replaceChildren();
    const head = document.createElement('div');
    head.className = 'tree-tip-head';
    const name = document.createElement('span');
    name.textContent = n.name;
    name.style.color = col;
    const cost = document.createElement('span');
    cost.className = 'tree-tip-cost';
    cost.textContent = n.cost ? `${n.cost.toLocaleString('en')} pts` : '';
    head.append(name, cost);
    const what = document.createElement('div');
    what.textContent = n.text;
    const stEl = document.createElement('div');
    stEl.className = `tree-tip-status is-${st}`;
    stEl.textContent = status;
    this.tip.append(head, what, stEl);
    this.tip.hidden = false;
    const w = this.tip.offsetWidth, h = this.tip.offsetHeight;
    this.tip.style.left = `${Math.min(window.innerWidth - w - 8, x + 14)}px`;
    this.tip.style.top = `${Math.max(8, Math.min(window.innerHeight - h - 8, y - h - 10))}px`;
  }
}
