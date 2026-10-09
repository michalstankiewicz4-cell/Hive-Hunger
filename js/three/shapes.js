/**
 * Shapes of a "planet" for the levels: which voxels of the grid are solid.
 *
 * buildShape(look, voxelSize) returns
 *   N        grid size in voxels per axis (the grid is a cube, centred on the origin)
 *   half     half of the grid's edge in world units (voxel i's centre is (i + 0.5)·s − half)
 *   radius   the radius the swarm flies around on long trips (keeps paths off the shape)
 *   bound    radius of a sphere that contains the whole shape (clicks, ray casts)
 *   surface  'sphere' | 'cube' | 'none' — how terrain colours are laid on (see VoxelPlanet)
 *   fill(i, j, k) → 0 empty, otherwise a tag ≥ 1 (the text uses it for the letter's colour)
 *   colors   for tags (text only): [r, g, b] 0..255 per tag
 *
 * To add a shape: add a case here and use its name as `shape` in CONFIG.levels.
 */
export function buildShape(look, s) {
  const shape = look.shape || 'sphere';
  if (shape === 'cube') return cube(look.radius, s);
  if (shape === 'text') return text(look, s);
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

// 5 × 7 pixel letters, top row first
const FONT = {
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  V: ['10001', '10001', '10001', '10001', '01010', '01010', '00100'],
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
