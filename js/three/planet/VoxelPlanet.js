import { PlanetSurface } from './PlanetSurface.js';
import { buildShape } from './shapes.js';
import { Fragments } from './Fragments.js';
import { BITE, NEIGHBORS } from './grid.js';
import { Look } from './look.js';
import { Eating } from './eating.js';
import { Search } from './search.js';
import { EatenRuns } from './runs.js';

const THREE = window.THREE;

export { BITE };

/**
 * A planet made of voxels. The outer layer has terrain colours (ocean, land, ice, clouds),
 * with rock underneath.
 *
 * Only exposed voxels (ones with an empty neighbour) are drawn — when the swarm eats
 * something, the neighbours underneath are added. This keeps small voxels affordable.
 *
 * `look.style` picks the graphics (physics and eating are always the voxels):
 * 'cubes' — the voxels themselves; 'smooth' / 'wedges' — see PlanetSurface.
 * `look.shape` picks which voxels are solid: 'sphere', 'cube', 'text' — see shapes.js.
 *
 * This file: building the grid, coordinates, what is solid, syncing and disposing. The rest is in
 * look.js (materials, colours, the drawn cubes), eating.js (bites, claims, removing voxels),
 * search.js (finding food, raycasts) and runs.js (eaten voxels for players who join late).
 */
export class VoxelPlanet {
  /**
   * @param {number} [seed] terrain seed — the same seed gives the same planet in every
   *   browser, which is how multiplayer guests build the host's planet
   * @param {{radius?:number, style?:'cubes'|'smooth'|'wedges', shape?:'sphere'|'cube'|'text', text?:string}} [look]
   *   size, shape and graphics of this planet
   */
  constructor(scene, cfg, seed, look = {}, fragmentCfg = null) {
    this.scene = scene;
    // a level may have its own look: `surface` (anything of planet.surface, its palette and clouds
    // too), `rock` and `rockCore` (the inside) — the rest comes from CONFIG.planet
    const ls = look.surface;
    this.cfg = ls || look.rock || look.rockCore ? {
      ...cfg,
      rock: look.rock || cfg.rock,
      rockCore: look.rockCore || cfg.rockCore,
      surface: { ...cfg.surface, ...ls, clouds: { ...cfg.surface.clouds, ...ls?.clouds }, palette: { ...cfg.surface.palette, ...ls?.palette } },
    } : cfg;
    this.s = cfg.voxelSize;
    this.style = look.style || 'cubes';
    this.seed = seed ?? ((Math.random() * 1e6) | 0);
    // (the seed also places a belt's asteroids: the same on every player's screen)
    const shape = buildShape({ ...look, radius: look.radius || cfg.radius, seed: this.seed }, this.s);
    this.shape = look.shape || 'sphere';
    // the grid: NX × NY × NZ voxels centred on the origin (a cube for most shapes; a belt is long and flat);
    // voxel (i, j, k)'s centre is ((i + 0.5)·s − HX, (j + 0.5)·s − HY, (k + 0.5)·s − HZ)
    [this.NX, this.NY, this.NZ] = shape.dims || [shape.N, shape.N, shape.N];
    [this.HX, this.HY, this.HZ] = [this.NX, this.NY, this.NZ].map((n) => (n * this.s) / 2);
    this.N = this.NX;           // (a cube's edge)
    this.half = Math.max(this.HX, this.HY, this.HZ); // half of the grid's longest edge
    this.R = shape.radius;      // what the swarm flies around on long trips (the sphere's radius)
    this.bound = shape.bound;   // a sphere containing the whole shape
    this.surfaceKind = shape.surface;
    this.tagColors = shape.colors;
    this.rocks = shape.rocks || 0;      // a belt: how many asteroids
    // liquid voxels (by shape tag → 'water' | 'lava'): when gone they are let loose as droplets (see remove, Liquids.js)
    this.liquidOf = look.liquids && shape.colors ? look.liquids : null;
    this.spills = []; // [kind, x, y, z] of liquid voxels gone since the game last took them
    // what kind each voxel is (shape tag → 'rock' | 'iron' | …; else all rock) and how many of each were eaten
    // (liquids and gas: not here — they are collected only when siphons and scoops take them in)
    this.kindOf = look.kinds && shape.colors ? look.kinds : null;
    this.collected = {};
    this.sizeScale = look.sizeScale ?? null; // the tunnels and camera × this (else from the size, see Game3D.fitToPlanet)
    this.parts = shape.parts || null; // several objects (each with its own terrain)
    this.fill = shape.fill;            // which voxels the planet started with (for eatenRuns)
    this.alive = true;
    this.fragments = null; // set at the end (pieces bitten off — Fragments.js)
    this.log = null; // multiplayer host: indices of removed voxels since the last network update

    const NX = this.NX, NY = this.NY, NZ = this.NZ, n3 = NX * NY * NZ;
    this.hp = new Float32Array(n3);
    // voxel colours, computed when first needed
    this.colors = new Uint8Array(n3 * 3);
    this.colored = new Uint8Array(n3);
    this.slotOf = new Int32Array(n3).fill(-1);
    // how many units have claimed this voxel to eat
    this.claims = new Uint16Array(n3);
    // shape tag of each solid voxel (the text's letter number, for its colour)
    this.tags = shape.colors ? new (shape.colors.length > 256 ? Uint16Array : Uint8Array)(n3) : null;

    let total = 0;
    for (let k = 0; k < NZ; k++) {
      for (let j = 0; j < NY; j++) {
        for (let i = 0; i < NX; i++) {
          const tag = shape.fill(i, j, k);
          if (tag) {
            const idx = (k * NY + j) * NX + i;
            this.hp[idx] = cfg.strength;
            if (this.tags) this.tags[idx] = tag;
            total++;
          }
        }
      }
    }
    this.total = total;
    this.left = total;

    this.geometry = new THREE.BoxGeometry(this.s, this.s, this.s);
    this.material = this.createMaterial();
    this.capacity = 0;
    this.count = 0;
    this.createMesh(Math.max(1024, Math.ceil(total * 0.25)));

    this._v = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._c = new THREE.Color();
    for (let idx = 0; idx < n3; idx++) {
      if (this.hp[idx] > 0 && this.isExposed(idx)) this.addInstance(idx);
    }
    this.dirty = true;

    if (this.style !== 'cubes') {
      this.surfaceMaterial = this.createSurfaceMaterial();
      this.surface = new PlanetSurface(this, this.style, this.surfaceMaterial);
      // the smooth surface replaces the cubes; wedges are added to them
      if (this.style === 'smooth') this.mesh.visible = false;
    }
    // pieces bitten off the rest drift away (see Fragments.js)
    this.fragments = fragmentCfg ? new Fragments(this, fragmentCfg) : null;

  }

  coords(idx) {
    const NX = this.NX;
    return [idx % NX, ((idx / NX) | 0) % this.NY, (idx / (NX * this.NY)) | 0];
  }

  index(i, j, k) {
    if (i < 0 || j < 0 || k < 0 || i >= this.NX || j >= this.NY || k >= this.NZ) return -1;
    return (k * this.NY + j) * this.NX + i;
  }

  isExposed(idx) {
    const [i, j, k] = this.coords(idx);
    for (const [a, b, c] of NEIGHBORS) {
      const n = this.index(i + a, j + b, k + c);
      if (n < 0 || this.hp[n] <= 0) return true;
    }
    return false;
  }

  /** Centre of a voxel — where it is now (a voxel of a drifting fragment moves with it). */
  cellCenter(idx, out) {
    const fr = this.fragments;
    if (fr !== null) {
      if (fr.has(idx)) return fr.worldCenter(idx, out);
      if (idx === fr.lastIdx && this.hp[idx] <= 0) return out.copy(fr.lastPos); // just eaten off a fragment
    }
    return this.gridCenter(idx, out);
  }

  /** Centre of a voxel's place in the grid (where it was built). */
  gridCenter(idx, out) {
    const [i, j, k] = this.coords(idx);
    const s = this.s;
    return out.set((i + 0.5) * s - this.HX, (j + 0.5) * s - this.HY, (k + 0.5) * s - this.HZ);
  }

  /** Index of the voxel at a point (object with x, y, z), or -1. */
  cellAt(p) {
    const s = this.s;
    return this.index(Math.floor((p.x + this.HX) / s), Math.floor((p.y + this.HY) / s), Math.floor((p.z + this.HZ) / s));
  }

  isSolid(p) {
    const idx = this.cellAt(p);
    return idx >= 0 && this.hp[idx] > 0;
  }

  /** Is the voxel still there to eat (in place or on a drifting fragment)? */
  solid(idx) {
    return idx >= 0 && (this.hp[idx] > 0 || (this.fragments !== null && this.fragments.has(idx)));
  }

  /** Strength left in a voxel (in place or on a fragment). */
  strengthOf(idx) {
    if (idx < 0) return 0;
    return this.hp[idx] > 0 ? this.hp[idx] : this.fragments?.has(idx) ? this.fragments.hpOf(idx) : 0;
  }

  sync() {
    this.surface?.sync();
    if (!this.dirty) return;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.dirty = false;
  }

  dispose() {
    this.fragments?.disposeAll();
    this.surface?.dispose();
    this.surfaceMaterial?.dispose();
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}

for (const part of [Look, Eating, Search, EatenRuns]) {
  Object.defineProperties(VoxelPlanet.prototype, Object.getOwnPropertyDescriptors(part));
}
