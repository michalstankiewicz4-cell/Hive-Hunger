import { BITE } from '../planet/VoxelPlanet.js';

const THREE = window.THREE;
const PIERCE_B = new THREE.Vector3(), PIERCE_D = new THREE.Vector3(), PIERCE_P = new THREE.Vector3();

/** How many voxels a crater of radius `r` voxels covers (what a bite of that power hits). */
const craterCache = new Map();
function craterSize(r) {
  const key = Math.round(r * 100);
  if (craterCache.has(key)) return craterCache.get(key);
  let n = 0;
  const ri = Math.ceil(r), r2 = r * r;
  for (let c = -ri; c <= ri; c++) for (let b = -ri; b <= ri; b++) for (let a = -ri; a <= ri; a++) if (a * a + b * b + c * c <= r2) n++;
  craterCache.set(key, n);
  return n;
}

/**
 * What ships do to voxels: bites, storm bolts, bomber blasts, orb bursts, support ships' lightning
 * and black holes swallowing pieces (points go to the player who did it).
 * (Part of Game3D: these become its methods.)
 */
export const Destruction = {
  /**
   * A piercer (unit i of `player`) fires at voxel `idx`: its beam goes on through the voxels behind
   * the bite — `piercer.pierce` (3) in a row, the bite first — and eats them all at once, each at
   * `piercer.damage` × an eater's rate per voxel (a point each when one is gone). Voxels another
   * unit has claimed are passed over; on a drifting piece only the bite is hit. Returns how many were hit.
   */
  pierceCell(idx, player, i) {
    const pl = this.planet, c = this.cfg.swarm.piercer, s = player.swarm;
    const amount = (this.cfg.planet.strength / this.cfg.swarm.eatFrames) * c.damage * player.boostOf(i);
    const hit = [idx];
    if (!(pl.fragments && pl.fragments.has(idx))) {
      // along the beam from the bite on, half a voxel at a time
      const b = pl.cellCenter(idx, PIERCE_B), i3 = i * 3;
      const d = PIERCE_D.set(b.x - s.pos[i3], b.y - s.pos[i3 + 1], b.z - s.pos[i3 + 2]).normalize();
      const p = PIERCE_P.copy(b);
      for (let k = 0; k < c.pierce * 4 && hit.length < c.pierce; k++) {
        p.addScaledVector(d, pl.s * 0.5);
        const n = pl.cellAt(p);
        if (n < 0 || hit.includes(n) || pl.hp[n] <= 0 || pl.claimedByOther(n, idx)) continue;
        hit.push(n);
      }
    }
    for (const n of hit) {
      if (pl.bite(n, amount) !== BITE.REMOVED) continue;
      player.score++;
      player.planetScore++;
      this.debris.emit(pl.cellCenter(n, this.tmp), pl.colorOf(n), this.cfg.debris.perCell);
    }
    return hit.length;
  },

  /**
   * A piercer (unit i of `player`) at (x, y, z) firing along its locked line (direction D[i*3…]):
   * the first `piercer.pierce` (3) solid grid voxels on the line — all the way to the far side of the
   * planet (its whole grid), however far — are each
   * bitten for `piercer.damage` × an eater's rate (claimed by other ships or not), a point each when
   * gone. E[i*3…] is set to the nearest one hit (where the beam ends); none hit — it is through —
   * returns false and E stays where the last one was.
   */
  pierceLine(player, i, x, y, z, D, E) {
    const pl = this.planet, c = this.cfg.swarm.piercer, i3 = i * 3;
    const amount = (this.cfg.planet.strength / this.cfg.swarm.eatFrames) * c.damage * player.boostOf(i);
    const p = PIERCE_P.set(x, y, z), step = pl.s * 0.5, hit = [];
    // all the way: out past the far side of the whole grid (whatever its shape), however far that is
    const reach = Math.hypot(x, y, z) + pl.half * 1.8;
    for (let k = 0, steps = Math.ceil(reach / step); k < steps && hit.length < c.pierce; k++) {
      p.x += D[i3] * step; p.y += D[i3 + 1] * step; p.z += D[i3 + 2] * step;
      const n = pl.cellAt(p);
      if (n < 0 || pl.hp[n] <= 0 || hit.includes(n)) continue; // (claimed or not: whatever is on the line)
      hit.push(n);
    }
    if (!hit.length) return false;
    pl.cellCenter(hit[0], PIERCE_B);
    E[i3] = PIERCE_B.x; E[i3 + 1] = PIERCE_B.y; E[i3 + 2] = PIERCE_B.z;
    for (const n of hit) {
      if (pl.bite(n, amount) !== BITE.REMOVED) continue;
      player.score++;
      player.planetScore++;
      this.debris.emit(pl.cellCenter(n, this.tmp), pl.colorOf(n), this.cfg.debris.perCell);
    }
    return true;
  },

  /** The planet voxel at (x, y, z), if there is one, is gone (a point to `player`); returns 1 or 0. */
  clearCell(x, y, z, player) {
    const pl = this.planet, idx = pl.cellAt(PIERCE_P.set(x, y, z));
    if (idx < 0 || pl.hp[idx] <= 0) return 0;
    this.debris.emit(pl.cellCenter(idx, this.tmp), pl.voxelColor(idx), 1);
    pl.remove(idx);
    player.score++;
    player.planetScore++;
    return 1;
  },

  /** A feeding unit of `player` eats a small crater around the voxel it sits on (in a booster's field: `boost` × the crater radius and `boost` × as hard). */
  biteCell(idx, ownFood, player, boost = 1) {
    const pl = this.planet;
    // eating takes time: every frame on a bite removes part of its strength
    const damage = (this.cfg.planet.strength / this.cfg.swarm.eatFrames) * boost;
    pl.biteSphere(idx, player.biteRadius * boost, damage, (n) => {
      player.score++;
      player.planetScore++;
      this.debris.emit(pl.cellCenter(n, this.tmp), pl.colorOf(n), this.cfg.debris.perCell);
    }, ownFood);
  },

  /**
   * A storm ship's lightning on voxel `idx`: the damage a laser would do this frame (its whole
   * crater, `power`), split over three voxels — `storm.centre` of it on the bite, `storm.side`
   * on each of the two nearest others. Returns the side voxels' positions (for drawing),
   * taken before the hit.
   */
  stormCell(idx, ownFood, player, boost = 1) {
    const pl = this.planet, sc = this.cfg.swarm.storm;
    const total = (this.cfg.planet.strength / this.cfg.swarm.eatFrames) * craterSize((player.biteRadius * boost) / pl.s) * boost;
    const sides = pl.nearestAround(idx, 2, ownFood);
    const at = [];
    for (const n of sides) { pl.cellCenter(n, this.tmp); at.push(this.tmp.x, this.tmp.y, this.tmp.z); }
    const hit = (n, amount) => {
      if (pl.bite(n, amount) !== BITE.REMOVED) return;
      player.score++;
      player.planetScore++;
      this.debris.emit(pl.cellCenter(n, this.tmp), pl.colorOf(n), this.cfg.debris.perCell);
    };
    hit(idx, total * sc.centre);
    for (const n of sides) hit(n, total * sc.side);
    return at;
  },

  /**
   * A bomber blew up at (x, y, z): every voxel within `bomber.radius` (10 voxels) is gone — in the
   * planet and on drifting pieces, claimed or not — worth a point each to `player`; a black hole
   * opens there for a while (and on the guests' screens). Returns the number of voxels destroyed.
   */
  explode(x, y, z, player) {
    const n = this.destroySphere(x, y, z, this.cfg.swarm.bomber.radius, player, this.cfg.swarm.bomber.debris);
    this.holes.add({ x, y, z }, player);
    if (this.role === 'host') this.net?.broadcastHole([x, y, z]);
    return n;
  },

  /**
   * Every voxel within `R` of (x, y, z) — in the planet and on drifting pieces, claimed or not —
   * is gone, a point each to `player`; at most `debrisMax` pieces of debris. Returns how many.
   */
  destroySphere(x, y, z, R, player, debrisMax) {
    const pl = this.planet, s = pl.s, v = this.tmp;
    const hit = [];
    const [ci, cj, ck] = [x, y, z].map((c) => Math.floor((c + pl.half) / s));
    const rv = Math.ceil(R / s);
    for (let k = ck - rv; k <= ck + rv; k++) for (let j = cj - rv; j <= cj + rv; j++) for (let i = ci - rv; i <= ci + rv; i++) {
      const idx = pl.index(i, j, k);
      if (idx < 0 || pl.hp[idx] <= 0) continue;
      pl.gridCenter(idx, v);
      if ((v.x - x) ** 2 + (v.y - y) ** 2 + (v.z - z) ** 2 <= R * R) hit.push(idx);
    }
    const fr = pl.fragments;
    if (fr) {
      fr.near({ x, y, z }, R, (f) => {
        for (const c of fr.cellsOf(f)) {
          fr.worldCenter(c, v);
          if ((v.x - x) ** 2 + (v.y - y) ** 2 + (v.z - z) ** 2 <= R * R) hit.push(c);
        }
      });
    }
    const every = Math.max(1, Math.floor(hit.length / debrisMax));
    hit.forEach((idx, n) => {
      if (n % every === 0) this.debris.emit(pl.cellCenter(idx, v), pl.voxelColor(idx), 1);
      pl.remove(idx);
    });
    if (player) { player.score += hit.length; player.planetScore += hit.length; }
    return hit.length;
  },

  /** A sniper of `player` (unit i) fires at voxel `idx` from (x, y, z); returns the shot's id. */
  fireShot(player, i, idx, x, y, z) {
    const to = this.planet.cellCenter(idx, this.tmp);
    const shot = this.shots.fire({ x, y, z }, to, { target: idx, owner: player, unit: i });
    if (this.role === 'host') this.net?.broadcastShot([x, y, z], [to.x, to.y, to.z]);
    return shot.id;
  },

  /** A sniper's shot hit: the voxel it was fired at is gone (or, if that went meanwhile, the one at the spot). */
  shotHit(s) {
    if (!s.owner) return; // (a guest's copy: the host sends what is gone)
    const pl = this.planet;
    let idx = pl.solid(s.target) ? s.target : -1;
    if (idx < 0) { const n = pl.cellAt(s.group.position); if (n >= 0 && pl.hp[n] > 0) idx = n; }
    if (idx >= 0) {
      this.debris.emit(pl.cellCenter(idx, this.tmp), pl.voxelColor(idx), this.cfg.debris.perCell * 2);
      pl.remove(idx);
      s.owner.score++;
      s.owner.planetScore++;
    }
  },

  /** A splasher of `player` (unit i) fires a bubble at voxel `idx` from (x, y, z); returns its id. */
  fireBubble(player, i, idx, x, y, z) {
    const to = this.planet.cellCenter(idx, this.tmp);
    const b = this.bubbles.fire({ x, y, z }, to, { target: idx, owner: player, unit: i });
    if (this.role === 'host') this.net?.broadcastBubble([x, y, z], [to.x, to.y, to.z]);
    return b.id;
  },

  /**
   * A bubble landed on voxel `b.target` (or where it is, if that went): a block of `splasher.area`
   * voxels — 3 × 3 across the surface there and 2 deep, the hit one on top — starts soaking: for
   * `splasher.soakFrames` (3 s) every one of them loses strength a little each frame and whatever
   * is left of them is gone at the end (a point each for the splasher's owner). On a drifting piece
   * only that piece's voxels in the block soak.
   */
  splash(b) {
    const pl = this.planet, c = this.cfg.swarm.splasher;
    // a splash of liquid (blue debris) where it landed
    this.debris.emit(b.pos, c.splashColor, c.splash);
    if (!b.owner) return; // (a guest's copy: the host sends what is gone)
    b.owner.splashDone(b.id);
    const fr = pl.fragments;
    let idx = pl.solid(b.target) ? b.target : -1;
    if (idx < 0) { const n = pl.cellAt(b.pos); if (n >= 0 && pl.hp[n] > 0) idx = n; }
    if (idx < 0) return;
    const frag = fr && fr.has(idx) ? fr.fragOf[idx] : -1;
    // across the surface: the two axes other than the one pointing most out of the planet; deep: inwards
    const [ci, cj, ck] = pl.coords(idx);
    const g = pl.gridCenter(idx, this.tmp), ax = [Math.abs(g.x), Math.abs(g.y), Math.abs(g.z)];
    const up = ax[0] >= ax[1] && ax[0] >= ax[2] ? 0 : ax[1] >= ax[2] ? 1 : 2;
    const inward = [g.x, g.y, g.z][up] >= 0 ? -1 : 1;
    const [a1, a2] = [0, 1, 2].filter((n) => n !== up);
    const [w1, w2, deep] = c.area, cells = [];
    for (let d = 0; d < deep; d++) for (let u = -((w1 - 1) >> 1); u <= w1 >> 1; u++) for (let v = -((w2 - 1) >> 1); v <= w2 >> 1; v++) {
      const at = [ci, cj, ck];
      at[a1] += u; at[a2] += v; at[up] += inward * d;
      const n = pl.index(at[0], at[1], at[2]);
      if (n < 0) continue;
      if (frag >= 0 ? fr.fragOf[n] === frag : pl.hp[n] > 0) cells.push(n);
    }
    this.soaks.push({ cells, left: c.soakFrames, owner: b.owner, amount: this.cfg.planet.strength / c.soakFrames });
  },

  /** Soaking blocks: every frame a little weaker; at the end whatever is left is gone. */
  updateSoaks() {
    const pl = this.planet;
    for (const s of this.soaks) {
      s.left--;
      for (const n of s.cells) {
        if (!pl.solid(n)) continue;
        const gone = s.left <= 0 ? (pl.remove(n), true) : pl.bite(n, s.amount) === BITE.REMOVED;
        if (!gone) continue;
        s.owner.score++;
        s.owner.planetScore++;
        this.debris.emit(pl.cellCenter(n, this.tmp), pl.colorOf(n), 1);
      }
    }
    this.soaks = this.soaks.filter((s) => s.left > 0);
  },

  /** An orb ship of `player` (unit i) fires at voxel `idx` from (x, y, z); returns the orb's id. */
  fireOrb(player, i, idx, x, y, z) {
    const to = this.planet.cellCenter(idx, this.tmp);
    const orb = this.orbs.fire({ x, y, z }, to, { target: idx, owner: player, unit: i });
    if (this.role === 'host') this.net?.broadcastOrb([x, y, z], [to.x, to.y, to.z]);
    return orb.id;
  },

  /** An orb reached its target: everything within `orb.blast` (2 voxels) is gone. */
  orbBurst(o) {
    const p = o.group.position;
    if (o.owner) {
      this.destroySphere(p.x, p.y, p.z, this.cfg.swarm.orb.blast, o.owner, this.cfg.swarm.orb.debris);
      o.owner.orbDone(o.id);
    }
  },

  /**
   * A support ship's lightning through the ships `chain` of `player`: every voxel on its (bent)
   * way is gone — in the planet and on drifting pieces — a point each. Guests draw the same bolt.
   */
  zap(player, chain, seed = (Math.random() * 4294967296) >>> 0) {
    // the voxels on each jump are gone as the bolt runs through it (on the host; guests get them in snapshots)
    const onJump = this.role === 'guest' ? null : (path) => {
      const pl = this.planet, fr = pl.fragments, step = pl.s * 0.5, p = new THREE.Vector3(), q = new THREE.Vector3();
      const hit = new Set();
      for (let k = 0; k + 5 < path.length; k += 3) {
        p.fromArray(path, k); q.fromArray(path, k + 3);
        const n = Math.max(1, Math.ceil(p.distanceTo(q) / step));
        for (let t = 0; t <= n; t++) {
          const x = this.tmp.copy(p).lerp(q, t / n);
          const idx = pl.cellAt(x);
          if (idx >= 0 && pl.hp[idx] > 0) hit.add(idx);
          const f = fr ? fr.at(x) : -1;
          if (f >= 0) hit.add(f);
        }
      }
      for (const idx of hit) {
        this.debris.emit(pl.cellCenter(idx, this.tmp), pl.voxelColor(idx), 1);
        pl.remove(idx);
      }
      player.score += hit.size;
      player.planetScore += hit.size;
    };
    this.zaps.add(player.swarm, chain, seed, onJump);
    if (this.role === 'host') this.net?.broadcastZap(player.index, chain, seed);
  },

  /** A black hole swallowed a drifting piece: its voxels are gone, a point each to the hole's owner. */
  swallow(f, owner) {
    const pl = this.planet, cells = pl.fragments.cellsOf(f);
    for (const c of cells) pl.remove(c);
    if (owner) { owner.score += cells.length; owner.planetScore += cells.length; }
  },
};
