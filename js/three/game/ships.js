import { CONFIG } from '../../config.js';
import { aroundPlanet } from '../swarm/steering.js';

const THREE = window.THREE;

// scratch vectors for updateTugs
const TUG_P = new THREE.Vector3(), TUG_G = new THREE.Vector3(), TUG_D = new THREE.Vector3();

/**
 * Ships with their own jobs: tugs towing pieces home, bombers that blew up (removed), orb ships'
 * orbs, support ships' lightning.
 * (Part of Player: these become its methods.)
 */
export const ShipRoles = {
  /**
   * Tugs: each takes the nearest drifting piece nobody tows yet and flies to it; within `tug.range`
   * (10 voxels) of it, its tractor beam holds the whole piece and it flies home, the piece
   * following (around the planet, not through it). At the tunnel the piece is gone and the player
   * gets `tug.reward` × the points of what is left of it. Others may eat the piece on the way.
   */
  updateTugs() {
    const s = this.swarm, fr = this.game.planet.fragments, c = CONFIG.swarm.tug;
    const start = s.lasers + s.storms, end = Math.min(start + s.tugs, s.count);
    for (const [i, t] of this.towing) if (i < start || i >= end || t.f.dead || !fr) this.letGo(i, t);
    s.tows = [];
    if (!fr || start >= end) return;
    const home = this.spawnWorld();
    const p = TUG_P, g = TUG_G, d = TUG_D;
    for (let i = start; i < end; i++) {
      s.tugHas[i] = 0;
      p.fromArray(s.pos, i * 3);
      let t = this.towing.get(i);
      if (!t) {
        // the nearest piece nobody is towing
        let best = null, bestD = Infinity;
        for (const f of fr.list) {
          if (f.dead || f.tug) continue;
          const dd = f.pos.distanceToSquared(p);
          if (dd < bestD) { bestD = dd; best = f; }
        }
        if (!best) continue;
        t = { f: best, on: false };
        best.tug = this;
        this.towing.set(i, t);
      }
      const f = t.f;
      const gap = p.distanceTo(f.pos) - f.radius; // from the tug to the piece's edge
      if (!t.on && gap <= c.range) { t.on = true; f.towed = true; }
      else if (t.on && gap > c.range * 1.6) { t.on = false; f.towed = false; f.vel.set(0, 0, 0); f.origin.copy(f.pos); }
      if (t.on) {
        // pull the piece towards home, around the planet
        const pl = this.game.planet;
        const way = pl.alive ? aroundPlanet(f.pos.x, f.pos.y, f.pos.z, home.x, home.y, home.z, pl.R, CONFIG.swarm.avoid) : null;
        d.set(way ? way[0] : home.x, way ? way[1] : home.y, way ? way[2] : home.z).sub(f.pos).normalize();
        f.vel.copy(d).multiplyScalar(s.speed * c.pull);
        g.copy(f.pos).addScaledVector(d, f.radius + c.range * 0.6); // the tug flies ahead of it
        s.tows.push([i, f.id]);
        if (f.pos.distanceTo(home) < f.radius + c.deliver) { this.deliver(i, t); continue; }
      } else {
        g.copy(p).sub(f.pos).normalize().multiplyScalar(f.radius + c.range * 0.6).add(f.pos); // to its near side
      }
      s.tugGoal[i * 3] = g.x; s.tugGoal[i * 3 + 1] = g.y; s.tugGoal[i * 3 + 2] = g.z;
      s.tugHas[i] = 1;
    }
  },

  /** A towed piece reached the beacon: it is gone, and its voxels are worth `tug.reward` × the points. */
  deliver(i, t) {
    const game = this.game, pl = game.planet, fr = pl.fragments, f = t.f;
    const cells = fr.cellsOf(f), v = new THREE.Vector3();
    this.score += CONFIG.swarm.tug.reward * cells.length;
    this.planetScore += cells.length;
    cells.forEach((c, n) => {
      if (n < 400) game.debris.emit(pl.cellCenter(c, v), pl.voxelColor(c), 1);
      pl.remove(c); // eaten: counted, logged for the guests
    });
    this.towing.delete(i);
    this.swarm.tugHas[i] = 0;
    this.swarm.tows = this.swarm.tows.filter(([u]) => u !== i);
    this.beacon.pulse(); // the tunnel opens for a moment and takes it in
    this.delivered = (this.delivered || 0) + 1; // (tests)
  },

  /** A tug lets go of its piece (it changed type, the piece is gone, …). */
  letGo(i, t) {
    const f = t.f;
    if (!f.dead) {
      if (f.tug === this) f.tug = null;
      if (t.on) { f.towed = false; f.vel.set(0, 0, 0); f.origin.copy(f.pos); }
    }
    this.towing.delete(i);
    this.swarm.tugHas[i] = 0;
  },

  /**
   * Bombers that blew up this frame are gone for good: one ship fewer (the Units setting and the
   * bombers setting go down by one each). The dead unit is moved to the end of the swarm first —
   * past the other bombers and the eaters — so the ships of every type keep their places.
   */
  removeDead() {
    const s = this.swarm;
    if (!s.dying.length) return;
    // highest first, so moving one doesn't move another that is still to go
    for (const i of [...new Set(s.dying)].sort((a, b) => b - a)) {
      const bEnd = s.lasers + s.storms + s.tugs + s.bombers;
      const oEnd = bEnd + s.orbs + s.supports;
      s.swapUnits(i, bEnd - 1);           // the last bomber's place
      s.swapUnits(bEnd - 1, oEnd - 1);    // past the orb and support ships (the last of them takes the bomber's place)
      s.swapUnits(oEnd - 1, s.count - 1); // the last unit's place (an eater, if any)
      if (s.food[s.count - 1] >= 0) this.game.planet.release(s.food[s.count - 1]);
      s.food[s.count - 1] = -1;
      this.bombers = Math.max(0, this.bombers - 1);
      this.base.count = Math.max(0, this.base.count - 1);
      this.applyUpgrades();
    }
    s.dying.length = 0;
    this.onLost?.();
  },

  /**
   * Support ships: every `support.every` frames each fires a lightning bolt from itself through
   * up to `support.jumps` other ships of this swarm, each the next one picked at random among
   * those within `support.jumpRange` of the last (none twice). What lies on its way is destroyed
   * (Game3D.zap).
   */
  updateSupport() {
    const s = this.swarm, c = CONFIG.swarm.support;
    if (!s.supports || !this.game.planet.alive) return;
    const start = s.lasers + s.storms + s.tugs + s.bombers + s.orbs, end = Math.min(start + s.supports, s.count);
    const P = s.pos, r2 = c.jumpRange * c.jumpRange;
    for (let i = start; i < end; i++) {
      if (s.zapWait[i] > 0) { s.zapWait[i]--; continue; }
      const chain = [i], used = new Set(chain);
      let cur = i;
      for (let j = 0; j < c.jumps; j++) {
        const near = [];
        for (let k = 0; k < s.count; k++) {
          if (used.has(k)) continue;
          const dx = P[k * 3] - P[cur * 3], dy = P[k * 3 + 1] - P[cur * 3 + 1], dz = P[k * 3 + 2] - P[cur * 3 + 2];
          if (dx * dx + dy * dy + dz * dz <= r2) near.push(k);
        }
        if (!near.length) break;
        cur = near[(Math.random() * near.length) | 0];
        chain.push(cur);
        used.add(cur);
      }
      s.zapWait[i] = c.every; // (alone: tries again after the same wait)
      if (chain.length > 1) this.game.zap(this, chain);
    }
  },

  /** An orb burst: the ship that fired it may fire again. */
  orbDone(id) {
    const s = this.swarm;
    for (let i = 0; i < s.count; i++) if (s.orbOut[i] === id) s.orbOut[i] = 0;
  },
};
