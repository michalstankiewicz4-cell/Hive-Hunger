const THREE = window.THREE;

/**
 * Extra planet graphics built from the voxel grid, for the levels that test new looks.
 * Physics and eating stay on the voxels (cubes); this only changes what is drawn.
 *
 * The grid is split into chunks of `CHUNK` voxels per axis. Eating a voxel marks the chunks
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
// 'smoother': how far a voxel's own state keeps the blurred field from the 0.5 level
const KEEP = 0.04;

export class PlanetSurface {
  /**
   * @param {VoxelPlanet} planet
   * @param {'smooth'|'wedges'} style
   * @param {THREE.Material} material vertex-coloured material
   */
  constructor(planet, style, material) {
    this.planet = planet;
    this.style = style;
    this.build = BUILDERS[style];
    this.material = material;
    this.group = new THREE.Group();
    planet.scene.add(this.group);
    // edges of cells (smooth) go from voxel -1 to N-1, so chunks cover N+1 positions
    this.C = Math.ceil((planet.N + 1) / CHUNK);
    this.meshes = new Map(); // chunk key → mesh
    this.dirty = new Set();
    this.budgetMs = 3; // time per frame for rebuilding chunks (at least one is rebuilt)
    for (let k = 0; k < this.C; k++) for (let j = 0; j < this.C; j++) for (let i = 0; i < this.C; i++) {
      this.rebuild(i, j, k);
    }
  }

  key(i, j, k) {
    return (k * this.C + j) * this.C + i;
  }

  /** A voxel changed: its chunk and the neighbouring ones it touches need rebuilding. */
  touch(vi, vj, vk) {
    // chunk c draws cells c·CHUNK−1 … c·CHUNK+CHUNK−2. A voxel changes the cells around it:
    // ±1 for 'smooth'; for 'smoother' the blur and the normals reach 3 voxels away
    const reach = this.style === 'smoother' ? 3 : 1;
    const lo = (v) => Math.max(0, Math.floor((v - reach + 1) / CHUNK));
    const hi = (v) => Math.min(this.C - 1, Math.floor((v + reach + 1) / CHUNK));
    for (let k = lo(vk); k <= hi(vk); k++) for (let j = lo(vj); j <= hi(vj); j++) for (let i = lo(vi); i <= hi(vi); i++) {
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
      const i = key % this.C, j = ((key / this.C) | 0) % this.C, k = (key / (this.C * this.C)) | 0;
      this.rebuild(i, j, k);
      n++;
    }
  }

  rebuild(i, j, k) {
    const key = this.key(i, j, k);
    const out = { pos: [], nrm: [], col: [], idx: [] };
    // chunk ranges in voxel coordinates (cell origins), -1 .. N-1
    const r0 = (c) => c * CHUNK - 1;
    this.build(this.planet, r0(i), r0(j), r0(k), CHUNK, out);
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

function buildSmooth(planet, x0, y0, z0, size, out, blur = false) {
  const { N, hp, s } = planet, R = planet.half;
  const strength = planet.cfg.strength;
  // density of a voxel: 0 empty; 0.5 … 1 solid, by how much strength is left — so a voxel being
  // eaten (or weakened by lightning) sinks smoothly into the surface before it disappears.
  // Read once per chunk into a block covering voxels x0-1 … x0+size (what its cells and edges touch).
  const B = size + 2;
  const block = new Float32Array(B * B * B);
  for (let k = 0; k < B; k++) for (let j = 0; j < B; j++) for (let i = 0; i < B; i++) {
    const vi = x0 - 1 + i, vj = y0 - 1 + j, vk = z0 - 1 + k;
    if (vi < 0 || vj < 0 || vk < 0 || vi >= N || vj >= N || vk >= N) continue;
    const h = hp[(vk * N + vj) * N + vi];
    if (h > 0) block[(k * B + j) * B + i] = 0.5 + 0.5 * Math.min(1, h / strength);
  }
  // 'smoother': each voxel's (strength-weighted) occupancy averaged over its 3×3×3 neighbourhood,
  // so the 0.5 level crosses the edges at varying points — slopes without the terraces.
  // Which side of the level a voxel is on still follows the voxel itself (see KEEP).
  // field read by the mesher: `F` voxels per axis starting at x0 - `off`
  let field = block, F = B, off = 1;
  if (blur) {
    // occupancy (strength-weighted) of voxels x0-3 … x0+size+2, read once
    const B3 = size + 6;
    const occ = new Float32Array(B3 * B3 * B3);
    let any = false, all = true;
    for (let k = 0; k < B3; k++) for (let j = 0; j < B3; j++) for (let i = 0; i < B3; i++) {
      const vi = x0 - 3 + i, vj = y0 - 3 + j, vk = z0 - 3 + k;
      let o = 0;
      if (vi >= 0 && vj >= 0 && vk >= 0 && vi < N && vj < N && vk < N) {
        const h = hp[(vk * N + vj) * N + vi];
        if (h > 0) o = Math.min(1, h / strength);
      }
      occ[(k * B3 + j) * B3 + i] = o;
      if (o > 0) any = true; else all = false;
    }
    if (!any || all) return; // all empty or all solid: no surface in this chunk
    // blurred field for voxels x0-2 … x0+size+1 (one more than the cells need, for the normals)
    F = size + 4; off = 2;
    field = new Float32Array(F * F * F);
    const W1 = [1, 2, 1];
    for (let k = 0; k < F; k++) for (let j = 0; j < F; j++) for (let i = 0; i < F; i++) {
      let sum = 0;
      for (let c = 0; c < 3; c++) for (let b = 0; b < 3; b++) {
        const row = ((k + c) * B3 + (j + b)) * B3 + i, w = W1[c] * W1[b];
        sum += w * (occ[row] + 2 * occ[row + 1] + occ[row + 2]);
      }
      // the average only shapes the slopes; whether there is surface is still up to the voxel
      // itself — a solid voxel stays inside (≥ 0.5 + KEEP), an empty one outside — so nothing the
      // swarm can eat is hidden and nothing eaten stays drawn
      const own = occ[((k + 1) * B3 + (j + 1)) * B3 + i + 1];
      const v = sum / 64;
      field[(k * F + j) * F + i] = own > 0 ? Math.max(v, 0.5 + KEEP) : Math.min(v, 0.5 - KEEP);
    }
  }
  const density = (i, j, k) => field[((k - z0 + off) * F + (j - y0 + off)) * F + (i - x0 + off)];
  const solid = (i, j, k) => (density(i, j, k) >= 0.5 ? 1 : 0);
  // cells (cubes between voxel centres) this chunk needs: its own plus one before on each axis
  const W = size + 1;
  const vert = new Int32Array(W * W * W).fill(-1);
  const cellKey = (ci, cj, ck) => ((ck - z0 + 1) * W + (cj - y0 + 1)) * W + (ci - x0 + 1);
  const corner = new Float32Array(8);
  const col = [0, 0, 0];

  const vertexAt = (ci, cj, ck) => {
    const kk = cellKey(ci, cj, ck);
    if (vert[kk] !== -1) return vert[kk];
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      const [a, b, d] = CORNERS[c];
      corner[c] = density(ci + a, cj + b, ck + d);
      if (corner[c] >= 0.5) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) { vert[kk] = -2; return -2; }
    // average of the edge crossings of the 0.5 level (the middle of the edge for full-strength voxels)
    let px = 0, py = 0, pz = 0, n = 0;
    for (const [a, b] of EDGES) {
      const fa = corner[a], fb = corner[b];
      if ((fa >= 0.5) === (fb >= 0.5)) continue;
      const t = (0.5 - fa) / (fb - fa);
      px += CORNERS[a][0] + (CORNERS[b][0] - CORNERS[a][0]) * t;
      py += CORNERS[a][1] + (CORNERS[b][1] - CORNERS[a][1]) * t;
      pz += CORNERS[a][2] + (CORNERS[b][2] - CORNERS[a][2]) * t;
      n++;
    }
    px /= n; py /= n; pz /= n;
    // normal from the density's gradient (pointing to the empty side), so chunks join without seams;
    // colour: the solid voxels around, darker the weaker they are
    let gx = 0, gy = 0, gz = 0;
    col[0] = col[1] = col[2] = 0;
    let solids = 0;
    for (let c = 0; c < 8; c++) {
      const [a, b, d] = CORNERS[c];
      if (blur) {
        // smoother normals: the field's central-difference gradient at each corner, blended by
        // where the vertex sits in the cell (no light banding on gentle slopes)
        const vi = ci + a, vj = cj + b, vk = ck + d;
        const w = (a ? px : 1 - px) * (b ? py : 1 - py) * (d ? pz : 1 - pz);
        gx -= w * (density(vi + 1, vj, vk) - density(vi - 1, vj, vk));
        gy -= w * (density(vi, vj + 1, vk) - density(vi, vj - 1, vk));
        gz -= w * (density(vi, vj, vk + 1) - density(vi, vj, vk - 1));
      } else {
        const w = 1 - 2 * corner[c];
        gx += w * (a ? 1 : -1); gy += w * (b ? 1 : -1); gz += w * (d ? 1 : -1);
      }
      if (corner[c] >= 0.5) {
        const vIdx = (ck + d) * N * N + (cj + b) * N + (ci + a);
        const rgb = planet.voxelColor(vIdx);
        // weaker voxels are darker (blurred field: from the voxel's own strength)
        const f = blur ? Math.min(1, Math.max(0, hp[vIdx] / strength)) : (corner[c] - 0.5) * 2;
        const dark = 0.35 + 0.65 * f;
        col[0] += rgb[0] * dark; col[1] += rgb[1] * dark; col[2] += rgb[2] * dark;
        solids++;
      }
    }
    // world position: voxel centre of index i is (i + 0.5) * s - half
    const wx = (ci + 0.5 + px) * s - R, wy = (cj + 0.5 + py) * s - R, wz = (ck + 0.5 + pz) * s - R;
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
    const a = solid(i, j, k);
    for (let axis = 0; axis < 3; axis++) {
      const b = axis === 0 ? solid(i + 1, j, k) : axis === 1 ? solid(i, j + 1, k) : solid(i, j, k + 1);
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
  const { N, hp, s } = planet, R = planet.half;
  const solid = (i, j, k) => i >= 0 && j >= 0 && k >= 0 && i < N && j < N && k < N && hp[(k * N + j) * N + i] > 0;
  const lo = Math.max(0, x0), loJ = Math.max(0, y0), loK = Math.max(0, z0);
  const e = [0, 0, 0];
  const add = (shape, origin, up, ax, bx, sa, sb, color) => {
    // local (a, b, u) → world: origin + a·A + b·B + u·U, with A/B/U unit axes and signs
    const toWorld = ([a, b, u]) => {
      e[0] = e[1] = e[2] = 0;
      e[ax] = sa > 0 ? a : 1 - a;
      e[bx] = sb > 0 ? b : 1 - b;
      e[up.axis] = up.sign > 0 ? u : 1 - u;
      return [(origin[0] + e[0]) * s - R, (origin[1] + e[1]) * s - R, (origin[2] + e[2]) * s - R];
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

  for (let k = loK; k < Math.min(N, z0 + size); k++) for (let j = loJ; j < Math.min(N, y0 + size); j++) for (let i = lo; i < Math.min(N, x0 + size); i++) {
    if (hp[(k * N + j) * N + i] > 0) continue;
    // "down" = the axis pointing most towards the planet centre
    const cx = i + 0.5 - N / 2, cy = j + 0.5 - N / 2, cz = k + 0.5 - N / 2;
    const ab = [Math.abs(cx), Math.abs(cy), Math.abs(cz)];
    const axis = ab[0] >= ab[1] && ab[0] >= ab[2] ? 0 : ab[1] >= ab[2] ? 1 : 2;
    const sign = [cx, cy, cz][axis] >= 0 ? 1 : -1; // up = away from the centre
    const c = [i, j, k];
    const at = (d0, d1, d2) => solid(i + d0, j + d1, k + d2);
    const below = [0, 0, 0];
    below[axis] = -sign;
    if (!at(...below)) continue;
    const below3 = c.map((v, n) => v + below[n]);
    const color = planet.voxelColor((below3[2] * N + below3[1]) * N + below3[0]);
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

const BUILDERS = {
  smooth: buildSmooth,
  smoother: (planet, x0, y0, z0, size, out) => buildSmooth(planet, x0, y0, z0, size, out, true),
  wedges: buildWedges,
};
