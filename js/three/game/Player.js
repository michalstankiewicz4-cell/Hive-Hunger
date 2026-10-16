import { CONFIG } from '../../config.js';
import { Swarm3D } from '../swarm/Swarm3D.js';
import { aroundPlanet } from '../swarm/steering.js';
import { Portal3D } from '../scene/Portal3D.js';
import { Leader } from '../../core/Leader.js';
import { SkillTree } from '../../core/SkillTree.js';

const THREE = window.THREE;

// scratch vectors for updateTugs
const TUG_P = new THREE.Vector3(), TUG_G = new THREE.Vector3(), TUG_D = new THREE.Vector3();

/**
 * One player: a swarm with its own target ("brain"), spawn tunnel (`tunnel`), settings and score.
 * In single player there is one; in multiplayer the host runs one per player.
 * All players eat the same planet and share its voxel claims, so a voxel is only ever
 * eaten by one unit of one swarm.
 */
export class Player {
  /**
   * @param {object} game the Game3D instance (planet, scene, debris…)
   * @param {{index:number, name:string, color:number, spawn:{x,y,z}}} info
   *   spawn is in the space frame (the tunnel stays put in space while the planet turns)
   */
  constructor(game, info) {
    this.game = game;
    this.index = info.index;
    this.name = info.name;
    this.color = info.color;
    this.spawnSpace = new THREE.Vector3(info.spawn.x, info.spawn.y, info.spawn.z);

    this.biteRadius = CONFIG.swarm.biteRadius; // power: crater radius (slider + upgrades)
    // slider values; the upgrade tree adds its bonuses on top (see applyUpgrades)
    this.base = { count: CONFIG.swarm.count, speed: CONFIG.swarm.speed, power: CONFIG.swarm.biteRadius };
    this.lasers = CONFIG.swarm.laser.count; // ship types: how many units are red laser ships
    this.storms = CONFIG.swarm.storm.count; // … and how many are blue storm ships
    this.tugs = CONFIG.swarm.tug.count;     // … and green tugs
    this.bombers = CONFIG.swarm.bomber.count; // … and purple bombers
    this.orbs = CONFIG.swarm.orb.count;     // … and magenta orb ships
    this.supports = CONFIG.swarm.support.count; // … and white support ships
    this.towing = new Map();                // tug unit → { f: fragment, on: tractor beam holds it }
    this.tree = new SkillTree();
    this.bolt = null;       // chain lightning settings once bought
    this.boltClock = 0;     // seconds since the last bolt
    this.homeMode = null;   // null | 'recall' (called back to the tunnel) | 'jump' (planet eaten: off to hyperspace)
    this.score = 0;         // voxels eaten in total
    this.planetScore = 0;   // voxels eaten of the current planet
    this.wins = 0;          // planets won (PvP)
    this.ready = false;     // multiplayer: pressed Start in the waiting room
    this.nextReady = true;  // multiplayer: pressed Next planet on the summary (true while there is none)

    // the spawn point: a subspace tunnel (still called the beacon: click it to call the swarm back)
    this.beacon = new Portal3D(game.space.group, this.spawnSpace.clone(), CONFIG.portal);
    this.arrival = { phase: 'pending', t: 0, delays: null }; // ships come out of the tunnel (see updateArrival)
    const start = this.spawnWorld();
    this.leader = new Leader(CONFIG.leader, start, ['x', 'y', 'z']);
    this.swarm = new Swarm3D(game.scene, { ...CONFIG.swarm, color: info.color }, new THREE.Vector3(start.x, start.y, start.z));
    this.swarm.lasers = Math.min(this.lasers, this.swarm.count);
    this.swarm.storms = Math.min(this.storms, this.swarm.count - this.swarm.lasers);
    this.swarm.tugs = Math.min(this.tugs, this.swarm.count - this.swarm.lasers - this.swarm.storms);
    this.swarm.bombers = Math.min(this.bombers, this.swarm.count - this.swarm.lasers - this.swarm.storms - this.swarm.tugs);
    this.swarm.orbs = Math.min(this.orbs, this.swarm.count - this.swarm.lasers - this.swarm.storms - this.swarm.tugs - this.swarm.bombers);
    this.swarm.supports = Math.min(this.supports, this.swarm.count - this.swarm.lasers - this.swarm.storms - this.swarm.tugs - this.swarm.bombers - this.swarm.orbs);
    this.swarm.fragmentById = (id) => game.planet?.fragments?.byId.get(id);
    this.swarm.fragments = () => game.planet?.fragments || null;
    this.swarm.hidden.fill(1); // still in the tunnel

    // exposed voxels near the swarm target — computed once per frame
    this.candidates = [];
    this.freeCandidates = 0;
    this.world = {
      // the swarm target stays while there are free (unclaimed) voxels nearby
      hasMatterNear: () => this.freeCandidates > 0,
      findMatter: (p) => game.planet.findMatter(p, CONFIG.leader.searchSamples),
    };

    const feedCenter = new THREE.Vector3();
    const nearestScratch = [];
    this.swarmWorld = {
      clickPoint: null,
      planetRadius: 0,
      holding: false, // called back home: nobody picks new bites
      // every unit eats the nearest free (unclaimed) voxel to itself. Shared only when the
      // planet has fewer exposed voxels left than there are units (there are no more).
      pickFood: (p) => {
        const pl = game.planet;
        const idx = pl.nearestFree(p, pl.count < this.swarm.count, nearestScratch);
        pl.claim(idx);
        return idx;
      },
      release: (idx) => game.planet.release(idx),
      claim: (idx) => game.planet.claim(idx),
      canBite: (idx, ownFood) => !game.planet.claimedByOther(idx, ownFood),
      cellCenter: (idx) => game.planet.cellCenter(idx, feedCenter),
      cellAt: (p) => game.planet.cellAt(p),
      isSolidCell: (idx) => idx >= 0 && game.planet.hp[idx] > 0,
      isFood: (idx) => game.planet.solid(idx),
      floatingAt: (p) => game.planet.fragments?.at(p) ?? -1,
      bite: (idx, ownFood) => game.biteCell(idx, ownFood, this),
      storm: (idx, ownFood) => game.stormCell(idx, ownFood, this),
      bomb: (i, x, y, z) => game.explode(x, y, z, this),
      fireOrb: (i, idx, x, y, z) => game.fireOrb(this, i, idx, x, y, z),
    };
  }

  /**
   * Ships arriving through the tunnel (each planet): it opens; once it is nearly open the ships
   * come out one after another over `portal.emergeWindow` frames, heading out of it; when the
   * last one is out (and a moment later) it closes again.
   */
  updateArrival() {
    const a = this.arrival, s = this.swarm, c = CONFIG.portal, portal = this.beacon;
    if (a.phase === 'done') return;
    if (a.phase === 'pending') {
      portal.open();
      a.phase = 'opening';
      a.t = 0;
      a.delays = Array.from({ length: s.count }, () => Math.floor(Math.random() * c.emergeWindow));
      return;
    }
    if (a.phase === 'opening') {
      if (portal.openness >= 0.85) a.phase = 'emerging';
      return;
    }
    a.t++;
    const p = new THREE.Vector3(), out = portal.outward(new THREE.Vector3());
    let waiting = false;
    for (let i = 0; i < s.count; i++) {
      if (!s.hidden[i] || s.warpT[i] > 0) continue;
      if ((a.delays[i] ?? 0) > a.t) { waiting = true; continue; }
      s.hidden[i] = 0;
      portal.exitPoint(p);
      const i3 = i * 3;
      s.pos[i3] = p.x; s.pos[i3 + 1] = p.y; s.pos[i3 + 2] = p.z;
      const jx = out.x + (Math.random() - 0.5) * 0.5, jy = out.y + (Math.random() - 0.5) * 0.5, jz = out.z + (Math.random() - 0.5) * 0.5;
      const l = Math.hypot(jx, jy, jz) || 1;
      s.dir[i3] = s.look[i3] = jx / l; s.dir[i3 + 1] = s.look[i3 + 1] = jy / l; s.dir[i3 + 2] = s.look[i3 + 2] = jz / l;
    }
    if (!waiting && a.t > c.emergeWindow + c.linger) {
      portal.close();
      a.phase = 'done';
    }
  }

  /** The planet is eaten: every ship jumps to hyperspace, one after another. */
  jumpOut() {
    this.homeMode = 'jump';
    this.dropAllBites(0);
    for (const [i, t] of this.towing) this.letGo(i, t);
    this.swarm.jumpAll();
  }

  /** Every ship is gone to hyperspace (the next planet may come). */
  departed() {
    return this.swarm.allHidden;
  }

  /** Move this player's spawn (and tunnel) to a new point in the space frame. */
  setSpawn(spawn) {
    this.spawnSpace.set(spawn.x, spawn.y, spawn.z);
    this.beacon.group.position.copy(this.spawnSpace);
    this.beacon.group.updateWorldMatrix(true, false);
    // before the match starts the swarm waits at its tunnel, so it moves along with it
    if (!this.game.started) this.placeAtSpawn();
  }

  /** Moves the whole swarm (and its target) to the tunnel. */
  placeAtSpawn() {
    const home = this.spawnWorld();
    const s = this.swarm;
    const c = s.count > 0 ? s.center() : home;
    const dx = home.x - c.x, dy = home.y - c.y, dz = home.z - c.z;
    for (let i = 0; i < s.count * 3; i += 3) {
      s.pos[i] += dx; s.pos[i + 1] += dy; s.pos[i + 2] += dz;
    }
    const L = this.leader;
    L.pos.x = home.x; L.pos.y = home.y; L.pos.z = home.z;
    L.vel.x = L.vel.y = L.vel.z = 0;
  }

  /** Current world position of this player's spawn tunnel (`tunnel`). */
  spawnWorld() {
    const p = this.beacon.worldPosition(new THREE.Vector3());
    return { x: p.x, y: p.y, z: p.z };
  }

  /** Every unit drops its bite (releasing the claim) and stops eating. */
  dropAllBites(redirect) {
    const s = this.swarm;
    for (let i = 0; i < s.count; i++) {
      if (s.food[i] >= 0) this.game.planet.release(s.food[i]);
      s.food[i] = -1;
      s.landed[i] = 0;
      s.redirect[i] = redirect;
      s.hungry[i] = 0;
    }
  }

  /**
   * A click / tap: the swarm target heads for the point and every unit drops its current
   * bite, so the whole swarm goes there. Each unit's next bite is
   * the nearest free voxel to the clicked point.
   */
  command(point) {
    if (this.homeMode === 'jump' || !this.game.planet.alive) return;
    this.homeMode = null;
    this.leader.command(point);
    this.swarmWorld.clickPoint = point;
    this.dropAllBites(1);
  }

  /** The tunnel was clicked: the swarm stops eating and flies home, and waits there for a new click. */
  recall() {
    if (this.homeMode === 'jump') return;
    this.homeMode = 'recall';
    this.swarmWorld.clickPoint = null;
    this.dropAllBites(0);
  }

  /** Applies one setting from the panel (locally or sent by a guest). */
  setSetting(key, value) {
    const s = this.swarm;
    if (key === 'count' || key === 'speed' || key === 'power') {
      this.base[key] = value;
      this.applyUpgrades();
    }
    else if (key === 'turn') s.turnSmoothing = value;
    else if (key === 'lasers' || key === 'storms' || key === 'tugs' || key === 'bombers' || key === 'orbs' || key === 'supports') {
      this[key] = Math.max(0, Math.round(value));
      this.applyUpgrades();
    }
  }

  getSetting(key) {
    const s = this.swarm;
    return { count: this.base.count, speed: this.base.speed, power: this.base.power, lasers: this.lasers, storms: this.storms, tugs: this.tugs, bombers: this.bombers, orbs: this.orbs, supports: this.supports, turn: s.turnSmoothing }[key];
  }

  /** Points to spend in the upgrade tree: 1 eaten voxel = 1 point. */
  get points() {
    return this.score - this.tree.spent;
  }

  /** Buys an upgrade with this player's points; false if it isn't available or affordable. */
  buy(id) {
    if (!this.tree.buy(id, this.points)) return false;
    this.applyUpgrades();
    return true;
  }

  /** Slider values plus the bonuses of everything bought in the tree. */
  applyUpgrades() {
    const e = this.tree.effects();
    const s = this.swarm;
    const count = Math.min(CONFIG.swarm.maxCount + 100, Math.round(this.base.count + e.count));
    if (count !== s.count) s.setCount(count);
    s.lasers = Math.min(this.lasers, s.count);
    s.storms = Math.min(this.storms, s.count - s.lasers);
    s.tugs = Math.min(this.tugs, s.count - s.lasers - s.storms);
    s.bombers = Math.min(this.bombers, s.count - s.lasers - s.storms - s.tugs);
    s.orbs = Math.min(this.orbs, s.count - s.lasers - s.storms - s.tugs - s.bombers);
    s.supports = Math.min(this.supports, s.count - s.lasers - s.storms - s.tugs - s.bombers - s.orbs);
    s.speed = this.base.speed * (1 + e.speed);
    this.biteRadius = this.base.power + e.power;
    this.bolt = e.bolt;
  }

  /**
   * Chain lightning: from a random drone it jumps to the nearest drone it hasn't hit yet
   * (within `range`), `jumps` times; every voxel on its way loses `damage` of its strength.
   */
  updateLightning() {
    if (!this.bolt) return;
    this.boltClock += 1 / 60;
    if (this.boltClock < this.bolt.interval) return;
    this.boltClock = 0;
    const s = this.swarm, pos = s.pos, n = s.count;
    if (n < 2) return;
    const hit = new Uint8Array(n);
    let cur = (Math.random() * n) | 0;
    hit[cur] = 1;
    const path = [pos[cur * 3], pos[cur * 3 + 1], pos[cur * 3 + 2]];
    const r2 = this.bolt.range * this.bolt.range;
    for (let j = 0; j < this.bolt.jumps; j++) {
      let best = -1, bestD = r2;
      const x = pos[cur * 3], y = pos[cur * 3 + 1], z = pos[cur * 3 + 2];
      for (let i = 0; i < n; i++) {
        if (hit[i]) continue;
        const d = (pos[i * 3] - x) ** 2 + (pos[i * 3 + 1] - y) ** 2 + (pos[i * 3 + 2] - z) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best < 0) break;
      hit[best] = 1;
      cur = best;
      path.push(pos[cur * 3], pos[cur * 3 + 1], pos[cur * 3 + 2]);
    }
    if (path.length < 6) return;
    this.game.planet.weakenAlong(path, this.bolt.damage);
    this.game.showBolt(this, path);
  }

  /** A new planet appeared: old bites belonged to the old one. */
  onNewPlanet() {
    this.towing.clear(); // the pieces belonged to the old planet
    this.swarm.orbOut.fill(0); // orbs in flight are gone with the old planet
    this.swarm.tugHas.fill(0);
    this.swarm.tows = [];
    this.swarm.food.fill(-1);
    this.swarm.landed.fill(0);
    // a new arrival through the tunnel
    this.swarm.resetWarp();
    this.swarm.hidden.fill(1);
    this.arrival = { phase: 'pending', t: 0, delays: null };
    this.placeAtSpawn();
    this.planetScore = 0;
    this.homeMode = null;
    this.leader.commanded = false;
    this.leader.goal = null;
  }

  /** While travelling to a click, the swarm target flies around the planet, not through it. */
  keepLeaderOverSurface() {
    const L = this.leader;
    const planet = this.game.planet;
    if (!L.commanded || !planet.alive) return;
    const a = CONFIG.swarm.avoid;
    const way = aroundPlanet(L.pos.x, L.pos.y, L.pos.z, L.goal.x, L.goal.y, L.goal.z, planet.R, a);
    const r = Math.hypot(L.pos.x, L.pos.y, L.pos.z) || 1;
    if (way || (L.distanceTo(L.goal) > a.minDistance && r < planet.R + a.altitude)) {
      const k = (planet.R + a.altitude) / r;
      if (k > 1) { L.pos.x *= k; L.pos.y *= k; L.pos.z *= k; }
    }
    // steer the target's velocity towards the waypoint, so it arcs over the surface
    if (way) {
      const dx = way[0] - L.pos.x, dy = way[1] - L.pos.y, dz = way[2] - L.pos.z;
      const d = Math.hypot(dx, dy, dz) || 1, v = CONFIG.leader.maxSpeed;
      L.vel.x = (dx / d) * v; L.vel.y = (dy / d) * v; L.vel.z = (dz / d) * v;
    }
  }

  /** One simulation step for this player's swarm. */
  update() {
    const planet = this.game.planet;
    planet.exposedNear(this.leader.pos, CONFIG.leader.feedSenseRadius, this.candidates);
    this.freeCandidates = 0;
    for (const idx of this.candidates) if (planet.claims[idx] === 0) this.freeCandidates++;

    this.updateArrival();
    const L = this.leader;
    if (this.homeMode === 'recall') {
      // called home: the swarm target keeps following the tunnel (it moves as space turns)
      L.goal = this.spawnWorld();
      L.commanded = true;
      L.dwell = 0;
    }
    L.update(this.world);
    this.keepLeaderOverSurface();

    this.swarmWorld.planetRadius = planet.alive ? planet.R : 0;
    this.swarmWorld.holding = Boolean(this.homeMode);
    this.updateTugs();
    this.swarm.update(L.pos, this.swarmWorld);
    this.removeDead();
    this.updateSupport();
    this.updateLightning();

    this.beacon.active = this.homeMode === 'recall';
  }

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
  }

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
  }

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
  }

  /** An orb burst: the ship that fired it may fire again. */
  orbDone(id) {
    const s = this.swarm;
    for (let i = 0; i < s.count; i++) if (s.orbOut[i] === id) s.orbOut[i] = 0;
  }

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
  }

  /** A tug lets go of its piece (it changed type, the piece is gone, …). */
  letGo(i, t) {
    const f = t.f;
    if (!f.dead) {
      if (f.tug === this) f.tug = null;
      if (t.on) { f.towed = false; f.vel.set(0, 0, 0); f.origin.copy(f.pos); }
    }
    this.towing.delete(i);
    this.swarm.tugHas[i] = 0;
  }

  dispose() {
    for (const [i, t] of this.towing) this.letGo(i, t);
    this.swarm.disposeTows();
    this.dropAllBites(0);
    this.game.scene.remove(this.swarm.mesh);
    this.game.scene.remove(this.swarm.beams.band, this.swarm.beams.hits);
    this.swarm.stormBolts.clear();
    this.beacon.group.parent?.remove(this.beacon.group);
  }
}
