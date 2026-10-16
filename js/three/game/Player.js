import { CONFIG, SHIP_KINDS, kindConfig } from '../../config.js';
import { Swarm3D } from '../swarm/Swarm3D.js';
import { aroundPlanet } from '../swarm/steering.js';
import { Portal3D } from '../scene/Portal3D.js';
import { Leader } from '../../core/Leader.js';
import { SkillTree } from '../../core/SkillTree.js';
import { Arrival } from './arrival.js';
import { ShipRoles } from './ships.js';
import { Upgrades } from './upgrades.js';

const THREE = window.THREE;

/**
 * One player: a swarm with its own target ("brain"), spawn tunnel (`this.beacon`), settings and score.
 * In single player there is one; in multiplayer the host runs one per player.
 * All players eat the same planet and share its voxel claims, so a voxel is only ever
 * eaten by one unit of one swarm.
 *
 * This file: setting up, commands, settings, a new planet, the frame step. The rest is in
 * arrival.js (the tunnel: coming out of it, jumping to hyperspace), ships.js (tugs, bombers,
 * orb and support ships) and upgrades.js (points, the tree, chain lightning).
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
    this.drillRadius = this.biteRadius * CONFIG.swarm.drill.power; // drills: what goes around the bit
    // slider values; the upgrade tree adds its bonuses on top (see applyUpgrades)
    this.base = { count: CONFIG.swarm.count, speed: CONFIG.swarm.speed, power: CONFIG.swarm.biteRadius };
    // ship types: how many units are laser ships (this.lasers), storm ships, tugs, … (SHIP_KINDS);
    // the rest are eaters
    for (const k of SHIP_KINDS) this[k] = CONFIG.swarm[kindConfig(k)].count;
    this.scraps = [];       // drifting pieces small enough for cleaners (found every frame)
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
    this.splitKinds();
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
      // cleaners: the nearest free voxel of a small drifting piece (see this.scraps), or -1
      pickScrap: (p) => {
        const pl = game.planet, fr = pl.fragments;
        if (!fr || !this.scraps.length) return -1;
        let best = -1, bestD = Infinity;
        for (const f of this.scraps) {
          if (f.dead) continue;
          for (const c of fr.cellsOf(f)) {
            if (pl.claims[c] > 0) continue;
            fr.worldCenter(c, feedCenter);
            const d = (feedCenter.x - p.x) ** 2 + (feedCenter.y - p.y) ** 2 + (feedCenter.z - p.z) ** 2;
            if (d < bestD) { bestD = d; best = c; }
          }
        }
        if (best >= 0) pl.claim(best);
        return best;
      },
      isScrap: (idx) => {
        const fr = game.planet.fragments;
        const f = fr && idx >= 0 && fr.fragOf[idx] >= 0 ? fr.byId.get(fr.fragOf[idx]) : null;
        return Boolean(f && !f.dead && f.count <= CONFIG.swarm.cleaner.maxPiece);
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
      pierce: (idx, i) => game.pierceCell(idx, this, i),
      pierceLine: (i, x, y, z, D, E) => game.pierceLine(this, i, x, y, z, D, E),
      bomb: (i, x, y, z) => game.explode(x, y, z, this),
      fireOrb: (i, idx, x, y, z) => game.fireOrb(this, i, idx, x, y, z),
      fireShot: (i, idx, x, y, z) => game.fireShot(this, i, idx, x, y, z),
      fireBubble: (i, idx, x, y, z) => game.fireBubble(this, i, idx, x, y, z),
      // drills: everything around the bit at (x, y, z) is gone; returns how many voxels
      drill: (i, x, y, z) => game.destroySphere(x, y, z, this.drillRadius, this, CONFIG.swarm.drill.debris),
      drillRadius: () => this.drillRadius,
      drillAt: (x, y, z) => game.clearCell(x, y, z, this),
      isFloating: (idx) => (game.planet.fragments?.fragOf[idx] ?? -1) >= 0,
    };
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
    else if (SHIP_KINDS.includes(key)) {
      this[key] = Math.max(0, Math.round(value));
      this.applyUpgrades();
    }
  }

  getSetting(key) {
    if (SHIP_KINDS.includes(key)) return this[key];
    return { count: this.base.count, speed: this.base.speed, power: this.base.power, turn: this.swarm.turnSmoothing }[key];
  }

  /** A new planet appeared: old bites belonged to the old one. */
  onNewPlanet() {
    this.towing.clear(); // the pieces belonged to the old planet
    this.swarm.orbOut.fill(0); // orbs in flight are gone with the old planet
    this.swarm.splashOut.fill(0); // … and splashers' bubbles
    this.swarm.snipePhase.fill(0); // snipers charge again on the new planet
    this.swarm.snipeT.fill(0);
    this.swarm.tugHas.fill(0);
    this.swarm.pierceOn.fill(0); // (the line was on the old planet)
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
    // ships added while the others jump (Units slider, an upgrade) jump too
    if (this.homeMode === 'jump') this.swarm.jumpAll();
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
    // pieces small enough for cleaners
    const fr = planet.fragments, maxPiece = CONFIG.swarm.cleaner.maxPiece;
    this.scraps = this.swarm.cleaners && fr ? fr.list.filter((f) => !f.dead && f.count <= maxPiece) : [];
    this.swarm.update(L.pos, this.swarmWorld);
    this.removeDead();
    this.updateSupport();
    this.updateLightning();

    this.beacon.active = this.homeMode === 'recall';
  }

  dispose() {
    for (const [i, t] of this.towing) this.letGo(i, t);
    this.swarm.disposeTows();
    this.dropAllBites(0);
    this.game.scene.remove(this.swarm.mesh);
    this.game.scene.remove(this.swarm.beams.band, this.swarm.beams.hits, this.swarm.piercerBeams.band, this.swarm.piercerBeams.hits);
    this.swarm.piercerBolts.clear();
    this.swarm.stormBolts.clear();
    this.beacon.group.parent?.remove(this.beacon.group);
  }
}

for (const part of [Arrival, ShipRoles, Upgrades]) {
  Object.defineProperties(Player.prototype, Object.getOwnPropertyDescriptors(part));
}
