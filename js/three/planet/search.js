const THREE = window.THREE;

/**
 * Finding things: exposed voxels near a point, the nearest free voxel, matter for the swarm's brain,
 * the voxel under a ray.
 * (Part of VoxelPlanet: these become its methods.)
 */
export const Search = {
  /**
   * All exposed (visible) voxels within a sphere of radius `r` around a point.
   * Results go into the `out` array (cleared first); returns its length.
   */
  exposedNear(p, r, out) {
    out.length = 0;
    if (!this.alive) return 0;
    const s = this.s;
    const ci = (p.x + this.HX) / s, cj = (p.y + this.HY) / s, ck = (p.z + this.HZ) / s;
    const rv = r / s, rv2 = rv * rv;
    const i0 = Math.max(0, Math.floor(ci - rv)), i1 = Math.min(this.NX - 1, Math.floor(ci + rv));
    const j0 = Math.max(0, Math.floor(cj - rv)), j1 = Math.min(this.NY - 1, Math.floor(cj + rv));
    const k0 = Math.max(0, Math.floor(ck - rv)), k1 = Math.min(this.NZ - 1, Math.floor(ck + rv));
    for (let k = k0; k <= k1; k++) {
      const dk = k + 0.5 - ck;
      for (let j = j0; j <= j1; j++) {
        const dj = j + 0.5 - cj;
        for (let i = i0; i <= i1; i++) {
          const di = i + 0.5 - ci;
          if (di * di + dj * dj + dk * dk > rv2) continue;
          const idx = (k * this.NY + j) * this.NX + i;
          if (this.slotOf[idx] >= 0) out.push(idx);
        }
      }
    }
    if (this.fragments?.any) this.fragments.exposedNear(p, r, out);
    return out.length;
  },

  /**
   * Nearest free (unclaimed) exposed voxel to point `p`, searched in growing spheres
   * so the usual case (a free voxel right next to the unit) stays cheap.
   * With `allowShared`, a claimed voxel is accepted when no free one is found.
   * Returns an index or -1.
   */
  nearestFree(p, allowShared, out) {
    if (!this.alive || (this.count === 0 && !this.fragments?.any)) return -1;
    const v = this._v;
    const pick = (list, freeOnly) => {
      let best = -1, bestD = Infinity;
      for (const idx of list) {
        if (!this.solid(idx) || (freeOnly && this.claims[idx] > 0)) continue;
        this.cellCenter(idx, v);
        const d = (v.x - p.x) ** 2 + (v.y - p.y) ** 2 + (v.z - p.z) ** 2;
        if (d < bestD) { bestD = d; best = idx; }
      }
      return best;
    };
    for (const r of [1, 2, 4, 8]) {
      this.exposedNear(p, r, out);
      const idx = pick(out, true);
      if (idx >= 0) return idx;
    }
    // far away: nearest free voxel from a large random sample of exposed voxels
    out.length = 0;
    const n = Math.min(3000, this.count);
    for (let k = 0; k < n; k++) out.push(this.idxOfSlot[(Math.random() * this.count) | 0]);
    if (this.fragments?.any) for (let k = 0; k < 300; k++) out.push(this.fragments.randomVoxel());
    const idx = pick(out, true);
    if (idx >= 0) return idx;
    return allowShared ? pick(out, false) : -1;
  },

  /** Nearest free (unclaimed) voxel from a random sample of exposed ones; if none is free — the nearest of any. */
  findMatter(p, samples) {
    if (!this.alive || (this.count === 0 && !this.fragments?.any)) return null;
    let best = -1, bestD = Infinity, bestFree = false;
    const v = this._v;
    const sample = [];
    const n = Math.min(samples, this.count);
    for (let k = 0; k < n; k++) sample.push(this.idxOfSlot[(Math.random() * this.count) | 0]);
    if (this.fragments?.any) for (let k = 0; k < 300; k++) sample.push(this.fragments.randomVoxel());
    for (const idx of sample) {
      if (idx < 0) continue;
      const free = this.claims[idx] === 0;
      if (bestFree && !free) continue;
      this.cellCenter(idx, v);
      const d = (v.x - p.x) ** 2 + (v.y - p.y) ** 2 + (v.z - p.z) ** 2;
      if ((free && !bestFree) || d < bestD) { bestD = d; best = idx; bestFree = free; }
    }
    if (best < 0) return null;
    const c = this.cellCenter(best, new THREE.Vector3());
    return { x: c.x, y: c.y, z: c.z };
  },

  /** First solid voxel along a ray (with `pieces`: also of a drifting piece, whichever is nearer), or null. */
  raycastSolid(ray, out, pieces = false) {
    const o = ray.origin, d = ray.direction;
    let best = Infinity;
    // the first t in [t0, t1] (a sphere around `c` of radius R) where `solid` holds
    const march = (cx, cy, cz, R, solid) => {
      const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
      const b = ox * d.x + oy * d.y + oz * d.z;
      const disc = b * b - (ox * ox + oy * oy + oz * oz - R * R);
      if (disc < 0) return;
      const sq = Math.sqrt(disc);
      const t0 = Math.max(0, -b - sq), t1 = Math.min(best, -b + sq);
      for (let t = t0; t <= t1; t += this.s * 0.4) {
        out.copy(d).multiplyScalar(t).add(o);
        if (solid(out)) { best = t; return; }
      }
    };
    march(0, 0, 0, this.bound, (p) => this.isSolid(p));
    const fr = this.fragments;
    if (pieces && fr) for (const f of fr.list) if (!f.dead) march(f.pos.x, f.pos.y, f.pos.z, f.radius + this.s, (p) => fr.at(p) >= 0);
    if (best === Infinity) return null;
    return out.copy(d).multiplyScalar(best).add(o);
  },
};
