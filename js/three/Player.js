import { CONFIG } from '../config.js';
import { Swarm3D, aroundPlanet } from './Swarm3D.js';
import { SpawnBeacon } from './SpawnBeacon.js';
import { Leader } from '../core/Leader.js';
import { SkillTree } from '../core/SkillTree.js';

const THREE = window.THREE;

/**
 * One player: a swarm with its own target ("brain"), spawn beacon, settings and score.
 * In single player there is one; in multiplayer the host runs one per player.
 * All players eat the same planet and share its voxel claims, so a voxel is only ever
 * eaten by one unit of one swarm.
 */
export class Player {
  /**
   * @param {object} game the Game3D instance (planet, scene, debris…)
   * @param {{index:number, name:string, color:number, beaconColor:number, spawn:{x,y,z}}} info
   *   spawn is in the space frame (the beacon stays put in space while the planet turns)
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
    this.tree = new SkillTree();
    this.bolt = null;       // chain lightning settings once bought
    this.boltClock = 0;     // seconds since the last bolt
    this.homeMode = null;   // null | 'recall' (called back by the beacon) | 'return' (planet eaten)
    this.score = 0;         // voxels eaten in total
    this.planetScore = 0;   // voxels eaten of the current planet
    this.wins = 0;          // planets won (PvP)
    this.ready = false;     // multiplayer: pressed Start in the waiting room
    this.nextReady = true;  // multiplayer: pressed Next planet on the summary (true while there is none)

    this.beacon = new SpawnBeacon(game.space.group, this.spawnSpace.clone(), { ...CONFIG.beacon, color: info.beaconColor });
    const start = this.spawnWorld();
    this.leader = new Leader(CONFIG.leader, start, ['x', 'y', 'z']);
    this.swarm = new Swarm3D(game.scene, { ...CONFIG.swarm, color: info.color }, new THREE.Vector3(start.x, start.y, start.z));

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
      feeding: false,
      // test mechanic (checkbox): every unit goes to the nearest free voxel from its own position
      nearestMode: CONFIG.swarm.nearestMode,
      clickPoint: null,
      planetRadius: 0,
      holding: false, // called back home: nobody picks new bites
      // a free (unclaimed) voxel near the swarm target. Shared only when the planet has
      // fewer exposed voxels left than there are units (there are no more).
      pickFood: (p) => {
        const pl = game.planet;
        if (this.swarmWorld.nearestMode) {
          const idx = pl.nearestFree(p, pl.count < this.swarm.count, nearestScratch);
          pl.claim(idx);
          return idx;
        }
        const list = this.candidates;
        const n = list.length;
        if (n === 0) return -1;
        const start = (Math.random() * n) | 0;
        for (let k = 0; k < n; k++) {
          const idx = list[(start + k) % n];
          if (pl.claims[idx] === 0 && pl.hp[idx] > 0) {
            pl.claim(idx);
            this.freeCandidates--;
            return idx;
          }
        }
        if (pl.count >= this.swarm.count) return -1;
        const idx = list[start];
        pl.claim(idx);
        return idx;
      },
      release: (idx) => game.planet.release(idx),
      claim: (idx) => game.planet.claim(idx),
      canBite: (idx, ownFood) => !game.planet.claimedByOther(idx, ownFood),
      cellCenter: (idx) => game.planet.cellCenter(idx, feedCenter),
      cellAt: (p) => game.planet.cellAt(p),
      isSolidCell: (idx) => idx >= 0 && game.planet.hp[idx] > 0,
      bite: (idx, ownFood) => game.biteCell(idx, ownFood, this),
    };
  }

  /** Move this player's spawn (and beacon) to a new point in the space frame. */
  setSpawn(spawn) {
    this.spawnSpace.set(spawn.x, spawn.y, spawn.z);
    this.beacon.group.position.copy(this.spawnSpace);
    this.beacon.group.updateWorldMatrix(true, false);
    // before the match starts the swarm waits at its beacon, so it moves along with it
    if (!this.game.started) this.placeAtSpawn();
  }

  /** Moves the whole swarm (and its target) to the beacon. */
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

  /** Current world position of this player's spawn beacon. */
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
    }
  }

  /**
   * A click / tap: the swarm target heads for the point and every unit drops its current
   * bite, so the whole swarm goes there. In nearest-block mode each unit's next bite is
   * the nearest free voxel to the clicked point.
   */
  command(point) {
    if (this.homeMode === 'return' || !this.game.planet.alive) return;
    this.homeMode = null;
    this.leader.command(point);
    this.swarmWorld.clickPoint = point;
    this.dropAllBites(1);
  }

  /** The beacon was clicked: the swarm stops eating and flies home, and waits there for a new click. */
  recall() {
    if (this.homeMode === 'return') return;
    this.homeMode = 'recall';
    this.swarmWorld.clickPoint = null;
    this.dropAllBites(0);
  }

  /** The planet is eaten: fly home. */
  returnHome() {
    this.homeMode = 'return';
    this.dropAllBites(0);
  }

  /** Switches the nearest-block test mechanic; units drop their current bites and pick again by the new rule. */
  setNearestMode(on) {
    this.swarmWorld.nearestMode = Boolean(on);
    this.dropAllBites(0);
  }

  /** Applies one setting from the panel (locally or sent by a guest). */
  setSetting(key, value) {
    const s = this.swarm;
    if (key === 'count' || key === 'speed' || key === 'power') {
      this.base[key] = value;
      this.applyUpgrades();
    } else if (key === 'spacing') s.separationDistance = value;
    else if (key === 'cohesion') s.cohesion = value;
    else if (key === 'nearest') this.setNearestMode(value);
  }

  getSetting(key) {
    const s = this.swarm;
    return { count: this.base.count, speed: this.base.speed, power: this.base.power, spacing: s.separationDistance,
      cohesion: s.cohesion, nearest: this.swarmWorld.nearestMode }[key];
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
    this.swarm.food.fill(-1);
    this.swarm.landed.fill(0);
    this.planetScore = 0;
    this.homeMode = null;
    this.leader.commanded = false;
    this.leader.goal = null;
  }

  /** Whether the swarm has gathered at its beacon (used before the next planet appears). */
  gatheredAtHome() {
    const home = this.spawnWorld();
    const c = this.swarm.center();
    const g = Math.hypot(c.x - home.x, c.y - home.y, c.z - home.z) < CONFIG.beacon.gatherRadius;
    return g && this.leader.distanceTo(home) < CONFIG.beacon.arriveRadius;
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

    const L = this.leader;
    if (this.homeMode) {
      // heading home: the swarm target keeps following the beacon (it moves as space turns)
      L.goal = this.spawnWorld();
      L.commanded = true;
      L.dwell = 0;
    }
    L.update(this.world);
    this.keepLeaderOverSurface();

    // while the swarm target is travelling to a clicked point, units follow it instead of eating
    const travelling = L.commanded && L.distanceTo(L.goal) > CONFIG.leader.arriveRadius;
    this.swarmWorld.planetRadius = planet.alive ? planet.R : 0;
    this.swarmWorld.holding = Boolean(this.homeMode);
    this.swarmWorld.feeding = this.candidates.length > 0 && !travelling && !this.homeMode;
    this.swarm.update(L.pos, this.swarmWorld);
    this.updateLightning();

    this.beacon.active = Boolean(this.homeMode);
  }

  dispose() {
    this.dropAllBites(0);
    this.game.scene.remove(this.swarm.mesh);
    this.beacon.group.parent?.remove(this.beacon.group);
  }
}
