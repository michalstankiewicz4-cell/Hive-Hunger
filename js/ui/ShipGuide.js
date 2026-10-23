import { CONFIG, SHIP_GROUPS, kindConfig } from '../config.js';
import { el, button } from './dom.js';

/**
 * The Ship guide in the start menu: every ship type with a small picture and what it does, attack
 * ships and support ships apart (SHIP_GROUPS), in a window that fits the screen: the title and Back stay
 * put, the ships scroll. Pointing at a ship (or focusing it)
 * plays its shot as a short looping animation; otherwise the picture shows the middle of it.
 */

const W = 120, H = 64;   // picture size (CSS pixels)
const PERIOD = 2.2;      // seconds per loop of an animation
const STILL = 0.56;      // the moment shown when it isn't playing (the middle of the shot)

export const SHIP_INFO = {
  eaters: ['Eaters', 'Fly to the nearest voxel, land on it and eat it — a crater as wide as your Power.'],
  lasers: ['Lasers', 'Eat from 5 voxels away with a red beam; 10% slower.'],
  storms: ['Storms', 'Lightning from laser range that forks into three: the bite and its two nearest voxels.'],
  orbs: ['Orbs', 'A slow plasma orb with a fiery tail from 10 voxels; it bursts and destroys everything within 2 voxels.'],
  splashers: ['Splashers', 'A wobbling bubble of liquid from 10 voxels that bends the view like a lens; where it lands, 3 × 3 × 2 voxels soak for 3 s and are gone.'],
  bombers: ['Bombers', 'Blow up everything within 10 voxels on contact — and are gone. A black hole stays for 4 s.'],
  drills: ['Drills', 'Drill a straight tunnel towards the centre with a spiral bit, until through.'],
  piercers: ['Piercers', 'Lock a line from 20 voxels and fire along it until through: an orange beam with a spiral bolt, 3 voxels at once.'],
  cutters: ['Cutters', 'From 20 voxels a flat red sheet as wide as what it hits: it cuts the whole row at once, deeper and deeper, until through.'],
  snipers: ['Snipers', 'From any distance: stop, charge 5 s, fire a shot that speeds up 5% per voxel and destroys the voxel it hits.'],
  tugs: ['Tugs', 'Catch drifting pieces with a tractor beam and tow them home for 5 × the points.'],
  supports: ['Support', 'Every 3 s a bolt jumps between your own ships, destroying the voxels on its way.'],
  cleaners: ['Cleaners', 'Eat only drifting pieces of 1–3 voxels.'],
  boosters: ['Boosters', 'Fly with the swarm in a gentle pink force field 5 voxels across: your ships inside it get +20% Power: a wider crater, eating harder.'],
  siphons: ['Siphons', 'Take in liquid let loose in space — droplets of water and lava, which no other ship can collect — a point each. Nothing else.'],
};

const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
const shipColor = (k) => hex(k === 'eaters' ? CONFIG.swarm.eaterColor : CONFIG.swarm[kindConfig(k)].color);

/** Fills `card` (the menu card) with the guide; Back calls `onBack`. */
export function fillGuide(card, onBack) {
  card.classList.add('is-guide');
  const stop = [];
  // the title and Back stay put; only the ships scroll (when they don't fit the screen)
  const scroll = el('div', 'guide-scroll');
  card.appendChild(scroll);
  for (const group of SHIP_GROUPS) {
    const section = el('section', 'guide-section');
    section.append(el('h3', 'settings-title', group.name));
    const grid = el('div', 'guide-grid');
    for (const kind of group.kinds) {
      const [name, text] = SHIP_INFO[kind];
      const item = el('div', 'guide-ship');
      item.tabIndex = 0;
      item.dataset.kind = kind;
      const canvas = el('canvas', 'guide-pic');
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      const nameEl = el('div', 'guide-name', name);
      nameEl.style.color = shipColor(kind);
      const kindEl = el('div', 'guide-kind', group.name === 'Support' ? 'support' : 'attack');
      const head = el('div', 'guide-head');
      head.append(nameEl, kindEl);
      item.append(canvas, head, el('div', 'guide-text', text));
      grid.appendChild(item);
      // the picture: the middle of the shot; pointing at it plays the shot
      const draw = (t) => paint(ctx, kind, t);
      draw(STILL);
      let frame = 0, start = 0;
      const play = () => {
        if (frame) return;
        start = performance.now();
        const loop = (now) => { draw((((now - start) / 1000) % PERIOD) / PERIOD); frame = requestAnimationFrame(loop); };
        frame = requestAnimationFrame(loop);
        item.classList.add('is-playing');
      };
      const pause = () => { cancelAnimationFrame(frame); frame = 0; draw(STILL); item.classList.remove('is-playing'); };
      item.addEventListener('pointerenter', play);
      item.addEventListener('pointerleave', pause);
      item.addEventListener('focus', play);
      item.addEventListener('blur', pause);
      stop.push(() => cancelAnimationFrame(frame));
    }
    section.appendChild(grid);
    scroll.appendChild(section);
  }
  const back = button('Back', () => { for (const s of stop) s(); onBack(); }, 'lobby-button is-primary guide-back');
  card.appendChild(back);
  back.focus();
}

// --- the pictures ---------------------------------------------------------------------

const BG = '#0d1120';
const VOX = 7; // a voxel in the pictures (px)

/** The guide's still picture of ship `kind` (120 × 64, scale the context for other sizes) — the ship bar's thumbnails. */
export function paintShip(g, kind) {
  paint(g, kind, STILL);
}

/** Draws ship `kind` at phase t (0…1 of the loop). */
function paint(g, kind, t) {
  g.clearRect(0, 0, W, H);
  g.fillStyle = BG;
  g.fillRect(0, 0, W, H);
  stars(g);
  (PICTURES[kind] || PICTURES.eaters)(g, t, shipColor(kind));
}

function stars(g) {
  g.fillStyle = 'rgba(200,220,255,0.35)';
  for (const [x, y] of [[9, 8], [40, 5], [63, 14], [102, 9], [24, 55], [51, 60], [88, 57], [113, 40]]) g.fillRect(x, y, 1, 1);
}

/** A ship: a slim bar at (x, y) pointing at angle a (radians). */
function ship(g, x, y, color, a = 0, len = 13) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.fillStyle = color;
  g.fillRect(-len / 2, -1.6, len, 3.2);
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.fillRect(len / 2 - 2, -1.6, 2, 3.2);
  g.restore();
}

/** A voxel at grid position (col, row) of a block whose top left is (x0, y0); `k` 0…1 how much is left. */
function voxel(g, x, y, k = 1, color = '#5f8f4a') {
  if (k <= 0) return;
  const s = VOX * (0.4 + 0.6 * k), o = (VOX - s) / 2;
  g.fillStyle = color;
  g.globalAlpha = 0.35 + 0.65 * k;
  g.fillRect(x + o, y + o, s - 1, s - 1);
  g.globalAlpha = 1;
}

/** A block of voxels: cols × rows at (x, y); `gone(c, r)` → 0…1 how much of that one is left. */
function block(g, x, y, cols, rows, left = () => 1, color) {
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) voxel(g, x + c * VOX, y + r * VOX, left(c, r), color || (r === 0 ? '#6fa452' : '#7a6a58'));
}

/** A glowing line (beam / bolt). */
function glowLine(g, pts, color, width, glow) {
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.shadowColor = color;
  g.shadowBlur = glow;
  g.strokeStyle = color;
  g.lineWidth = width;
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.stroke();
  g.shadowBlur = 0;
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = Math.max(0.6, width * 0.35);
  g.stroke();
  g.restore();
}

/** A jagged path from (x0, y0) to (x1, y1), `n` pieces, `amp` px sideways (seeded by `seed`). */
function jag(x0, y0, x1, y1, n, amp, seed) {
  const pts = [x0, y0];
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280) - 0.5;
  for (let i = 1; i < n; i++) {
    const f = i / n;
    pts.push(x0 + (x1 - x0) * f + rnd() * amp * 0.4, y0 + (y1 - y0) * f + rnd() * amp);
  }
  pts.push(x1, y1);
  return pts;
}

function glowDot(g, x, y, r, color) {
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

const ease = (x) => Math.max(0, Math.min(1, x));

const PICTURES = {
  eaters(g, t, c) {
    // flies to the block, lands, eats a voxel
    const fly = ease(t / 0.4), eat = ease((t - 0.45) / 0.4);
    block(g, 80, 18, 4, 4, (cx, r) => (cx === 0 && r === 1 ? 1 - eat : 1));
    ship(g, 18 + (72 - 18) * fly, 28.5, c);
  },

  lasers(g, t, c) {
    const on = t > 0.15 && t < 0.85, burn = ease((t - 0.15) / 0.7);
    block(g, 84, 18, 3, 4, (cx, r) => (cx === 0 && r === 1 ? 1 - burn : 1));
    ship(g, 26, 28.5, c);
    if (on) glowLine(g, [33, 28.5, 87, 28.5], 'rgba(255,60,40,1)', 2.4 + Math.sin(t * 60) * 0.4, 8);
  },

  storms(g, t, c) {
    const flash = Math.floor(t * 18) % 2 === 0 && t > 0.1 && t < 0.9, burn = ease((t - 0.1) / 0.8);
    block(g, 84, 14, 3, 5, (cx, r) => (cx === 0 && r === 2 ? 1 - burn : cx === 0 && (r === 1 || r === 3) ? 1 - burn * 0.75 : 1));
    ship(g, 24, 31.5, c);
    if (flash) {
      const seed = Math.floor(t * 18);
      const fx = 31 + (87 - 31) * 0.7, fy = 31.5;
      glowLine(g, jag(31, 31.5, fx, fy, 5, 6, seed), 'rgba(110,186,255,1)', 1.4, 6);
      glowLine(g, jag(fx, fy, 87, 31.5, 3, 4, seed + 7), 'rgba(110,186,255,1)', 1.4, 6);
      glowLine(g, jag(fx, fy, 87, 24.5, 3, 3, seed + 3), 'rgba(110,186,255,0.7)', 1, 4);
      glowLine(g, jag(fx, fy, 87, 38.5, 3, 3, seed + 5), 'rgba(110,186,255,0.7)', 1, 4);
    }
  },

  orbs(g, t, c) {
    // the orb flies slowly with a fiery tail, then bursts (a 2-voxel hole)
    const fly = ease(t / 0.7), x = 30 + (84 - 30) * fly, burst = ease((t - 0.7) / 0.2);
    const hole = (cx, r) => (t > 0.7 && Math.hypot(cx - 0.5, r - 2) <= 1.6 ? 0 : 1);
    block(g, 84, 14, 4, 5, hole);
    ship(g, 22, 31.5, c);
    if (t < 0.7) {
      for (let k = 1; k < 10; k++) {
        const tx = x - k * 2.6, a = 1 - k / 10;
        g.fillStyle = `rgba(255,${Math.round(200 * a)},${Math.round(80 * a * a)},${a})`;
        g.beginPath(); g.arc(tx, 31.5 + Math.sin(k * 1.7 + t * 30) * 0.8, 2.6 * a + 0.5, 0, Math.PI * 2); g.fill();
      }
      glowDot(g, x, 31.5, 6 + Math.sin(t * 40) * 1.2, 'rgba(255,90,230,0.8)');
    } else if (burst < 1) glowDot(g, 87, 31.5, 6 + burst * 14, `rgba(255,90,230,${1 - burst})`);
  },

  splashers(g, t, c) {
    // a wobbling bubble flies to the block; where it lands the voxels soak, darken and are gone
    const fly = ease(t / 0.4), soak = ease((t - 0.42) / 0.5);
    const hitZone = (cx, r) => cx <= 1 && r >= 1 && r <= 3;
    block(g, 84, 14, 4, 5, (cx, r) => (hitZone(cx, r) && t > 0.42 ? 1 - soak : 1));
    if (t > 0.42 && soak < 1) {
      g.fillStyle = `rgba(90,170,255,${0.35 * (1 - soak)})`;
      g.fillRect(84, 14 + VOX, VOX * 2, VOX * 3);
    }
    ship(g, 22, 31.5, c);
    if (t < 0.42) {
      const x = 30 + (86 - 30) * fly, y = 31.5, R = 7;
      g.save();
      g.beginPath();
      for (let k = 0; k <= 24; k++) {
        const a = (k / 24) * Math.PI * 2, r = R * (1 + 0.1 * Math.sin(3 * a + t * 30) + 0.06 * Math.sin(5 * a - t * 20));
        if (k === 0) g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      g.closePath();
      g.fillStyle = 'rgba(120,190,255,0.25)';
      g.fill();
      g.strokeStyle = 'rgba(170,220,255,0.9)';
      g.lineWidth = 1.2;
      g.stroke();
      g.clip();
      // inside, the view turned upside down: a few stars and the ground line flipped
      g.fillStyle = 'rgba(111,164,82,0.6)';
      g.fillRect(x - R, y - 2, R * 2, 2);
      g.restore();
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.beginPath(); g.arc(x - 2.5, y - 2.5, 1.3, 0, Math.PI * 2); g.fill();
    }
  },

  bombers(g, t, c) {
    const fly = ease(t / 0.35), boom = ease((t - 0.35) / 0.15), hole = ease((t - 0.45) / 0.55);
    const gone = (cx, r) => (t > 0.38 && Math.hypot(cx - 0.5, r - 2) <= 2.6 ? 0 : 1);
    block(g, 80, 12, 5, 6, gone);
    if (t < 0.38) ship(g, 20 + (78 - 20) * fly, 32, c);
    if (boom > 0 && boom < 1) glowDot(g, 82, 32, 8 + boom * 22, `rgba(255,220,255,${1 - boom})`);
    if (hole > 0) {
      // a black hole: grows, stays, shrinks — a black disc in a thin bright ring
      const s = hole < 0.25 ? hole / 0.25 : hole > 0.75 ? (1 - hole) / 0.25 : 1;
      g.strokeStyle = `rgba(255,220,180,${0.8 * s})`;
      g.lineWidth = 1.2;
      g.beginPath(); g.arc(84, 32, 7 * s + 0.5, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#000';
      g.beginPath(); g.arc(84, 32, 6 * s, 0, Math.PI * 2); g.fill();
    }
  },

  drills(g, t, c) {
    // drills into a wall: a tunnel opens behind its turning spiral bit
    const x = 30 + 70 * ease(t / 0.85), y = 32;
    g.fillStyle = '#7a6a58';
    g.fillRect(60, 8, 60, 48);
    g.fillStyle = '#6fa452';
    g.fillRect(60, 8, 3, 48);
    g.fillStyle = BG;
    if (x > 56) g.fillRect(58, y - 4, x - 54, 8);
    ship(g, x - 4, y, c);
    // the bit: a cone with moving stripes
    g.save();
    g.translate(x + 2.5, y);
    g.fillStyle = '#ff9a2e';
    g.beginPath(); g.moveTo(0, -3); g.lineTo(7, 0); g.lineTo(0, 3); g.closePath(); g.fill();
    g.clip();
    g.strokeStyle = '#7a2c00';
    g.lineWidth = 1.2;
    for (let k = -2; k < 5; k++) { const sx = k * 2.4 + ((t * 40) % 2.4); g.beginPath(); g.moveTo(sx, -3); g.lineTo(sx + 2, 3); g.stroke(); }
    g.restore();
  },

  piercers(g, t, c) {
    // an orange beam along a line through the block, a yellow bolt winding round it
    const burn = ease((t - 0.1) / 0.7), on = t > 0.1 && t < 0.95;
    block(g, 76, 14, 5, 5, (cx, r) => (r === 2 ? 1 - ease(burn * 3 - cx * 0.5) : 1));
    ship(g, 18, 31.5, c);
    if (on) {
      glowLine(g, [25, 31.5, 114, 31.5], 'rgba(255,140,30,1)', 2.2, 7);
      const pts = [], ph = t * 30;
      for (let x = 25; x <= 114; x += 2) pts.push(x, 31.5 + Math.sin((x - 25) * 0.16 + ph) * 3.2 * Math.min(1, (x - 25) / 8));
      glowLine(g, pts, 'rgba(255,224,58,1)', 0.9, 6);
    }
  },

  snipers(g, t, c) {
    // charges (a glow at the nose), then the shot: a streak speeding up, a rounded hot cap in front
    const charge = ease(t / 0.45), fly = ease((t - 0.45) / 0.35);
    const hit = t > 0.8;
    block(g, 94, 18, 3, 4, (cx, r) => (cx === 0 && r === 1 && hit ? 0 : 1));
    ship(g, 16, 28.5, c);
    if (t < 0.45) glowDot(g, 24, 28.5, 1 + charge * 4, `rgba(47,224,192,${0.4 + charge * 0.5})`);
    if (t >= 0.45 && !hit) {
      const x = 26 + (94 - 26) * fly * fly; // speeding up
      const k = 1 + fly * 2;
      g.strokeStyle = 'rgba(255,154,60,0.45)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x - 6 - 6 * k, 28.5); g.lineTo(x - 4, 28.5); g.stroke();
      g.fillStyle = '#eaffff';
      g.fillRect(x - 5, 27.8, 5, 1.4);
      // the cap: a rounded glowing bow in front
      g.save();
      g.shadowColor = '#ff9a3c'; g.shadowBlur = 6;
      g.strokeStyle = 'rgba(255,200,140,0.95)';
      g.lineWidth = 1.4;
      g.beginPath(); g.ellipse(x, 28.5, 1.6 + k * 0.8, 2.6 + k * 0.6, 0, -Math.PI / 2, Math.PI / 2); g.stroke();
      g.restore();
    }
    if (hit && t < 0.95) glowDot(g, 97, 28.5, 4 + (t - 0.8) * 60, 'rgba(255,170,90,0.8)');
  },

  tugs(g, t, c) {
    // a tractor beam on a drifting piece, towing it home (to the left)
    const pull = ease((t - 0.2) / 0.8), px = 84 - 30 * pull;
    ship(g, 46 - 30 * pull, 32, c, Math.PI);
    const sx = 40 - 30 * pull;
    g.fillStyle = 'rgba(61,255,134,0.22)';
    g.beginPath(); g.moveTo(sx + 6, 32); g.lineTo(px, 22); g.lineTo(px + 18, 22); g.lineTo(px + 18, 42); g.lineTo(px, 42); g.closePath();
    if (t > 0.1) g.fill();
    block(g, px, 25, 2, 2, () => 1, '#7a6a58');
    voxel(g, px + 2 * VOX, 25 + VOX, 1, '#7a6a58');
    g.fillStyle = 'rgba(47,125,255,0.5)';
    g.beginPath(); g.arc(6, 32, 4, 0, Math.PI * 2); g.fill(); // the tunnel (home)
  },

  supports(g, t, c) {
    // a bolt jumping between your own ships
    const ships = [[16, 46], [44, 18], [70, 44], [98, 20]];
    block(g, 50, 30, 2, 2, (cx, r) => (t > 0.45 && cx === 0 ? 0 : 1));
    ships.forEach(([x, y], n) => ship(g, x, y, n === 0 ? c : '#ffd84a', 0, 11));
    const jumps = Math.min(3, Math.floor(t * 4.5));
    const seed = Math.floor(t * 12);
    for (let j = 0; j < jumps; j++) {
      const [x0, y0] = ships[j], [x1, y1] = ships[j + 1];
      glowLine(g, jag(x0, y0, x1, y1, 6, 6, seed + j * 11), 'rgba(223,232,255,1)', 1.3, 8);
    }
  },

  cutters(g, t, c) {
    // a flat red sheet from the ship to the block's face, as tall as the block: a ray along each edge,
    // haze drifting between them; the block is cut column by column, deeper over time
    const bx = 76, by = 10, rows = 6, cols = 5, sx = 22, sy = 31.5;
    const deep = Math.min(cols - 1, Math.floor(t * cols * 1.1));
    block(g, bx, by, cols, rows, (cx) => (cx < deep ? 0 : cx === deep ? 1 - ((t * cols * 1.1) % 1) * 0.8 : 1));
    ship(g, sx, sy, c);
    const fx = bx + deep * VOX, top = by, bot = by + rows * VOX;
    g.save();
    g.globalCompositeOperation = 'lighter';
    // the haze: a wedge from the ship to the cut, with drifting streaks
    g.beginPath(); g.moveTo(sx + 6, sy - 1); g.lineTo(fx, top); g.lineTo(fx, bot); g.lineTo(sx + 6, sy + 1); g.closePath();
    g.fillStyle = 'rgba(255,40,40,0.16)'; g.fill();
    g.clip();
    for (let k = 0; k < 7; k++) {
      const u = ((k / 7 + t * 1.4) % 1), x = sx + 6 + (fx - sx - 6) * u;
      g.fillStyle = `rgba(255,90,80,${0.25 * Math.sin(u * Math.PI)})`;
      g.fillRect(x - 3, 0, 6, H);
    }
    g.restore();
    glowLine(g, [[sx + 6, sy - 1], [fx, top]], 'rgba(255,60,60,1)', 1, 5);
    glowLine(g, [[sx + 6, sy + 1], [fx, bot]], 'rgba(255,60,60,1)', 1, 5);
    glowLine(g, [[fx, top], [fx, bot]], 'rgba(255,190,180,1)', 1.2, 6);
  },
  boosters(g, t, c) {
    // a pink ball of octagons round the booster; ships flying into it light up (+20% Power)
    const x = 60, y = 32, R = 22;
    const glow = g.createRadialGradient(x, y, R * 0.3, x, y, R);
    glow.addColorStop(0, 'rgba(255,80,170,0.05)');
    glow.addColorStop(0.85, 'rgba(255,110,190,0.18)');
    glow.addColorStop(1, 'rgba(255,180,225,0.55)');
    g.fillStyle = glow;
    g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.fill();
    // the octagon cells, turning slowly (seen from the side: squeezed towards the edge)
    g.save();
    g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.clip();
    const spin = t * 0.9;
    for (let row = -2; row <= 2; row++) for (let col = -3; col <= 3; col++) {
      const u = ((col * 0.42 + spin) % 2.94 + 2.94) % 2.94 - 1.47, v = row * 0.42;
      if (Math.abs(u) > 1.4) continue;
      const cx = x + Math.sin(u) * R, cy = y + Math.sin(v) * R, sx = Math.cos(u) * 7.5, sy = Math.cos(v) * 7.5;
      const shim = 0.45 + 0.35 * Math.sin(t * 6.28 * 2 + row * 1.7 + col * 2.3);
      g.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k + 0.5) * Math.PI / 4;
        g.lineTo(cx + Math.cos(a) * sx * 0.54, cy + Math.sin(a) * sy * 0.54);
      }
      g.closePath();
      g.strokeStyle = `rgba(255,179,224,${shim})`;
      g.lineWidth = 0.8;
      g.stroke();
    }
    g.restore();
    g.strokeStyle = 'rgba(255,190,230,0.8)';
    g.lineWidth = 1;
    g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.stroke();
    ship(g, x, y, c);
    // two eaters fly through it: inside the field they glow
    for (const [y0, dt] of [[18, 0], [46, 0.5]]) {
      const k = ((t + dt) % 1), sx = 4 + k * 112;
      const inside = Math.hypot(sx - x, y0 - y) < R;
      if (inside) glowDot(g, sx, y0, 6, 'rgba(255,120,200,0.5)');
      ship(g, sx, y0, inside ? '#fff1a0' : '#ffd84a', 0, 10);
    }
  },
  cleaners(g, t, c) {
    // a tiny piece drifting; the cleaner flies to it and eats it
    const fly = ease(t / 0.5), eat = ease((t - 0.55) / 0.3);
    const vx = 86 + Math.sin(t * 6) * 3, vy = 24 + t * 6;
    voxel(g, vx, vy, 1 - eat, '#7a6a58');
    ship(g, 20 + (vx - 30) * fly, 34 + (vy - 30) * fly, c, -0.12 * fly);
  },
  siphons(g, t, c) {
    // a floating blob of water droplets drawn in one after another, into the siphon's nose
    const sx = 30, sy = 34;
    for (let k = 0; k < 9; k++) {
      const a = k * 2.4, r = 5 + (k % 3) * 3;
      const bx = 88 + Math.cos(a) * r, by = 30 + Math.sin(a) * r * 0.8;
      const go = ease((t * 1.3 - k * 0.09)); // each droplet's turn
      if (go >= 1) continue;
      const x = bx + (sx + 7 - bx) * go * go, y = by + (sy - by) * go * go;
      glowDot(g, x, y, 3.2, 'rgba(90,160,255,0.5)');
      g.fillStyle = '#5aa0ff';
      g.beginPath(); g.arc(x, y, 2.2, 0, Math.PI * 2); g.fill();
    }
    ship(g, sx, sy, c, 0);
  },
};
