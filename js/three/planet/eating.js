import { BITE, NEIGHBORS, AROUND } from './grid.js';

const SPILL = new window.THREE.Vector3();

/**
 * Eating: bites, claims, chain lightning weakening voxels, removing voxels (from the grid or a
 * drifting piece), shattering what is left.
 * (Part of VoxelPlanet: these become its methods.)
 */
export const Eating = {
  bite(idx, amount) {
    if (!this.alive || idx < 0) return BITE.MISS;
    if (this.hp[idx] <= 0) {
      // a voxel of a drifting fragment
      if (!this.fragments?.has(idx)) return BITE.MISS;
      if (!this.fragments.bite(idx, amount)) return BITE.HIT;
      this.eaten(idx);
      return BITE.REMOVED;
    }
    this.hp[idx] -= amount;
    if (this.hp[idx] > 0) {
      this.showDamage(idx);
      return BITE.HIT;
    }
    this.remove(idx);
    return BITE.REMOVED;
  },

  /**
   * Chain lightning: every solid voxel on the polyline `path` ([x, y, z, x, y, z, …]) loses
   * `damage` × strength, but is never destroyed by it (it only gets weaker).
   */
  weakenAlong(path, damage) {
    if (!this.alive) return;
    const done = new Set(), p = { x: 0, y: 0, z: 0 }, step = this.s * 0.5;
    const min = this.cfg.strength * 0.05;
    for (let i = 0; i + 5 < path.length; i += 3) {
      const ax = path[i], ay = path[i + 1], az = path[i + 2];
      const dx = path[i + 3] - ax, dy = path[i + 4] - ay, dz = path[i + 5] - az;
      const n = Math.max(1, Math.ceil(Math.hypot(dx, dy, dz) / step));
      for (let t = 0; t <= n; t++) {
        p.x = ax + (dx * t) / n; p.y = ay + (dy * t) / n; p.z = az + (dz * t) / n;
        const idx = this.cellAt(p);
        if (idx < 0 || done.has(idx) || this.hp[idx] <= 0) continue;
        done.add(idx);
        this.hp[idx] = Math.max(min, this.hp[idx] - damage * this.cfg.strength);
        this.showDamage(idx);
      }
    }
    return done.size;
  },

  claim(idx) {
    if (idx >= 0) this.claims[idx]++;
  },

  release(idx) {
    if (idx >= 0 && this.claims[idx] > 0) this.claims[idx]--;
  },

  /** Whether the voxel is claimed by someone other than the owner of `ownFood`. */
  claimedByOther(idx, ownFood) {
    return idx !== ownFood && this.claims[idx] > 0;
  },

  /**
   * Bites voxels within a sphere of `radius` around voxel `idx`, skipping
   * voxels claimed by other units; onRemoved(idx) is called for each eaten one.
   */
  biteSphere(idx, radius, amount, onRemoved, ownFood = -1) {
    if (!this.alive || idx < 0) return;
    // a bite on a fragment takes only from that fragment (its neighbours by original place)
    const fr = this.fragments, frag = fr ? fr.fragOf[idx] : -1;
    const [ci, cj, ck] = this.coords(idx);
    const r = radius / this.s, r2 = r * r, ri = Math.ceil(r);
    for (let dk = -ri; dk <= ri; dk++) for (let dj = -ri; dj <= ri; dj++) for (let di = -ri; di <= ri; di++) {
      if (di * di + dj * dj + dk * dk > r2) continue;
      const n = this.index(ci + di, cj + dj, ck + dk);
      if (n < 0 || this.claimedByOther(n, ownFood)) continue;
      if (fr && fr.fragOf[n] !== frag) continue;
      if (this.bite(n, amount) === BITE.REMOVED) onRemoved(n);
    }
  },

  /**
   * Up to `n` voxels nearest to voxel `idx` (within 2 voxels) that are still there and not
   * claimed by another unit — of the same body (a drifting piece: of the same piece).
   */
  nearestAround(idx, n, ownFood = -1) {
    const out = [];
    if (idx < 0) return out;
    const fr = this.fragments, frag = fr ? fr.fragOf[idx] : -1;
    const [ci, cj, ck] = this.coords(idx);
    for (const [a, b, c] of AROUND) {
      const m = this.index(ci + a, cj + b, ck + c);
      if (m < 0 || this.claimedByOther(m, ownFood)) continue;
      if (frag >= 0 ? fr.fragOf[m] !== frag : this.hp[m] <= 0) continue;
      out.push(m);
      if (out.length >= n) break;
    }
    return out;
  },

  remove(idx) {
    if (this.fragments?.has(idx)) {
      if (this.fragments.eat(idx)) this.eaten(idx);
      return;
    }
    this.takeOut(idx);
    this.eaten(idx);
    this.fragments?.noteRemoved(idx);
  },

  /** Counts an eaten voxel (and logs it for the guests). */
  eaten(idx) {
    if (this.log) this.log.push(idx);
    this.left--;
    // a liquid voxel: let loose as a droplet where it was (Game3D.takeSpills; a fragment's voxel: where it just was)
    const liquid = this.liquidOf && this.tags ? this.liquidOf[this.tags[idx]] : null;
    if (liquid) {
      const c = this.cellCenter(idx, SPILL);
      this.spills.push([liquid, c.x, c.y, c.z]);
    } else {
      const kind = (this.kindOf && this.tags && this.kindOf[this.tags[idx]]) || 'rock';
      this.collected[kind] = (this.collected[kind] || 0) + 1;
    }
  },

  /** A voxel comes loose and joins a fragment: out of the grid, but not eaten. */
  detach(idx) {
    this.takeOut(idx);
  },

  /** Takes a voxel out of the static grid and shows what was under it. */
  takeOut(idx) {
    this.hp[idx] = 0;
    this.removeInstance(idx);
    const [i, j, k] = this.coords(idx);
    this.surface?.touch(i, j, k);
    for (const [a, b, c] of NEIGHBORS) {
      const n = this.index(i + a, j + b, k + c);
      if (n >= 0 && this.hp[n] > 0 && this.slotOf[n] < 0) this.addInstance(n);
    }
  },

  /** Shatters the rest of the planet; the callback gets (idx, colour) for exposed voxels. */
  shatter(onCell) {
    this.alive = false;
    for (let s = 0; s < this.count; s++) {
      const idx = this.idxOfSlot[s];
      onCell(idx, this.colorOf(idx));
    }
    if (this.fragments) {
      for (const f of this.fragments.list) for (const idx of this.fragments.exposedOf(f)) onCell(idx, this.voxelColor(idx));
      this.fragments.clear();
    }
    this.hp.fill(0);
    this.surface?.clear();
    this.count = 0;
    this.mesh.count = 0;
    this.left = 0;
  },
};
