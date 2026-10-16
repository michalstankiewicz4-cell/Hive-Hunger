/**
 * Shapes of a "planet" for the levels: which voxels of the grid are solid.
 *
 * buildShape(look, voxelSize) returns
 *   N        grid size in voxels per axis (the grid is a cube, centred on the origin)
 *   half     half of the grid's edge in world units (voxel i's centre is (i + 0.5)·s − half)
 *   radius   the radius the swarm flies around on long trips (keeps paths off the shape)
 *   bound    radius of a sphere that contains the whole shape (clicks, ray casts)
 *   surface  'sphere' | 'cube' | 'parts' | 'none' — how terrain colours are laid on (see VoxelPlanet)
 *   parts    ('parts' only) [{kind: 'sphere' | 'cube', center: [x, y, z], r}] — each part gets its own terrain
 *   fill(i, j, k) → 0 empty, otherwise a tag ≥ 1 (the text uses it for the letter's colour)
 *   colors   for tags (text, boxes): [r, g, b] 0..255 per tag
 *
 * To add a shape: add a case here and use its name as `shape` in CONFIG.levels.
 */
export function buildShape(look, s) {
  const shape = look.shape || 'sphere';
  if (shape === 'cube') return cube(look.radius, s);
  if (shape === 'text') return text(look, s);
  if (shape === 'pair') return pair(look.radius, look.gap ?? 10, s);
  if (shape === 'boxes') return boxes(look.max ?? 4, look.gap ?? 5, s);
  if (shape === 'belt') return belt(look, s);
  return sphere(look.radius, s);
}

function sphere(radius, s) {
  const Rv = Math.round(radius / s);
  const N = Rv * 2;
  return {
    N, half: Rv * s, radius, bound: radius, surface: 'sphere',
    fill(i, j, k) {
      const x = i + 0.5 - Rv, y = j + 0.5 - Rv, z = k + 0.5 - Rv;
      return x * x + y * y + z * z <= Rv * Rv ? 1 : 0;
    },
  };
}

/** A cube with half-edge `radius`: the sphere of the same radius would just fit inside. */
function cube(radius, s) {
  const Rv = Math.round(radius / s);
  const N = Rv * 2;
  return { N, half: Rv * s, radius, bound: radius * Math.sqrt(3), surface: 'cube', fill: () => 1 };
}

/**
 * Two objects side by side along x: a sphere (left) and a cube (right), both of `radius`
 * (the cube's half-edge), `gap` voxels apart.
 */
function pair(radius, gap, s) {
  const Rv = Math.round(radius / s);
  const W = 4 * Rv + gap;
  const N = (W + 4) & ~1;
  const x0 = (N - W) >> 1, mid = N >> 1;
  const half = (N * s) / 2;
  const sx = x0 + Rv;                 // sphere centre (voxel units)
  const cx0 = x0 + 2 * Rv + gap;      // cube's first column
  const parts = [
    { kind: 'sphere', center: [sx * s - half, mid * s - half, mid * s - half], r: Rv * s },
    { kind: 'cube', center: [(cx0 + Rv) * s - half, mid * s - half, mid * s - half], r: Rv * s },
  ];
  return {
    N, half, radius: Rv * s, bound: (W * s) / 2 + Rv * s, surface: 'parts', parts,
    fill(i, j, k) {
      const x = i + 0.5 - sx, y = j + 0.5 - mid, z = k + 0.5 - mid;
      if (x * x + y * y + z * z <= Rv * Rv) return 1;
      return i >= cx0 && i < cx0 + 2 * Rv && Math.abs(j + 0.5 - mid) <= Rv && Math.abs(k + 0.5 - mid) <= Rv ? 1 : 0;
    },
  };
}

/**
 * Every box shape from 1×1×1 to max×max×max voxels once — no rotated copies: each is placed as
 * width ≥ height ≥ depth (x ≥ y ≥ z). One row per depth z = 1 … max (top → bottom), boxes in a
 * row from the smallest, `gap` voxels apart and standing on the row's base line; the rows are
 * `gap` apart too. Facing the starting camera; each box has its own colour.
 */
function boxes(max, gap, s) {
  const rows = [];
  for (let z = 1; z <= max; z++) {
    const row = [];
    for (let y = z; y <= max; y++) for (let x = y; x <= max; x++) row.push([x, y, z]);
    rows.push(row);
  }
  const rowWidth = (row) => row.reduce((w, [x]) => w + x, 0) + (row.length - 1) * gap;
  const W = Math.max(...rows.map(rowWidth));
  const H = rows.length * max + (rows.length - 1) * gap;
  const N = (Math.max(W, H) + 6) & ~1;
  const mid = N >> 1, x0 = (N - W) >> 1, top = ((N + H) >> 1);
  const tags = new Uint8Array(N * N * N);
  const colors = [null];
  const count = rows.reduce((n, r) => n + r.length, 0);
  let tag = 0;
  rows.forEach((row, r) => {
    const base = top - r * (max + gap) - max; // the row's lowest voxel (y)
    let i0 = x0 + ((W - rowWidth(row)) >> 1);
    for (const [x, y, z] of row) {
      tag++;
      colors.push(hsl((tag - 1) / count, 0.7, 0.55));
      const k0 = mid - 2;
      for (let k = k0; k < k0 + z; k++) for (let j = base; j < base + y; j++) for (let i = i0; i < i0 + x; i++) {
        tags[(k * N + j) * N + i] = tag;
      }
      i0 += x + gap;
    }
  });
  return {
    N, half: (N * s) / 2, radius: 2 * s, bound: (Math.hypot(W, H, max) * s) / 2, surface: 'none', colors,
    fill: (i, j, k) => tags[(k * N + j) * N + i],
  };
}

/**
 * A belt of small asteroids: `count` irregular rocks (each two or three overlapping balls, `minSize` …
 * `maxSize` voxels across) in a flat ring round the centre — between `inner` and `outer` × the radius,
 * up to `thick` / 2 voxels above and below, the ring tilted by `tilt` radians — never touching each other. Placed from the seed (the same
 * belt for every player); every rock has its own colour from `colors`, a little lighter or darker.
 */
function belt(look, s) {
  const rnd = mulberry32((look.seed ?? 1) + 7919);
  const R = look.radius / s; // voxels
  const inner = R * (look.inner ?? 0.55), outer = R * (look.outer ?? 0.95), thick = look.thick ?? 6;
  const minSize = look.minSize ?? 2, maxSize = look.maxSize ?? 6, tilt = look.tilt ?? 0;
  const N = (Math.ceil(outer + maxSize) * 2 + 4) & ~1, mid = N / 2;
  const palette = look.colors || [[150, 140, 130]];
  const rocks = [];
  for (let tries = 0; rocks.length < (look.count ?? 60) && tries < 20000; tries++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(inner * inner + rnd() * (outer * outer - inner * inner));
    const size = minSize + rnd() * (maxSize - minSize), rad = size / 2;
    // in the ring's plane, then the ring tilted by `tilt` (towards the starting camera) so it isn't seen edge-on
    const fx = Math.cos(a) * r, fz = Math.sin(a) * r, fy = (rnd() - 0.5) * thick, ct = Math.cos(tilt), st = Math.sin(tilt);
    const cx = fx, cy = fy * ct - fz * st, cz = fy * st + fz * ct;
    if (rocks.some((q) => Math.hypot(q.x - cx, q.y - cy, q.z - cz) < q.rad + rad + 3)) continue; // apart
    // two or three balls, the extra ones smaller and off the centre: a lumpy rock
    const balls = [[cx, cy, cz, rad]];
    const extra = 1 + (rnd() < 0.5 ? 1 : 0);
    for (let e = 0; e < extra; e++) {
      const u = rnd() * 2 - 1, t = rnd() * Math.PI * 2, q = Math.sqrt(1 - u * u), d = rad * (0.35 + rnd() * 0.3);
      balls.push([cx + q * Math.cos(t) * d, cy + u * d, cz + q * Math.sin(t) * d, rad * (0.55 + rnd() * 0.3)]);
    }
    rocks.push({ x: cx, y: cy, z: cz, rad: rad * 1.3, balls });
  }
  const tags = new Uint8Array(N * N * N);
  const colors = [null];
  rocks.forEach((rock, n) => {
    const base = palette[n % palette.length], shade = 0.85 + rnd() * 0.3;
    colors.push(base.map((c) => Math.max(0, Math.min(255, Math.round(c * shade)))));
    for (const [bx, by, bz, br] of rock.balls) {
      const r2 = Math.max(1, br * br);
      const i0 = Math.floor(bx + mid - br - 1), i1 = Math.ceil(bx + mid + br + 1);
      const j0 = Math.floor(by + mid - br - 1), j1 = Math.ceil(by + mid + br + 1);
      const k0 = Math.floor(bz + mid - br - 1), k1 = Math.ceil(bz + mid + br + 1);
      for (let k = Math.max(0, k0); k <= Math.min(N - 1, k1); k++) for (let j = Math.max(0, j0); j <= Math.min(N - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(N - 1, i1); i++) {
        const x = i + 0.5 - mid - bx, y = j + 0.5 - mid - by, z = k + 0.5 - mid - bz;
        if (x * x + y * y + z * z <= r2) tags[(k * N + j) * N + i] = n + 1;
      }
    }
  });
  return {
    N, half: (N * s) / 2, radius: 2 * s, bound: (outer + maxSize) * s, surface: 'none', colors, rocks: rocks.length,
    fill: (i, j, k) => tags[(k * N + j) * N + i],
  };
}

/** A small seeded random generator (0 ≤ x < 1). */
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hsl(h, sat, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12, a = sat * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

// 5 × 7 pixel letters, top row first. Pixels of a letter must touch by a side (not only by a
// corner) — the smooth surface would otherwise split the letter into pieces.
const FONT = {
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  S: ['11111', '10000', '10000', '11111', '00001', '00001', '11111'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  V: ['10001', '10001', '10001', '11011', '01010', '01110', '00100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

/**
 * Text made of voxel letters, facing the starting camera (+z), read along +x. Every letter
 * gets the next colour from `look.colors`. `pixel` = voxels per font pixel, `depth` = thickness.
 */
function text(look, s) {
  const str = (look.text || 'TEST').toUpperCase();
  const px = look.pixel || 3, depth = look.depth || 10;
  const cols = str.length * 6 - 1, rows = 7;
  const W = cols * px, H = rows * px, D = depth;
  const N = (Math.max(W, H, D) + 4) & ~1;
  const x0 = (N - W) >> 1, y0 = (N - H) >> 1, z0 = (N - D) >> 1;
  const palette = look.colors || [[255, 90, 90]];
  // letter number (1-based, skipping spaces) for every font column
  const tagOfCol = new Int16Array(cols);
  let letter = 0;
  for (let c = 0; c < str.length; c++) {
    const ch = FONT[str[c]] ? str[c] : ' ';
    if (ch !== ' ') letter++;
    for (let x = 0; x < 5; x++) tagOfCol[c * 6 + x] = ch === ' ' ? 0 : letter;
  }
  const colors = [null];
  for (let n = 0; n < letter; n++) colors.push(palette[n % palette.length]);
  return {
    N, half: (N * s) / 2, radius: (D * s) / 2, bound: (Math.hypot(W, H, D) * s) / 2, surface: 'none', colors,
    fill(i, j, k) {
      const x = i - x0, y = j - y0, z = k - z0;
      if (x < 0 || y < 0 || z < 0 || x >= W || y >= H || z >= D) return 0;
      const col = (x / px) | 0, row = rows - 1 - ((y / px) | 0); // +y is up, font rows go down
      const c = (col / 6) | 0, cx = col % 6;
      if (cx === 5) return 0; // gap between letters
      const ch = FONT[str[c]] || FONT[' '];
      return ch[row][cx] === '1' ? tagOfCol[col] : 0;
    },
  };
}
