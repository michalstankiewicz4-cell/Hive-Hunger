import { CONFIG, SHIP_KINDS, GROUP_KINDS, kindConfig } from '../../config.js';
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
    this.spawnBase = { x: info.spawn.x, y: info.spawn.y, z: info.spawn.z }; // (Earth-sized; see setSpawn)
    const k = game.sizeScale || 1;
    this.spawnSpace = new THREE.Vector3(info.spawn.x * k, info.spawn.y * k, info.spawn.z * k);

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
    // what each group of ships was told (GROUP_KINDS order): mode null (on its own), 'go' (sent to
    // `point`: its next bites are the nearest voxels to it; ships that don't eat fly there, then
    // carry on as usual) or 'home' (called back to the tunnel: no eating, waiting there)
    this.groups = GROUP_KINDS.map((kind) => ({ kind, mode: null, point: null, dwell: 0 }));
    this.swarmWorld = {
      groups: this.groups,
      planetRadius: 0,
      holding: false, // jumping to hyperspace: nobody picks new bites
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
      // (a ship in a booster's field: `booster.boost` × the crater radius and × as hard; drills: × the radius)
      bite: (idx, ownFood, i) => game.biteCell(idx, ownFood, this, this.boostOf(i)),
      storm: (idx, ownFood, i) => game.stormCell(idx, ownFood, this, this.boostOf(i)),
      pierce: (idx, i) => game.pierceCell(idx, this, i),
      pierceLine: (i, x, y, z, D, E) => game.pierceLine(this, i, x, y, z, D, E),
      cutLine: (i, x, y, z, D, S, L, R, B) => game.cutLine(this, i, x, y, z, D, S, L, R, B),
      cutPiece: (i, x, y, z, D, S, L, R, id) => game.cutPiece(this, i, x, y, z, D, S, L, R, id),
      pieceOf: (idx) => game.planet.fragments?.fragOf[idx] ?? -1,
      bomb: (i, x, y, z) => game.explode(x, y, z, this),
      fireOrb: (i, idx, x, y, z) => game.fireOrb(this, i, idx, x, y, z),
      fireShot: (i, idx, x, y, z) => game.fireShot(this, i, idx, x, y, z),
      fireBubble: (i, idx, x, y, z) => game.fireBubble(this, i, idx, x, y, z),
      // drills: everything around the bit at (x, y, z) is gone; returns how many voxels
      drill: (i, x, y, z) => game.destroySphere(x, y, z, this.drillRadius * this.boostOf(i), this, CONFIG.swarm.drill.debris),
      drillRadius: () => this.drillRadius,
      drillAt: (x, y, z) => game.clearCell(x, y, z, this),
      isFloating: (idx) => (game.planet.fragments?.fragOf[idx] ?? -1) >= 0,
    };
  }

  /** × the Power of unit i: `booster.boost` inside a booster's field, otherwise 1. */
  boostOf(i) {
    return i >= 0 && this.swarm.boosted[i] ? CONFIG.swarm.booster.boost : 1;
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

  /** The group of ships of type `kind` (GROUP_KINDS), or null. */
  group(kind) {
    return this.groups.find((g) => g.kind === kind) || null;
  }

  /**
   * A click / tap on a voxel (the planet or a drifting piece) with group `kind` chosen: only the
   * ships of that type drop their bites and go there — each one's next bite is the nearest free
   * voxel to the point; ships that don't eat fly there and then carry on as usual. The other
   * groups go on with what they were doing.
   */
  command(point, kind = 'eaters') {
    const g = this.group(kind);
    if (!g || this.homeMode === 'jump' || !this.game.planet.alive) return;
    g.mode = 'go';
    g.point = { x: point.x, y: point.y, z: point.z };
    g.dwell = 0;
    this.dropGroupBites(kind, 1);
  }

  /** The tunnel clicked with group `kind` chosen: those ships stop eating, fly home and wait there for a new click. */
  recall(kind = 'eaters') {
    const g = this.group(kind);
    if (!g || this.homeMode === 'jump') return;
    g.mode = 'home';
    g.point = this.spawnWorld();
    this.dropGroupBites(kind, 0);
  }

  /** Is any group called back to the tunnel? (A guest knows only that from the host.) */
  anyHome() {
    return this.homeMode === 'recall' || this.groups.some((g) => g.mode === 'home');
  }

  /** Units first … end of group `kind` (eaters: everything after the other types). */
  groupRange(kind) {
    const s = this.swarm, a = s.kindStart(kind);
    return [a, kind === 'eaters' ? s.count : Math.min(s.count, a + s[kind])];
  }

  /** The ships of group `kind` drop their bites (and tugs their pieces). */
  dropGroupBites(kind, redirect) {
    const s = this.swarm, [a, b] = this.groupRange(kind);
    for (let i = a; i < b; i++) {
      if (s.food[i] >= 0) this.game.planet.release(s.food[i]);
      s.food[i] = -1;
      s.landed[i] = 0;
      s.redirect[i] = redirect;
      s.hungry[i] = 0;
      s.pierceOn[i] = 0; s.cutOn[i] = 0; s.cutAfter[i] = 0; s.drillLeft[i] = 0; // lines and tunnels are left
      const t = this.towing.get(i);
      if (t) this.letGo(i, t);
    }
  }

  /**
   * Buys `n` ships of type `kind` (free for now), at most up to `swarm.maxCount` ships in all.
   * Each new one comes as the last of its type, so no other ship changes its type: a new unit at
   * the end, then moved in front of every later type's first ship. Returns how many were bought.
   */
  buyShips(kind, n = 1) {
    const s = this.swarm;
    if (!GROUP_KINDS.includes(kind)) return 0;
    let bought = 0;
    for (; bought < n && s.count < CONFIG.swarm.maxCount; bought++) {
      this.base.count++;
      this.applyUpgrades(); // a new unit at the end (an eater)
      if (kind === 'eaters') continue;
      let at = s.count - 1;
      const later = SHIP_KINDS.slice(SHIP_KINDS.indexOf(kind) + 1).reverse();
      const eaters = s.kindStart('eaters');
      if (eaters < at) { s.swapUnits(at, eaters); at = eaters; }
      for (const k of later) {
        if (!s[k]) continue;
        const st = s.kindStart(k);
        s.swapUnits(at, st);
        at = st;
      }
      this[kind]++;
      this.applyUpgrades();
    }
    return bought;
  }

  /** Groups sent somewhere: done once one of their ships got there and stayed a moment (or there are none). */
  updateGroups() {
    const s = this.swarm, L = CONFIG.leader;
    for (const g of this.groups) {
      if (g.mode === 'home') { g.point = this.spawnWorld(); continue; } // (the tunnel moves as space turns)
      if (g.mode !== 'go') continue;
      const [a, b] = this.groupRange(g.kind);
      let there = a >= b;
      for (let i = a; i < b && !there; i++) {
        const dx = s.pos[i * 3] - g.point.x, dy = s.pos[i * 3 + 1] - g.point.y, dz = s.pos[i * 3 + 2] - g.point.z;
        if (dx * dx + dy * dy + dz * dz < CONFIG.swarm.groupArrive ** 2 || s.landed[i]) there = true;
      }
      if (there && ++g.dwell > L.dwellFrames) g.mode = null; // (the point stays: bites still being picked near it)
    }
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
    this.swarm.cutOn.fill(0);
    this.swarm.cutAfter.fill(0);
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
    for (const g of this.groups) { g.mode = null; g.point = null; g.dwell = 0; }
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
    L.update(this.world);
    this.updateGroups();
    this.keepLeaderOverSurface();

    this.swarmWorld.planetRadius = planet.alive ? planet.R : 0;
    this.swarmWorld.holding = this.homeMode === 'jump';
    this.updateTugs();
    // pieces small enough for cleaners
    const fr = planet.fragments, maxPiece = CONFIG.swarm.cleaner.maxPiece;
    this.scraps = this.swarm.cleaners && fr ? fr.list.filter((f) => !f.dead && f.count <= maxPiece) : [];
    this.swarm.update(L.pos, this.swarmWorld);
    this.removeDead();
    this.updateSupport();
    this.updateLightning();

    this.beacon.active = this.anyHome();
  }

  dispose() {
    for (const [i, t] of this.towing) this.letGo(i, t);
    this.swarm.disposeTows();
    this.dropAllBites(0);
    this.game.scene.remove(this.swarm.mesh);
    this.game.scene.remove(this.swarm.beams.band, this.swarm.beams.hits, this.swarm.piercerBeams.band, this.swarm.piercerBeams.hits);
    this.swarm.piercerBolts.clear();
    this.swarm.disposeExtras(); // boosters' fields, cutters' sheets
    this.swarm.stormBolts.clear();
    this.beacon.group.parent?.remove(this.beacon.group);
  }
}

for (const part of [Arrival, ShipRoles, Upgrades]) {
  Object.defineProperties(Player.prototype, Object.getOwnPropertyDescriptors(part));
}
