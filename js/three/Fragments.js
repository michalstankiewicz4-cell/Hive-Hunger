import { PlanetSurface } from './PlanetSurface.js';

const THREE = window.THREE;
const HASH = 8; // cell size of the fragments' spatial hash (world units)
const NEIGHBORS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/**
 * Pieces bitten off a planet. When eating splits a body of voxels into parts, every part that
 * is smaller than the rest comes loose: it becomes a fragment that gently drifts away from the
 * centre and turns. Its voxels keep their indices, so the swarm can still claim, chase, land on
 * and eat them like any other voxel (same points); units can't fly through a fragment.
 *
 * A fragment's voxels are taken out of the planet's static grid (hp 0 there, so collisions,
 * the planet surface and its instancing ignore them); their strength lives in the fragment's own
 * small grid, which is also what its smooth surface is built from (PlanetSurface on a
 * planet-like object). World position of a voxel = fragment position + rotation × (its original
 * position − the fragment's original centre).
 *
 * Splits are found on the host (or in single player) with an interleaved flood fill from the
 * neighbours of the voxels eaten this frame: fills that meet are merged; a fill that runs out
 * while another is still growing is a part smaller than the rest. Guests get fragments from
 * the host (`create` with the same id, cells and motion).
 */
export class Fragments {
  /** @param {import('./VoxelPlanet.js').VoxelPlanet} planet */
  constructor(planet, cfg) {
    this.planet = planet;
    this.cfg = cfg;
    this.list = [];
    this.byId = new Map();
    this.fragOf = new Int32Array(planet.hp.length).fill(-1); // voxel → fragment id (-1: none)
    this.removed = [];           // static voxels eaten since the last check
    this.detect = true;          // host / single player; guests receive fragments
    this.nextId = 1;
    this.onCreate = null;        // (fragment) => void — the host sends it to the guests
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    // scratch for the flood fill
    this.mark = new Int32Array(planet.hp.length);
    this.stamp = 0;
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this.lastIdx = -1;
    this.lastPos = new THREE.Vector3();
    // where the fragments are: cells of HASH units → fragments overlapping them (rebuilt every
    // frame), so a unit only looks at the fragments next to it
    this.hash = new Map();
    this.seen = 0;
  }

  hashKey(x, y, z) {
    return ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);
  }

  /** Calls fn(f) once for every fragment whose bounds reach the box around p ± r. */
  near(p, r, fn) {
    const seen = ++this.seen;
    const x0 = Math.floor((p.x - r) / HASH), x1 = Math.floor((p.x + r) / HASH);
    const y0 = Math.floor((p.y - r) / HASH), y1 = Math.floor((p.y + r) / HASH);
    const z0 = Math.floor((p.z - r) / HASH), z1 = Math.floor((p.z + r) / HASH);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      const list = this.hash.get(this.hashKey(x, y, z));
      if (!list) continue;
      for (const f of list) {
        if (f.seen === seen || f.dead) continue;
        f.seen = seen;
        fn(f);
      }
    }
  }

  rehash() {
    this.hash.clear();
    for (const f of this.list) this.insert(f);
  }

  insert(f) {
    {
      const r = f.radius;
      const x0 = Math.floor((f.pos.x - r) / HASH), x1 = Math.floor((f.pos.x + r) / HASH);
      const y0 = Math.floor((f.pos.y - r) / HASH), y1 = Math.floor((f.pos.y + r) / HASH);
      const z0 = Math.floor((f.pos.z - r) / HASH), z1 = Math.floor((f.pos.z + r) / HASH);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
        const key = this.hashKey(x, y, z);
        const list = this.hash.get(key);
        if (list) list.push(f); else this.hash.set(key, [f]);
      }
    }
  }

  /** A random reachable fragment voxel (for searches far from the swarm), or -1. */
  randomVoxel() {
    if (this.list.length === 0) return -1;
    const f = this.list[(Math.random() * this.list.length) | 0];
    const ex = f.exposed; // may hold a voxel eaten a moment ago — callers check
    return ex.length ? ex[(Math.random() * ex.length) | 0] : -1;
  }

  get any() {
    return this.list.length > 0;
  }

  has(idx) {
    return idx >= 0 && this.fragOf[idx] >= 0;
  }

  /** A static voxel was eaten: the body it belonged to may now be in pieces. */
  noteRemoved(idx) {
    if (this.detect) this.removed.push(idx);
  }

  // --- finding splits ---

  /**
   * Voxels eaten since the last check, in connected clusters: the solid neighbours of one
   * cluster all belonged to one body (through the cluster), so only they are compared —
   * bodies that were apart from the start (the boxes, the letters) never are.
   */
  findSplits() {
    if (this.removed.length === 0) return;
    const pl = this.planet, hp = pl.hp;
    const left = new Set(this.removed);
    this.removed.length = 0;
    for (const start of [...left]) {
      if (!left.has(start)) continue;
      left.delete(start);
      const cluster = [start], cands = new Set();
      for (let q = 0; q < cluster.length; q++) {
        const [i, j, k] = pl.coords(cluster[q]);
        for (const [a, b, c] of NEIGHBORS) {
          const n = pl.index(i + a, j + b, k + c);
          if (n < 0) continue;
          if (left.has(n)) { left.delete(n); cluster.push(n); } else if (hp[n] > 0) cands.add(n);
        }
      }
      this.splitFrom(cands);
    }
  }

  /**
   * Flood fills from every candidate at once, one voxel per fill in turn; fills that touch
   * merge. When at most one fill is still growing, every fill that ran out is a closed part
   * smaller than the rest — it comes loose. If all of them ran out, the biggest stays (and
   * parts of equal biggest size all stay). Gives up after `cfg.maxSteps` voxels (no split).
   */
  splitFrom(cands) {
    if (cands.size < 2) return;
    const pl = this.planet, hp = pl.hp, N = pl.N;
    const stamp = ++this.stamp, mark = this.mark;
    this.groupOf ||= new Int32Array(hp.length);
    const groupOf = this.groupOf;
    const groups = []; // { cells, pending, head, parent, done }
    const root = (g) => { while (groups[g].parent !== g) g = groups[g].parent; return g; };
    for (const c of cands) {
      if (mark[c] === stamp) continue;
      mark[c] = stamp;
      groupOf[c] = groups.length;
      groups.push({ cells: [c], pending: [c], head: 0, parent: groups.length, done: false });
    }
    let active = groups.length, steps = 0;
    while (active > 1) {
      for (let g = 0; g < groups.length && active > 1; g++) {
        const G = groups[g];
        if (G.parent !== g || G.done) continue;
        if (G.head >= G.pending.length) { G.done = true; active--; continue; }
        const v = G.pending[G.head++];
        const i = v % N, j = ((v / N) | 0) % N, k = (v / (N * N)) | 0;
        for (const [a, b, c] of NEIGHBORS) {
          const ni = i + a, nj = j + b, nk = k + c;
          if (ni < 0 || nj < 0 || nk < 0 || ni >= N || nj >= N || nk >= N) continue;
          const n = (nk * N + nj) * N + ni;
          if (hp[n] <= 0) continue;
          if (mark[n] !== stamp) {
            mark[n] = stamp; groupOf[n] = g; G.cells.push(n); G.pending.push(n);
            continue;
          }
          const r = root(groupOf[n]);
          if (r === g) continue;
          // two fills met: one part (a fill that ran out can't be met — it has seen all its neighbours)
          const R = groups[r];
          for (const x of R.cells) G.cells.push(x);
          for (let q = R.head; q < R.pending.length; q++) G.pending.push(R.pending[q]);
          R.parent = g; R.cells = null; R.pending = null;
          active--;
        }
        if (++steps > this.cfg.maxSteps) return;
      }
    }
    let closed = groups.filter((G, g) => G.parent === g && (G.done || G.head >= G.pending.length));
    const open = groups.filter((G, g) => G.parent === g && !(G.done || G.head >= G.pending.length));
    if (open.length === 0) {
      const biggest = Math.max(...closed.map((G) => G.cells.length));
      closed = closed.filter((G) => G.cells.length < biggest);
    }
    for (const G of closed) this.create(G.cells);
  }

  // --- fragments ---

  /**
   * Turns `cells` (static voxel indices) into a drifting fragment. On a guest `id` and the
   * motion come from the host.
   */
  create(cells, id = this.nextId++, motion = null) {
    const pl = this.planet, N = pl.N, s = pl.s;
    cells = Array.from(cells).filter((c) => pl.hp[c] > 0 && this.fragOf[c] < 0);
    if (cells.length === 0) return null;
    this.nextId = Math.max(this.nextId, id + 1);
    // bounding box in grid coordinates, the original centre
    let i0 = N, j0 = N, k0 = N, i1 = 0, j1 = 0, k1 = 0, cx = 0, cy = 0, cz = 0;
    const v = this._v;
    for (const c of cells) {
      const [i, j, k] = pl.coords(c);
      i0 = Math.min(i0, i); j0 = Math.min(j0, j); k0 = Math.min(k0, k);
      i1 = Math.max(i1, i); j1 = Math.max(j1, j); k1 = Math.max(k1, k);
      pl.gridCenter(c, v); cx += v.x; cy += v.y; cz += v.z;
    }
    const pivot = motion ? new THREE.Vector3().fromArray(motion.pivot) : new THREE.Vector3(cx / cells.length, cy / cells.length, cz / cells.length);
    // the fragment's own small grid (a cube with a margin of 1), strength per voxel
    const M = Math.max(i1 - i0, j1 - j0, k1 - k0) + 3;
    const g0 = [i0 - 1, j0 - 1, k0 - 1];
    const local = {
      N: M, s, half: (M * s) / 2, cfg: pl.cfg, parts: null,
      hp: new Float32Array(M * M * M),
      orig: new Int32Array(M * M * M).fill(-1),
      voxelColor: (li) => pl.voxelColor(local.orig[li]),
      scene: null,
    };
    let radius = 0;
    for (const c of cells) {
      const [i, j, k] = pl.coords(c);
      const li = ((k - g0[2]) * M + (j - g0[1])) * M + (i - g0[0]);
      pl.voxelColor(c); // cache the colour while the voxel is still in place
      local.hp[li] = pl.hp[c];
      local.orig[li] = c;
      this.fragOf[c] = id;
      pl.gridCenter(c, v);
      radius = Math.max(radius, v.distanceTo(pivot));
    }
    for (const c of cells) pl.detach(c); // out of the static grid (not eaten)

    const f = {
      id, cells, count: cells.length, local, g0, M, pivot, radius: radius + s,
      pos: pivot.clone(), quat: new THREE.Quaternion(), vel: new THREE.Vector3(), spin: new THREE.Vector3(),
      exposed: [], exposedDirty: false, exp: new Uint8Array(M * M * M),
      group: new THREE.Group(), inner: new THREE.Group(),
    };
    // reachable voxels (an empty neighbour): a flag per local cell and a list, kept up to date as it is eaten
    for (let li = 0; li < local.hp.length; li++) {
      if (local.hp[li] > 0 && this.isOpen(f, li)) { f.exp[li] = 1; f.exposed.push(local.orig[li]); }
    }
    if (motion) {
      f.pos.fromArray(motion.pos); f.quat.fromArray(motion.quat); f.vel.fromArray(motion.vel); f.spin.fromArray(motion.spin);
    } else {
      // a gentle push away from the planet's centre, a little sideways, and a slow turn
      const out = pivot.clone();
      if (out.lengthSq() < 1e-6) out.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
      out.normalize();
      const rnd = () => (Math.random() - 0.5) * 2;
      f.vel.copy(out).multiplyScalar(this.cfg.drift).add(new THREE.Vector3(rnd(), rnd(), rnd()).multiplyScalar(this.cfg.drift * 0.4));
      f.spin.set(rnd(), rnd(), rnd()).normalize().multiplyScalar(this.cfg.spin * (0.5 + Math.random()));
    }
    // local grid cell li's centre is (li + 0.5)·s − half; shift so it lands at original − pivot
    f.inner.position.set(g0[0] * s - pl.half + local.half - pivot.x, g0[1] * s - pl.half + local.half - pivot.y, g0[2] * s - pl.half + local.half - pivot.z);
    f.group.add(f.inner);
    local.scene = f.inner;
    f.surface = new PlanetSurface(local, 'smooth', this.material, Math.min(16, M + 1));
    pl.scene.add(f.group);
    this.applyTransform(f);
    this.list.push(f);
    this.byId.set(id, f);
    this.insert(f);
    this.onCreate?.(f, cells);
    return f;
  }

  localIndex(f, idx) {
    const [i, j, k] = this.planet.coords(idx);
    return ((k - f.g0[2]) * f.M + (j - f.g0[1])) * f.M + (i - f.g0[0]);
  }

  hpOf(idx) {
    const f = this.byId.get(this.fragOf[idx]);
    return f ? f.local.hp[this.localIndex(f, idx)] : 0;
  }

  /** World centre of a fragment voxel. */
  worldCenter(idx, out) {
    const f = this.byId.get(this.fragOf[idx]);
    this.planet.gridCenter(idx, out).sub(f.pivot).applyQuaternion(f.quat).add(f.pos);
    return out;
  }

  /** Takes strength off a fragment voxel; returns true when it is gone (eaten). */
  bite(idx, amount) {
    const f = this.byId.get(this.fragOf[idx]);
    if (!f) return false;
    const li = this.localIndex(f, idx);
    f.local.hp[li] -= amount;
    const [i, j, k] = this.planet.coords(idx);
    f.surface.touch(i - f.g0[0], j - f.g0[1], k - f.g0[2]);
    if (f.local.hp[li] > 0) return false;
    this.removeVoxel(f, idx, li);
    return true;
  }

  /** A fragment voxel is eaten (here or, on a guest, reported by the host). */
  eat(idx) {
    const f = this.byId.get(this.fragOf[idx]);
    if (!f) return false;
    const li = this.localIndex(f, idx);
    this.removeVoxel(f, idx, li);
    return true;
  }

  removeVoxel(f, idx, li) {
    // remember where it was, so the debris of an eaten voxel appears there (see VoxelPlanet.cellCenter)
    this.worldCenter(idx, this.lastPos);
    this.lastIdx = idx;
    f.local.hp[li] = 0;
    this.fragOf[idx] = -1;
    f.count--;
    // eaten: out of the reachable list; its neighbours become reachable
    f.exp[li] = 0;
    f.exposedDirty = true;
    const M = f.M, hp = f.local.hp;
    const li0 = li % M, lj0 = ((li / M) | 0) % M, lk0 = (li / (M * M)) | 0;
    for (const [a, b, c] of NEIGHBORS) {
      const n = ((lk0 + c) * M + (lj0 + b)) * M + (li0 + a);
      if (hp[n] > 0 && !f.exp[n]) { f.exp[n] = 1; f.exposed.push(f.local.orig[n]); }
    }
    const [i, j, k] = this.planet.coords(idx);
    f.surface.touch(i - f.g0[0], j - f.g0[1], k - f.g0[2]);
    if (f.count <= 0) this.dispose(f);
  }

  /** The fragment's voxels still there (not eaten yet). */
  cellsOf(f) {
    return f.cells.filter((c) => this.fragOf[c] === f.id);
  }

  /** Fragment voxels with an empty neighbour (what the swarm can reach). */
  exposedOf(f) {
    if (f.exposedDirty) {
      f.exposed = f.exposed.filter((c) => this.fragOf[c] === f.id);
      f.exposedDirty = false;
    }
    return f.exposed;
  }

  /** Has local cell li an empty neighbour? (cells on the grid's margin are always empty) */
  isOpen(f, li) {
    const M = f.M, hp = f.local.hp;
    const i = li % M, j = ((li / M) | 0) % M, k = (li / (M * M)) | 0;
    for (const [a, b, c] of NEIGHBORS) if (hp[((k + c) * M + (j + b)) * M + (i + a)] <= 0) return true;
    return false;
  }

  /** Adds the reachable fragment voxels within `r` of point `p` to `out`. */
  exposedNear(p, r, out) {
    const v = this._w || (this._w = new THREE.Vector3()), q = this._q2 || (this._q2 = new THREE.Quaternion());
    const pl = this.planet, s = pl.s;
    this.near(p, r, (f) => {
      const dx = p.x - f.pos.x, dy = p.y - f.pos.y, dz = p.z - f.pos.z;
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) > r + f.radius) return;
      // the point in the fragment's own grid (turning keeps distances), then a scan like the planet's
      v.set(dx, dy, dz).applyQuaternion(q.copy(f.quat).invert()).add(f.pivot);
      const M = f.M;
      const ci = (v.x + pl.half) / s - f.g0[0], cj = (v.y + pl.half) / s - f.g0[1], ck = (v.z + pl.half) / s - f.g0[2];
      const rv = r / s, rv2 = rv * rv;
      const i0 = Math.max(0, Math.floor(ci - rv)), i1 = Math.min(M - 1, Math.floor(ci + rv));
      const j0 = Math.max(0, Math.floor(cj - rv)), j1 = Math.min(M - 1, Math.floor(cj + rv));
      const k0 = Math.max(0, Math.floor(ck - rv)), k1 = Math.min(M - 1, Math.floor(ck + rv));
      for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const di = i + 0.5 - ci, dj = j + 0.5 - cj, dk = k + 0.5 - ck;
        if (di * di + dj * dj + dk * dk > rv2) continue;
        const li = (k * M + j) * M + i;
        if (f.exp[li]) out.push(f.local.orig[li]);
      }
    });
  }

  /** The fragment voxel at point `p`, or -1 (units can't fly through fragments). */
  at(p) {
    if (this.list.length === 0) return -1;
    const list = this.hash.get(this.hashKey(Math.floor(p.x / HASH), Math.floor(p.y / HASH), Math.floor(p.z / HASH)));
    if (!list) return -1;
    const pl = this.planet, v = this._v, q = this._q;
    for (const f of list) {
      if (f.dead) continue;
      const dx = p.x - f.pos.x, dy = p.y - f.pos.y, dz = p.z - f.pos.z;
      if (dx * dx + dy * dy + dz * dz > f.radius * f.radius) continue;
      v.set(dx, dy, dz).applyQuaternion(q.copy(f.quat).invert()).add(f.pivot);
      const idx = pl.cellAt(v);
      if (idx >= 0 && this.fragOf[idx] === f.id && f.local.hp[this.localIndex(f, idx)] > 0) return idx;
    }
    return -1;
  }

  // --- every frame ---

  /** Drift and turn (both on the host and on guests), find new splits, rebuild surfaces. */
  step(moving) {
    if (moving) {
      const c = this.cfg, q = this._q, axis = this._v;
      for (const f of this.list) {
        f.pos.add(f.vel);
        f.vel.multiplyScalar(c.damping);
        const a = f.spin.length();
        if (a > 1e-7) {
          q.setFromAxisAngle(axis.copy(f.spin).divideScalar(a), a);
          f.quat.premultiply(q).normalize();
        }
        f.spin.multiplyScalar(c.spinDamping);
        this.applyTransform(f);
      }
      this.rehash();
      this.findSplits();
    }
    for (const f of this.list) f.surface.sync();
  }

  applyTransform(f) {
    f.group.position.copy(f.pos);
    f.group.quaternion.copy(f.quat);
  }

  /** Motion of every fragment, for guests to stay in step: [[id, px, py, pz, qx, qy, qz, qw], …] */
  motions() {
    return this.list.map((f) => [f.id, ...f.pos.toArray(), ...f.quat.toArray()].map((x, n) => (n ? Math.round(x * 1e4) / 1e4 : x)));
  }

  /** Guest: correct fragment positions from the host. */
  applyMotions(list) {
    for (const [id, px, py, pz, qx, qy, qz, qw] of list) {
      const f = this.byId.get(id);
      if (!f) continue;
      f.pos.set(px, py, pz);
      f.quat.set(qx, qy, qz, qw);
      this.applyTransform(f);
    }
  }

  dispose(f) {
    f.dead = true;
    f.surface.dispose();
    this.planet.scene.remove(f.group);
    this.list = this.list.filter((x) => x !== f);
    this.byId.delete(f.id);
    for (const c of f.cells) if (this.fragOf[c] === f.id) this.fragOf[c] = -1;
  }

  /** Removes every fragment (the planet is finished). */
  clear() {
    for (const f of [...this.list]) this.dispose(f);
    this.removed.length = 0;
  }

  disposeAll() {
    this.clear();
    this.material.dispose();
  }
}
