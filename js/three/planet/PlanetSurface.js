const THREE = window.THREE;

/**
 * Extra planet graphics built from the voxel grid, for the levels that test new looks.
 * Physics and eating stay on the voxels (cubes); this only changes what is drawn.
 *
 * The grid is split into chunks of `CHUNK` (16) voxels per axis. Eating a voxel marks the chunks
 * around it dirty; `sync()` rebuilds a few dirty chunks per frame.
 *
 * Styles (a "builder" fills one chunk's geometry):
 *  - 'smooth' — a smooth surface over the voxels (surface nets: one vertex per grid cell
 *    that the surface crosses, placed at the average of the crossings). Steps become slopes,
 *    corners round off. The cubes are hidden.
 *  - 'wedges' — the cubes stay, and empty step cells get low-poly wedges: a ramp next to one
 *    solid side, an inner corner next to two, an outer corner next to a solid diagonal.
 *
 * To add a new look: write a builder (planet, chunk ranges, out arrays) and register it in
 * BUILDERS, then use its name as `style` in CONFIG.levels.
 */

const CHUNK = 16;

export class PlanetSurface {
  /**
   * @param {VoxelPlanet} planet
   * @param {'smooth'|'wedges'} style
   * @param {THREE.Material} material vertex-coloured material
   * @param {number} [chunk] chunk size in voxels (a small grid — a fragment — fits in one)
   */
  constructor(planet, style, material, chunk = CHUNK) {
    this.chunk = chunk;
    this.planet = planet;
    this.style = style;
    this.build = BUILDERS[style];
    this.material = material;
    this.group = new THREE.Group();
    planet.scene.add(this.group);
    // edges of cells (smooth) go from voxel -1 to N-1, so chunks cover N+1 positions (per axis: a
    // belt's grid is long and flat; a fragment's small grid has only N)
    const [NX, NY, NZ] = dimsOf(planet);
    this.CI = Math.ceil((NX + 1) / chunk);
    this.CJ = Math.ceil((NY + 1) / chunk);
    this.CK = Math.ceil((NZ + 1) / chunk);
    this.meshes = new Map(); // chunk key → mesh
    this.dirty = new Set();
    this.budgetMs = 3; // time per frame for rebuilding chunks (at least one is rebuilt)
    for (let k = 0; k < this.CK; k++) for (let j = 0; j < this.CJ; j++) for (let i = 0; i < this.CI; i++) {
      this.rebuild(i, j, k);
    }
  }

  key(i, j, k) {
    return (k * this.CJ + j) * this.CI + i;
  }

  /** A voxel changed: its chunk and the neighbouring ones it touches need rebuilding. */
  touch(vi, vj, vk) {
    const lo = (v) => Math.max(0, Math.floor(v / this.chunk));
    const hi = (v, C) => Math.min(C - 1, Math.floor((v + 2) / this.chunk));
    for (let k = lo(vk); k <= hi(vk, this.CK); k++) for (let j = lo(vj); j <= hi(vj, this.CJ); j++) for (let i = lo(vi); i <= hi(vi, this.CI); i++) {
      this.dirty.add(this.key(i, j, k));
    }
  }

  /** Rebuilds dirty chunks for up to `budgetMs` this frame (all of them with `all`). */
  sync(all = false) {
    const t0 = performance.now();
    let n = 0;
    for (const key of this.dirty) {
      if (!all && n > 0 && performance.now() - t0 > this.budgetMs) break;
      this.dirty.delete(key);
      const i = key % this.CI, j = ((key / this.CI) | 0) % this.CJ, k = (key / (this.CI * this.CJ)) | 0;
      this.rebuild(i, j, k);
      n++;
    }
  }

  rebuild(i, j, k) {
    const key = this.key(i, j, k);
    const out = { pos: [], nrm: [], col: [], idx: [] };
    // chunk ranges in voxel coordinates (cell origins), -1 .. N-1
    const r0 = (c) => c * this.chunk - 1;
    this.build(this.planet, r0(i), r0(j), r0(k), this.chunk, out);
    const old = this.meshes.get(key);
    if (old) {
      this.group.remove(old);
      old.geometry.dispose();
      this.meshes.delete(key);
    }
    if (out.pos.length === 0) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(out.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
    if (out.idx.length) g.setIndex(out.idx);
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, this.material);
    this.group.add(mesh);
    this.meshes.set(key, mesh);
  }

  /** Number of triangles drawn (for tests). */
  get triangles() {
    let n = 0;
    for (const m of this.meshes.values()) {
      const g = m.geometry;
      n += (g.index ? g.index.count : g.attributes.position.count) / 3;
    }
    return n;
  }

  clear() {
    for (const m of this.meshes.values()) m.geometry.dispose();
    this.meshes.clear();
    this.dirty.clear();
    this.group.clear();
  }

  dispose() {
    this.clear();
    this.planet.scene.remove(this.group);
  }
}

// --- smooth: surface nets -------------------------------------------------------------

const CORNERS = [];
for (let c = 0; c < 8; c++) CORNERS.push([c & 1, (c >> 1) & 1, (c >> 2) & 1]);
const EDGES = [];
for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) {
  const d = (a ^ b);
  if (d === 1 || d === 2 || d === 4) EDGES.push([a, b]);
}
// the same as flat arrays (the inner loops below run for every surface cell)
const CX = Int8Array.from(CORNERS, (c) => c[0]), CY = Int8Array.from(CORNERS, (c) => c[1]), CZ = Int8Array.from(CORNERS, (c) => c[2]);
const EA = Int8Array.from(EDGES, (e) => e[0]), EB = Int8Array.from(EDGES, (e) => e[1]);

/** Grid size per axis: [NX, NY, NZ] (a fragment's small grid: N each). */
function dimsOf(planet) {
  return planet.NX ? [planet.NX, planet.NY, planet.NZ] : [planet.N, planet.N, planet.N];
}

/** Half the grid's size per axis (voxel i's centre on x is (i + 0.5)·s − HX). */
function halfsOf(planet) {
  return planet.NX ? [planet.HX, planet.HY, planet.HZ] : [planet.half, planet.half, planet.half];
}

function buildSmooth(planet, x0, y0, z0, size, out) {
  const { hp, s } = planet, [NX, NY, NZ] = dimsOf(planet), [HX, HY, HZ] = halfsOf(planet);
  const strength = planet.cfg.strength;
  // density of a voxel: 0 empty; 0.5 … 1 solid, by how much strength is left — so a voxel being
  // eaten (or weakened by lightning) sinks smoothly into the surface before it disappears.
  // Read once per chunk into a block covering voxels x0-1 … x0+size (what its cells and edges touch).
  const B = size + 2;
  const block = new Float32Array(B * B * B);
  for (let k = 0; k < B; k++) for (let j = 0; j < B; j++) for (let i = 0; i < B; i++) {
    const vi = x0 - 1 + i, vj = y0 - 1 + j, vk = z0 - 1 + k;
    if (vi < 0 || vj < 0 || vk < 0 || vi >= NX || vj >= NY || vk >= NZ) continue;
    const h = hp[(vk * NY + vj) * NX + vi];
    if (h > 0) block[(k * B + j) * B + i] = 0.5 + 0.5 * Math.min(1, h / strength);
  }
  // cells (cubes between voxel centres) this chunk needs: its own plus one before on each axis
  const W = size + 1;
  const vert = new Int32Array(W * W * W).fill(-1);
  const cellKey = (ci, cj, ck) => ((ck - z0 + 1) * W + (cj - y0 + 1)) * W + (ci - x0 + 1);
  const corner = new Float32Array(8);
  const col = [0, 0, 0];

  const colors = planet.colors;
  const vertexAt = (ci, cj, ck) => {
    const kk = cellKey(ci, cj, ck);
    if (vert[kk] !== -1) return vert[kk];
    let mask = 0;
    // the cell's 8 corners in the block: (ci, cj, ck) + (a, b, d)
    const base = ((ck - z0 + 1) * B + (cj - y0 + 1)) * B + (ci - x0 + 1);
    for (let c = 0; c < 8; c++) {
      corner[c] = block[base + (CZ[c] * B + CY[c]) * B + CX[c]];
      if (corner[c] > 0) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) { vert[kk] = -2; return -2; }
    // average of the edge crossings of the 0.5 level (the middle of the edge for full-strength voxels)
    let px = 0, py = 0, pz = 0, n = 0;
    for (let e = 0; e < EA.length; e++) {
      const a = EA[e], b = EB[e];
      const fa = corner[a], fb = corner[b];
      if ((fa > 0) === (fb > 0)) continue;
      const t = (0.5 - fa) / (fb - fa);
      px += CX[a] + (CX[b] - CX[a]) * t;
      py += CY[a] + (CY[b] - CY[a]) * t;
      pz += CZ[a] + (CZ[b] - CZ[a]) * t;
      n++;
    }
    px /= n; py /= n; pz /= n;
    // normal from the density's gradient (pointing to the empty side), so chunks join without seams;
    // colour: the solid voxels around, darker the weaker they are
    let gx = 0, gy = 0, gz = 0;
    col[0] = col[1] = col[2] = 0;
    let solids = 0;
    for (let c = 0; c < 8; c++) {
      const a = CX[c], b = CY[c], d = CZ[c];
      const w = 1 - 2 * corner[c];
      gx += w * (a ? 1 : -1); gy += w * (b ? 1 : -1); gz += w * (d ? 1 : -1);
      if (corner[c] > 0) {
        const o = planet.colorOffset(((ck + d) * NY + (cj + b)) * NX + (ci + a));
        const dark = 0.35 + 0.65 * (corner[c] - 0.5) * 2;
        col[0] += (colors[o] / 255) * dark; col[1] += (colors[o + 1] / 255) * dark; col[2] += (colors[o + 2] / 255) * dark;
        solids++;
      }
    }
    // world position: voxel centre of index i is (i + 0.5) * s - half
    const wx = (ci + 0.5 + px) * s - HX, wy = (cj + 0.5 + py) * s - HY, wz = (ck + 0.5 + pz) * s - HZ;
    let gl = Math.hypot(gx, gy, gz);
    if (gl < 1e-6) { gx = wx; gy = wy; gz = wz; gl = Math.hypot(wx, wy, wz) || 1; }
    // several objects: on a sphere, tilt the normal towards that sphere's own centre — the same
    // smooth day/night shading single spheres get from their material
    if (planet.parts) {
      const part = planet.partAt(wx, wy, wz);
      if (part.kind === 'sphere') {
        const rx = wx - part.center[0], ry = wy - part.center[1], rz = wz - part.center[2];
        const rl = Math.hypot(rx, ry, rz) || 1, k = planet.cfg.sphereShading;
        gx = (gx / gl) * (1 - k) + (rx / rl) * k; gy = (gy / gl) * (1 - k) + (ry / rl) * k; gz = (gz / gl) * (1 - k) + (rz / rl) * k;
        gl = Math.hypot(gx, gy, gz) || 1;
      }
    }
    const v = out.pos.length / 3;
    out.pos.push(wx, wy, wz);
    out.nrm.push(gx / gl, gy / gl, gz / gl);
    out.col.push(col[0] / solids, col[1] / solids, col[2] / solids);
    vert[kk] = v;
    return v;
  };

  // one quad for every grid edge (between two voxel centres) where solid meets empty;
  // edges owned by this chunk start at voxels x0..x0+size-1
  for (let k = z0; k < z0 + size; k++) for (let j = y0; j < y0 + size; j++) for (let i = x0; i < x0 + size; i++) {
    const at = ((k - z0 + 1) * B + (j - y0 + 1)) * B + (i - x0 + 1);
    const a = block[at] > 0 ? 1 : 0;
    for (let axis = 0; axis < 3; axis++) {
      const b = block[at + (axis === 0 ? 1 : axis === 1 ? B : B * B)] > 0 ? 1 : 0;
      if (a === b) continue;
      // the four cells around this edge
      let v0, v1, v2, v3;
      if (axis === 0) {
        v0 = vertexAt(i, j - 1, k - 1); v1 = vertexAt(i, j, k - 1); v2 = vertexAt(i, j, k); v3 = vertexAt(i, j - 1, k);
      } else if (axis === 1) {
        v0 = vertexAt(i - 1, j, k - 1); v1 = vertexAt(i - 1, j, k); v2 = vertexAt(i, j, k); v3 = vertexAt(i, j, k - 1);
      } else {
        v0 = vertexAt(i - 1, j - 1, k); v1 = vertexAt(i, j - 1, k); v2 = vertexAt(i, j, k); v3 = vertexAt(i - 1, j, k);
      }
      if (v0 < 0 || v1 < 0 || v2 < 0 || v3 < 0) continue;
      // face outwards (towards the empty side)
      if (a) out.idx.push(v0, v1, v2, v0, v2, v3);
      else out.idx.push(v0, v2, v1, v0, v3, v2);
    }
  }
}

// --- wedges: low-poly fills in empty step cells -----------------------------------------

// Shapes in local cell coordinates (a, b, u) ∈ [0,1]³; u = 0 is the side of the solid
// voxel below, +a / +b point to the solid neighbour(s). Triangles as [a,b,u] triples.
// `inside` is a point inside the filled volume: every face is turned away from it.
const RAMP = { // fill under u = a (solid at +a)
  inside: [0.8, 0.5, 0.2],
  tris: [
    [[0, 0, 0], [1, 0, 1], [1, 1, 1]], [[0, 0, 0], [1, 1, 1], [0, 1, 0]], // slope
    [[0, 0, 0], [1, 0, 0], [1, 0, 1]], [[0, 1, 0], [1, 1, 1], [1, 1, 0]], // end caps
  ],
};
const INNER = { // fill under u = max(a, b) (solid at +a and +b)
  inside: [0.7, 0.7, 0.3],
  tris: [
    [[0, 0, 0], [1, 0, 1], [1, 1, 1]], [[0, 0, 0], [1, 1, 1], [0, 1, 1]], // two slopes
    [[0, 0, 0], [0, 1, 1], [0, 1, 0]], [[0, 0, 0], [1, 0, 0], [1, 0, 1]], // caps
  ],
};
const OUTER = { // fill under u = a + b - 1 (solid only at the +a+b diagonal)
  inside: [0.85, 0.85, 0.2],
  tris: [
    [[1, 0, 0], [1, 1, 1], [0, 1, 0]], // slope
    [[1, 0, 0], [1, 1, 0], [1, 1, 1]], [[0, 1, 0], [1, 1, 1], [1, 1, 0]], // caps
  ],
};

function buildWedges(planet, x0, y0, z0, size, out) {
  const { hp, s } = planet, [NX, NY, NZ] = dimsOf(planet), [HX, HY, HZ] = halfsOf(planet);
  const solid = (i, j, k) => i >= 0 && j >= 0 && k >= 0 && i < NX && j < NY && k < NZ && hp[(k * NY + j) * NX + i] > 0;
  const lo = Math.max(0, x0), loJ = Math.max(0, y0), loK = Math.max(0, z0);
  const e = [0, 0, 0];
  const add = (shape, origin, up, ax, bx, sa, sb, color) => {
    // local (a, b, u) → world: origin + a·A + b·B + u·U, with A/B/U unit axes and signs
    const toWorld = ([a, b, u]) => {
      e[0] = e[1] = e[2] = 0;
      e[ax] = sa > 0 ? a : 1 - a;
      e[bx] = sb > 0 ? b : 1 - b;
      e[up.axis] = up.sign > 0 ? u : 1 - u;
      return [(origin[0] + e[0]) * s - HX, (origin[1] + e[1]) * s - HY, (origin[2] + e[2]) * s - HZ];
    };
    const [cx, cy, cz] = toWorld(shape.inside);
    for (const tri of shape.tris) {
      const p = tri.map(toWorld);
      // flat normal, turned outwards
      const ux = p[1][0] - p[0][0], uy = p[1][1] - p[0][1], uz = p[1][2] - p[0][2];
      const vx = p[2][0] - p[0][0], vy = p[2][1] - p[0][1], vz = p[2][2] - p[0][2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      // a normal pointing towards the inside point would face inwards
      const flip = nx * (cx - p[0][0]) + ny * (cy - p[0][1]) + nz * (cz - p[0][2]) > 0;
      const order = flip ? [0, 2, 1] : [0, 1, 2];
      for (const o of order) {
        out.pos.push(p[o][0], p[o][1], p[o][2]);
        out.nrm.push(flip ? -nx : nx, flip ? -ny : ny, flip ? -nz : nz);
        out.col.push(color[0], color[1], color[2]);
      }
    }
  };

  for (let k = loK; k < Math.min(NZ, z0 + size); k++) for (let j = loJ; j < Math.min(NY, y0 + size); j++) for (let i = lo; i < Math.min(NX, x0 + size); i++) {
    if (hp[(k * NY + j) * NX + i] > 0) continue;
    // "down" = the axis pointing most towards the planet centre
    const cx = i + 0.5 - NX / 2, cy = j + 0.5 - NY / 2, cz = k + 0.5 - NZ / 2;
    const ab = [Math.abs(cx), Math.abs(cy), Math.abs(cz)];
    const axis = ab[0] >= ab[1] && ab[0] >= ab[2] ? 0 : ab[1] >= ab[2] ? 1 : 2;
    const sign = [cx, cy, cz][axis] >= 0 ? 1 : -1; // up = away from the centre
    const c = [i, j, k];
    const at = (d0, d1, d2) => solid(i + d0, j + d1, k + d2);
    const below = [0, 0, 0];
    below[axis] = -sign;
    if (!at(...below)) continue;
    const below3 = c.map((v, n) => v + below[n]);
    const color = planet.voxelColor((below3[2] * NY + below3[1]) * NX + below3[0]);
    const [ax, bx] = [0, 1, 2].filter((n) => n !== axis);
    const side = (n, sg) => { const d = [0, 0, 0]; d[n] = sg; return at(...d); };
    const diag = (sa, sb) => { const d = [0, 0, 0]; d[ax] = sa; d[bx] = sb; return at(...d); };
    const up = { axis, sign };
    const sides = [[ax, 1], [ax, -1], [bx, 1], [bx, -1]].filter(([n, sg]) => side(n, sg));
    if (sides.length === 1) {
      // ramp rising towards the solid side; the other horizontal axis spans the cell
      const [n, sg] = sides[0];
      const other = n === ax ? bx : ax;
      add(RAMP, c, up, n, other, sg, 1, color);
    } else if (sides.length === 2 && sides[0][0] !== sides[1][0]) {
      const sa = sides.find(([n]) => n === ax)[1], sb = sides.find(([n]) => n === bx)[1];
      add(INNER, c, up, ax, bx, sa, sb, color);
    } else if (sides.length === 0) {
      for (const [sa, sb] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        if (diag(sa, sb)) add(OUTER, c, up, ax, bx, sa, sb, color);
      }
    }
  }
}

const BUILDERS = { smooth: buildSmooth, wedges: buildWedges };
