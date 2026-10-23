import { CONFIG, SHIP_KINDS, GROUP_KINDS } from '../../config.js';
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
    const sent = this.group('tugs').mode; // tugs sent somewhere or called home: no pieces meanwhile
    for (let i = start; i < end; i++) {
      s.tugHas[i] = 0;
      if (sent) { const t = this.towing.get(i); if (t) this.letGo(i, t); continue; }
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

  /**
   * Siphons and scoops: each flies to the nearest droplet of liquid (siphons, Game3D.liquids) or puff of
   * gas (scoops, Game3D.gases) let loose, draws in every one within its `range` and takes in those within
   * `take` — a point each. Nothing else: they never eat voxels. With none about (or sent somewhere /
   * called home) they fly with the swarm.
   */
  updateSiphons() {
    this.collect('siphons', this.game.liquids, CONFIG.swarm.siphon);
    this.collect('scoops', this.game.gases, CONFIG.swarm.scoop);
  },

  collect(kind, store, c) {
    const s = this.swarm;
    if (!s[kind]) return;
    const a = s.kindStart(kind), b = Math.min(s.count, a + s[kind]);
    const sent = this.group(kind).mode;
    for (let i = a; i < b; i++) {
      s.tugHas[i] = 0;
      if (!store || !store.count || sent || s.hidden[i] || s.warpT[i] > 0 || s.leaving[i]) continue;
      const i3 = i * 3, x = s.pos[i3], y = s.pos[i3 + 1], z = s.pos[i3 + 2];
      store.pull(x, y, z, c.range, c.pull);
      const got = store.take(x, y, z, c.take);
      if (got) { this.score += got; this.planetScore += got; }
      const n = store.nearest(x, y, z);
      if (n < 0) continue;
      s.tugGoal[i3] = store.pos[n * 3]; s.tugGoal[i3 + 1] = store.pos[n * 3 + 1]; s.tugGoal[i3 + 2] = store.pos[n * 3 + 2];
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
      // to the end, one type at a time: the dead bomber takes the last place of each type after
      // the bombers and that type's last ship takes its place — which, with one bomber fewer,
      // is the first place of that type (so every ship keeps its type)
      this.removeUnit(i, 'bombers');
    }
    s.dying.length = 0;
    this.onLost?.();
  },

  /**
   * Unit i of type `kind` (GROUP_KINDS) is gone for good: one ship fewer (the base count and that
   * type's setting go down by one). It is moved to the end of the swarm first — past the rest of
   * its type and every later type — so the ships of every type keep their places.
   */
  removeUnit(i, kind) {
    const s = this.swarm;
    if (kind !== 'eaters') {
      // to the end, one type at a time: it takes the last place of each later type and that type's
      // last ship takes its place — which, with one fewer of `kind`, is the first place of that type
      let end = s.kindStart(kind) + s[kind];
      s.swapUnits(i, end - 1); // the last place of its type
      for (const k of SHIP_KINDS.slice(SHIP_KINDS.indexOf(kind) + 1)) {
        if (!s[k]) continue;
        s.swapUnits(end - 1, end + s[k] - 1);
        end += s[k];
      }
      s.swapUnits(end - 1, s.count - 1); // the last unit's place (an eater, if any)
      this[kind] = Math.max(0, this[kind] - 1);
    } else s.swapUnits(i, s.count - 1);
    const last = s.count - 1;
    if (s.food[last] >= 0) this.game.planet.release(s.food[last]);
    s.food[last] = -1;
    s.leaving[last] = 0;
    const t = this.towing.get(last);
    if (t) this.letGo(last, t);
    // one fewer in all — also when it is one of the Brood upgrades' ships (then the base goes below
    // zero: the upgrade's ships are fewer) or when the swarm was at its limit with the upgrades on top
    const bonus = this.tree.effects().count || 0;
    this.base.count = Math.max(-bonus, Math.min(this.base.count, CONFIG.swarm.maxCount - bonus) - 1);
    this.applyUpgrades();
  },

  /**
   * The ship bar's − : `n` ships of type `kind` leave — each jumps to hyperspace like at the end of a
   * planet (the last ones of the type out of the tunnel first) and, once gone, is removed (removeLeft).
   * At least one ship stays in the swarm. Returns how many were sent.
   */
  sellShips(kind, n = 1) {
    const s = this.swarm;
    if (this.homeMode === 'jump' || !GROUP_KINDS.includes(kind)) return 0;
    s.fillKinds();
    const k = GROUP_KINDS.indexOf(kind);
    let staying = 0;
    for (let i = 0; i < s.count; i++) if (!s.leaving[i]) staying++;
    let sent = 0;
    for (let i = s.count - 1; i >= 0 && sent < n && staying > 1; i--) {
      if (s.kindOf[i] !== k || s.leaving[i] || s.hidden[i] || s.warpT[i] > 0) continue;
      s.leaving[i] = 1;
      s.warpDelay[i] = 0; // (jumps next frame: stepWarp)
      if (s.food[i] >= 0) this.game.planet.release(s.food[i]);
      s.food[i] = -1;
      s.landed[i] = 0;
      s.pierceOn[i] = 0; s.cutOn[i] = 0; s.cutAfter[i] = 0; s.drillLeft[i] = 0;
      const t = this.towing.get(i);
      if (t) this.letGo(i, t);
      sent++; staying--;
    }
    return sent;
  },

  /** Ships sent away (sellShips) that are gone to hyperspace: removed for good. */
  removeLeft() {
    const s = this.swarm;
    let any = false;
    for (let i = s.count - 1; i >= 0; i--) {
      if (!s.leaving[i] || !s.hidden[i]) continue;
      s.fillKinds();
      this.removeUnit(i, GROUP_KINDS[s.kindOf[i]]);
      any = true;
    }
    if (any) this.onLost?.();
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
    // (ships still in the tunnel or gone to hyperspace, or jumping away, take no part)
    const away = (k) => s.hidden[k] || s.warpT[k] > 0;
    for (let i = start; i < end; i++) {
      if (away(i)) continue;
      if (s.zapWait[i] > 0) { s.zapWait[i]--; continue; }
      const chain = [i], used = new Set(chain);
      let cur = i;
      for (let j = 0; j < c.jumps; j++) {
        const near = [];
        for (let k = 0; k < s.count; k++) {
          if (used.has(k) || away(k)) continue;
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

  /** A splasher's bubble landed: the ship that fired it may fire again. */
  splashDone(id) {
    const s = this.swarm;
    for (let i = 0; i < s.count; i++) if (s.splashOut[i] === id) s.splashOut[i] = 0;
  },

  /** An orb burst: the ship that fired it may fire again. */
  orbDone(id) {
    const s = this.swarm;
    for (let i = 0; i < s.count; i++) if (s.orbOut[i] === id) s.orbOut[i] = 0;
  },
};
