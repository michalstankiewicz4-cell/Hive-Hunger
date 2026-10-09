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

const BG = [13, 8, 24];
const RING = [42, 29, 69];
const LOCKED = [70, 60, 96];
const DARK = [20, 12, 34];

const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export class TreeView {
  /**
   * @param {HTMLElement} root
   * @param {{getTree:()=>import('../core/SkillTree.js').SkillTree|null, getPoints:()=>number, onBuy:(id:string)=>void}} opts
   */
  constructor(root, { getTree, getPoints, onBuy }) {
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
    const maxDepth = Math.max(...NODES.map((n) => n.depth));
    const maxSin = Math.max(...NODES.map((n) => Math.abs(Math.sin((n.angle * Math.PI) / 180)) * n.depth));
    this.ring = Math.max(14, Math.min((cy - 44) / maxDepth, (W / 2 - 18) / maxSin));
    this.cx = cx; this.cy = cy;
    this.pos = {};
    for (const n of NODES) {
      const a = (n.angle * Math.PI) / 180, r = n.depth * this.ring;
      this.pos[n.id] = { x: Math.round(cx + r * Math.sin(a)), y: Math.round(cy - r * Math.cos(a)) };
    }
  }

  size(n) {
    return n.id === 'core' ? 11 : n.key ? 8 : 4;
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

    // depth rings (pixel arcs) behind the tree
    for (let d = 1; d <= 5; d++) {
      const r = d * this.ring;
      const c = rgb(RING, d % 2 ? 0.9 : 0.55);
      for (let a = -80; a <= 80; a += 0.6) {
        const t = (a * Math.PI) / 180;
        this.px(Math.round(cx + r * Math.sin(t)), Math.round(cy - r * Math.cos(t)), c);
      }
    }
    // twinkling dust
    for (let i = 0; i < 70; i++) {
      const x = (i * 97 + 13) % W, y = (i * 53 + 7) % H;
      if ((i + (this.t >> 4)) % 5 === 0) this.px(x, y, rgb([120, 100, 180], 0.6));
    }

    // edges: bought = branch colour, buyable = dim, locked = grey
    for (const n of NODES) {
      if (!n.parent) continue;
      const a = this.pos[n.parent], b = this.pos[n.id];
      const col = BRANCHES[n.branch].color;
      const st = tree.state(n.id);
      const c = st === 'owned' ? rgb(col) : st === 'available' ? rgb(mix(col, BG, 0.55)) : rgb(LOCKED, 0.6);
      this.line(a.x, a.y, b.x, b.y, c);
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
      } else {
        fill = rgb(DARK);
        outline = rgb(LOCKED);
        glow = null;
        iconC = rgb(LOCKED);
      }
      if (hovered) outline = rgb([255, 255, 255]);
      this.diamond(x, y, r, fill, outline, glow);
      if (n.key) this.icon(n.icon, x, y, iconC);
    }
  }

  // --- input ---

  nodeAt(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * this.W, y = ((e.clientY - rect.top) / rect.height) * this.H;
    let best = null, bestD = Infinity;
    for (const n of NODES) {
      const p = this.pos[n.id];
      const d = Math.abs(x - p.x) + Math.abs(y - p.y);
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
    else if (st === 'locked') status = `Locked — buy ${NODE[n.parent].name} first`;
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
