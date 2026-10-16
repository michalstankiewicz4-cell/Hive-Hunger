import { Lightning3D } from '../effects/Lightning3D.js';
import { aroundPlanet, nearOwnBite } from './steering.js';
import { ShipTypes } from './types.js';
import { RemoteSwarm } from './remote.js';
import { Hyperspace } from './warp.js';
import { Beams, makeBeams } from './beams.js';
import { TowBeams } from './tows.js';
import { DrillBits } from './drills.js';

const THREE = window.THREE;
const FORWARD = new THREE.Vector3(0, 0, 1);
const HASH_SIZE = 4096; // power of two
const AXES = ['x', 'y', 'z'];
const MAX_STEP = 0.2;   // max movement step length (less than half a voxel)

/**
 * The swarm as a flock (boids). Every unit:
 *  - keeps its distance from neighbours (separation),
 *  - flies the same way as its neighbours (alignment),
 *  - stays with the group (cohesion),
 *  - heads for the swarm target.
 * All units fly at the same constant speed — only their direction changes.
 * Neighbours are found through a spatial hash grid, so it stays smooth with over a thousand units.
 */
export class Swarm3D {
  constructor(scene, cfg, spawn) {
    this.cfg = cfg;
    this.max = cfg.maxCount;
    this.count = 0;
    this.speed = cfg.speed; // shared, constant speed of all units (changed by a slider)
    this.spawn = spawn.clone();
    this.pos = new Float32Array(this.max * 3);
    this.dir = new Float32Array(this.max * 3);
    this.look = new Float32Array(this.max * 3); // drawn heading (smoothed), see render()
    // every unit has its own "bite" — a voxel it deliberately flies to in order to eat it
    this.food = new Int32Array(this.max).fill(-1);
    this.foodPos = new Float32Array(this.max * 3);
    // 1 = the unit has landed on its bite and is eating it
    this.landed = new Uint8Array(this.max);
    // 1 = the unit was sent somewhere by a click and has not arrived yet;
    // its next bite is picked near the clicked point
    this.redirect = new Uint8Array(this.max);
    // getting unstuck: best distance to the current target so far, frames without progress,
    // and the last voxel that blocked the unit (with how many frames ago that was)
    this.best = new Float32Array(this.max).fill(Infinity);
    this.stuck = new Uint16Array(this.max);
    this.lastBlock = new Int32Array(this.max).fill(-1);
    this.blockAge = new Uint8Array(this.max).fill(255);
    // frames a unit with a bite has gone without eating, and frames left of its pause before
    // it picks another bite (it can't catch its bite — e.g. on a fast-turning piece)
    this.hungry = new Uint16Array(this.max);
    this.pause = new Uint8Array(this.max);

    // ship types: units 0 … lasers−1 are red laser ships — they eat their bite from a distance
    // (`laser.reach`) and fly `laser.speedFactor` slower; the rest eat it up close
    this.lasers = 0;
    // units lasers … lasers+storms−1 are blue storm ships: from laser range their lightning
    // forks into three — the bite and the two voxels nearest to it (see Game3D.stormCell)
    this.storms = 0;
    this.stormSides = new Float32Array(this.max * 6); // where the two side bolts hit
    // the next `tugs` units are green tugs: they don't eat — they fly to drifting pieces and tow
    // them home with a tractor beam (Player.updateTugs sets where each one flies, and the tows)
    this.tugs = 0;
    this.tugGoal = new Float32Array(this.max * 3);
    this.tugHas = new Uint8Array(this.max);
    // the next `bombers` units are purple bombers: they fly to the nearest voxel and, touching it,
    // blow up everything within `bomber.radius` — and die (Player removes them after the update)
    this.bombers = 0;
    this.dying = [];
    // the next `orbs` units are magenta orb ships: from `orb.range` they fire a slow plasma orb at
    // their bite (one at a time) that bursts there; orbOut = the id of the orb a ship has in flight
    this.orbs = 0;
    this.orbOut = new Int32Array(this.max);
    // the next `supports` units are white support ships: they don't eat — every `support.every`
    // frames one fires a lightning bolt that jumps between ships of its swarm (Player.updateSupport)
    this.supports = 0;
    this.zapWait = new Uint16Array(this.max);
    // the next `cleaners` units are grey cleaners: they eat only drifting pieces of at most
    // `cleaner.maxPiece` voxels (world.pickScrap / isScrap); with none about they fly with the swarm
    this.cleaners = 0;
    // the next `drills` units are orange drills: landed on their bite, they drill straight towards the
    // planet's centre (drillDir) for at most `drill.maxLength` (drillLeft), destroying everything
    // around the bit (world.drill); drillIdle counts frames without a voxel since the last one, drillHit
    // says one was hit at all. The bit is drawn in drills.js
    // the last `piercers` units are copper piercers: from `piercer.reach` an orange beam through
    // `piercer.pierce` voxels in a row (world.pierce), a yellow lightning winding round it (beams.js)
    this.piercers = 0;
    this.pierceOn = new Uint8Array(this.max);        // firing along a locked line
    this.pierceDir = new Float32Array(this.max * 3); // the line's direction
    this.pierceEnd = new Float32Array(this.max * 3); // where the beam ends now (the nearest voxel hit)
    this.pierceAfter = new Uint16Array(this.max);    // frames since it got through
    this.drills = 0;
    this.drillLeft = new Float32Array(this.max);
    this.drillDir = new Float32Array(this.max * 3);
    this.drillIdle = new Uint16Array(this.max);
    this.drillHit = new Uint8Array(this.max);
    this.drillAim = new Uint8Array(this.max); // its drilling direction is picked (turning to it)
    // arrival and departure: `hidden` ships are not out of the tunnel yet / gone to hyperspace
    // (not simulated, not drawn); a ship jumping to hyperspace waits `warpDelay` frames, then
    // speeds up along `warpDir` for `warp.frames` frames (warpT counts them) and is gone, leaving a streak
    this.hidden = new Uint8Array(this.max);
    this.warpDelay = new Int16Array(this.max).fill(-1);
    this.warpT = new Int16Array(this.max);
    this.warpDir = new Float32Array(this.max * 3);
    this.warpFrom = new Float32Array(this.max * 3);
    this.trails = [];        // hyperspace streaks: { from, to, age, speedAge }
    this.started = [];       // (host) ships that began their jump this frame: [[unit, dx, dy, dz], …]
    this.tows = [];           // [[unit, fragment id], …] — tractor beams on now
    this.fragmentById = null; // (id) => fragment (set by the player)
    this.towBeams = [];       // tractor beam meshes, one per tow being drawn
    this.stormSideN = new Uint8Array(this.max);
    // laser beams being fired: per unit 1/0 and the point it hits (set by the simulation, or on a
    // guest from the host's snapshot)
    this.firing = new Uint8Array(this.max);
    this.aimed = new Uint8Array(this.max); // a landed laser ship faces its bite (it only fires then)
    this.beamTo = new Float32Array(this.max * 3);
    this.remote = false; // a guest's copy (positions from the host)

    // parameters changed by sliders
    this.separationDistance = cfg.separationDistance;
    this.turnSmoothing = cfg.turnSmoothing; // how fast a ship turns its nose (slider Turning)
    this.cohesion = cfg.weights.cohesion;

    this.head = new Int32Array(HASH_SIZE);
    this.next = new Int32Array(this.max);

    const [w, h, l] = cfg.size;
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(w, h, l),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      this.max,
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 3), 3);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    // colours by ship type, the same for every player (see types.js): eaters yellow, the others
    // from their CONFIG.swarm entries
    this.baseColor = new THREE.Color(cfg.eaterColor);
    this.colorsFor = null; // the split the colours were set for
    this.scene = scene;
    // the storm ships' lightning (the chain-lightning look, short-lived flashes)
    this.stormBolts = new Lightning3D(scene, { life: cfg.storm.flashFrames, jag: 0.25, pieces: 4 });
    this.stormClock = 0;

    // laser beams: a glowing band per firing laser ship (a quad turned towards the camera, a
    // white-hot core fading to red at the edges) and a glow where it hits
    this.beams = makeBeams(this.max, cfg.laser);
    scene.add(this.beams.band, this.beams.hits);
    // piercers: orange beams, and the yellow spiral lightning round them (a glow like the support ships' bolt)
    this.piercerBeams = makeBeams(this.max, cfg.piercer);
    scene.add(this.piercerBeams.band, this.piercerBeams.hits);
    this.piercerBolts = new Lightning3D(scene, { life: cfg.piercer.flashFrames, jag: 0.02, pieces: 1, glowPx: cfg.piercer.glowPx });
    this.piercerClock = 0;

    this.dummy = new THREE.Object3D();
    this.v = new THREE.Vector3();
    this.setCount(cfg.count);
  }

  /** Changes the number of units live. New ones appear near the flock's centre. */
  setCount(n) {
    const c = this.cfg;
    n = Math.max(c.minCount, Math.min(this.max, Math.round(n)));
    if (n > this.count) {
      const center = this.count > 0 ? this.center() : this.spawn;
      for (let i = this.count; i < n; i++) {
        const i3 = i * 3;
        this.pos[i3] = center.x + (Math.random() - 0.5) * c.spawnSpread;
        this.pos[i3 + 1] = center.y + (Math.random() - 0.5) * c.spawnSpread;
        this.pos[i3 + 2] = center.z + (Math.random() - 0.5) * c.spawnSpread;
        // random direction, uniform on the sphere
        const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, q = Math.sqrt(1 - u * u);
        this.dir[i3] = q * Math.cos(a);
        this.dir[i3 + 1] = u;
        this.dir[i3 + 2] = q * Math.sin(a);
        this.look[i3] = this.dir[i3]; this.look[i3 + 1] = this.dir[i3 + 1]; this.look[i3 + 2] = this.dir[i3 + 2];
        this.food[i] = -1;
        this.landed[i] = 0;
        this.redirect[i] = 0;
        this.best[i] = Infinity;
        this.stuck[i] = 0;
        this.lastBlock[i] = -1;
        this.blockAge[i] = 255;
        this.hungry[i] = 0;
        this.pause[i] = 0;
        this.hidden[i] = 0;
        this.warpDelay[i] = -1;
        this.warpT[i] = 0;
        this.drillLeft[i] = 0;
        this.drillAim[i] = 0;
        this.pierceOn[i] = 0;
      }
    }
    // removed units release their claims
    for (let i = n; i < this.count; i++) {
      if (this.food[i] >= 0) this.world?.release(this.food[i]);
      this.food[i] = -1;
    }
    this.count = n;
    this.mesh.count = n;
  }

  /**
   * Ship i, landed on (or, a laser ship, at range from) its bite: turns towards it; true once
   * its (drawn) heading faces it within `aimAngle` — then it eats.
   */
  aim(i) {
    const i3 = i * 3, pos = this.pos, fp = this.foodPos, dir = this.dir, look = this.look;
    let tx = fp[i3] - pos[i3], ty = fp[i3 + 1] - pos[i3 + 1], tz = fp[i3 + 2] - pos[i3 + 2];
    const tl = Math.hypot(tx, ty, tz);
    if (tl < 1e-3) { this.aimed[i] = 1; return true; } // right on it: nothing to face
    tx /= tl; ty /= tl; tz /= tl;
    dir[i3] = tx; dir[i3 + 1] = ty; dir[i3 + 2] = tz;
    const ok = look[i3] * tx + look[i3 + 1] * ty + look[i3 + 2] * tz >= this.aimCos;
    this.aimed[i] = ok ? 1 : 0;
    return ok;
  }

  /** A drill turning its (drawn) nose towards its drilling direction; true once it faces it. */
  aimDrill(i) {
    const i3 = i * 3, look = this.look, D = this.drillDir;
    return look[i3] * D[i3] + look[i3 + 1] * D[i3 + 1] + look[i3 + 2] * D[i3 + 2] >= this.aimCos;
  }

  get aimCos() {
    return Math.cos((this.cfg.aimAngle * Math.PI) / 180);
  }

  /**
   * The drawn heading follows the flying direction smoothly (turnSmoothing), so sharp changes —
   * sliding along a wall, landing on a bite — don't look like snapping. Part of the simulation,
   * because a laser ship aims with it; on a guest it runs while drawing.
   */
  turnLook() {
    const k = this.turnSmoothing, look = this.look, dir = this.dir;
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      // turning right round: start the turn to one side (straight back it would never turn)
      if (look[i3] * dir[i3] + look[i3 + 1] * dir[i3 + 1] + look[i3 + 2] * dir[i3 + 2] < -0.999) {
        look[i3] += dir[i3 + 1] * 0.1; look[i3 + 1] -= dir[i3] * 0.1; look[i3 + 2] += 0.05;
      }
      let lx = look[i3] + (dir[i3] - look[i3]) * k;
      let ly = look[i3 + 1] + (dir[i3 + 1] - look[i3 + 1]) * k;
      let lz = look[i3 + 2] + (dir[i3 + 2] - look[i3 + 2]) * k;
      const l = Math.hypot(lx, ly, lz);
      if (l < 1e-4) { lx = dir[i3]; ly = dir[i3 + 1]; lz = dir[i3 + 2]; }
      else { lx /= l; ly /= l; lz /= l; }
      look[i3] = lx; look[i3 + 1] = ly; look[i3 + 2] = lz;
    }
  }

  /** Units in red (lasers) and in the swarm's colour (eaters). */

  center() {
    const out = new THREE.Vector3();
    for (let i = 0; i < this.count; i++) out.x += this.pos[i * 3], out.y += this.pos[i * 3 + 1], out.z += this.pos[i * 3 + 2];
    return out.divideScalar(this.count || 1);
  }

  hash(ix, iy, iz) {
    return ((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) & (HASH_SIZE - 1);
  }

  /** Neighbour perception radius — at least a bit larger than the spacing. */
  get perception() {
    return Math.max(this.cfg.perception, this.separationDistance * 1.3);
  }

  buildGrid() {
    const cell = this.perception;
    this.head.fill(-1);
    for (let i = 0; i < this.count; i++) {
      const h = this.hash(
        Math.floor(this.pos[i * 3] / cell),
        Math.floor(this.pos[i * 3 + 1] / cell),
        Math.floor(this.pos[i * 3 + 2] / cell),
      );
      this.next[i] = this.head[h];
      this.head[h] = i;
    }
  }

  /**
   * @param {{x:number,y:number,z:number}} target the swarm target
   * @param {object} world
   *   pickFood(p): index of the nearest free voxel to p (every unit eats the nearest one to itself), or -1,
   *   pickScrap(p) / isScrap(idx): the same for cleaners — only voxels of small drifting pieces,
   *   cellCenter(idx): voxel centre (where it is now), cellAt(p), isSolidCell(idx): a voxel in
   *   its place in the grid (collisions), isFood(idx): still there to eat (also on a drifting
   *   fragment), floatingAt(p): fragment voxel at a point or -1, bite(idx)
   */
  update(target, world) {
    const c = this.cfg;
    const w = c.weights;
    const { pos, dir, food, foodPos, landed, best, stuck, lastBlock, blockAge } = this;
    const cell = this.perception;
    const per2 = cell * cell;
    const sep2 = this.separationDistance * this.separationDistance;
    this.world = world;
    const p = { x: 0, y: 0, z: 0 };

    this.buildGrid();
    this.turnLook(); // the heading drawn — and the one a laser ship aims with

    this.stepWarp();

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;

      if (this.hidden[i] || this.warpT[i] > 0) continue; // not here (yet / any more), or jumping away
      if (this.dying.length && this.dying.includes(i)) continue; // blew up this frame
      // drilling: straight on through the voxels, eating everything around the bit
      if (this.drillLeft[i] > 0) {
        if (!this.isDrill(i) || world.holding) { this.drillLeft[i] = 0; continue; } // another type now / called back
        const dc = c.drill, D = this.drillDir;
        pos[i3] += D[i3] * dc.speed; pos[i3 + 1] += D[i3 + 1] * dc.speed; pos[i3 + 2] += D[i3 + 2] * dc.speed;
        dir[i3] = D[i3]; dir[i3 + 1] = D[i3 + 1]; dir[i3 + 2] = D[i3 + 2];
        // the bit is just ahead of the ship
        const ahead = world.drillRadius() * 0.6;
        // (and the voxel the ship itself is in, so a narrow tunnel never leaves it inside the rock)
        const n = world.drill(i, pos[i3] + D[i3] * ahead, pos[i3 + 1] + D[i3 + 1] * ahead, pos[i3 + 2] + D[i3 + 2] * ahead)
          + world.drillAt(pos[i3], pos[i3 + 1], pos[i3 + 2]);
        if (n > 0) { this.drillHit[i] = 1; this.drillIdle[i] = 0; } else this.drillIdle[i]++;
        this.drillLeft[i] -= dc.speed;
        // through: empty space for a while after the last voxel (or nothing at all from the start)
        if (this.drillIdle[i] > dc.emptyFrames) this.drillLeft[i] = 0;
        if (this.drillLeft[i] <= 0) { this.drillLeft[i] = 0; best[i] = Infinity; stuck[i] = 0; }
        continue;
      }
      // a piercer locked on a line: it fires along it until it is through, then `piercer.afterFrames`
      // (2 s) more, then switches off and flies on
      if (this.pierceOn[i]) {
        if (!this.isPiercer(i) || world.holding) { this.pierceOn[i] = 0; continue; } // another type now / called back
        const E = this.pierceEnd;
        const hit = world.pierceLine(i, pos[i3], pos[i3 + 1], pos[i3 + 2], this.pierceDir, E);
        this.hungry[i] = 0;
        dir[i3] = this.pierceDir[i3]; dir[i3 + 1] = this.pierceDir[i3 + 1]; dir[i3 + 2] = this.pierceDir[i3 + 2];
        if (hit) this.pierceAfter[i] = 0; // (E: the nearest voxel hit)
        else if (++this.pierceAfter[i] >= c.piercer.afterFrames) { this.pierceOn[i] = 0; best[i] = Infinity; stuck[i] = 0; }
        continue;
      }
      // giving up on a bite it couldn't reach: stays still for a moment, then picks another
      if (this.pause[i] > 0) {
        if (--this.pause[i] === 0) this.retarget(i, world);
        continue;
      }

      // landed on its bite: eats it until it is gone, then takes off
      if (landed[i]) {
        if (food[i] >= 0 && world.isFood(food[i]) && !this.isTug(i) && !this.isSupport(i)) {
          // a bomber touching its voxel blows up (and is gone)
          if (this.isBomber(i)) {
            world.bomb(i, foodPos[i3], foodPos[i3 + 1], foodPos[i3 + 2]);
            this.dying.push(i);
            landed[i] = 0;
            continue;
          }
          // a drill on its bite: turns towards the planet's centre (a little off it, at random, so the
          // way back out isn't the same tunnel) and starts drilling (its bite goes with the rest); on a
          // drifting piece it eats like an eater
          if (this.isDrill(i) && !world.isFloating(food[i])) {
            if (this.drillLeft[i] === 0 && !this.drillAim[i]) {
              const l = Math.hypot(pos[i3], pos[i3 + 1], pos[i3 + 2]) || 1, t = c.drill.spread;
              let x = -pos[i3] / l + (Math.random() * 2 - 1) * t, y = -pos[i3 + 1] / l + (Math.random() * 2 - 1) * t, z = -pos[i3 + 2] / l + (Math.random() * 2 - 1) * t;
              const m = Math.hypot(x, y, z) || 1;
              this.drillDir[i3] = x / m; this.drillDir[i3 + 1] = y / m; this.drillDir[i3 + 2] = z / m;
              this.drillAim[i] = 1;
            }
            dir[i3] = this.drillDir[i3]; dir[i3 + 1] = this.drillDir[i3 + 1]; dir[i3 + 2] = this.drillDir[i3 + 2];
            if (!this.aimDrill(i)) continue; // turns its nose to the centre first
            world.release(food[i]);
            food[i] = -1;
            landed[i] = 0;
            this.drillAim[i] = 0;
            this.drillLeft[i] = c.drill.maxLength;
            this.drillIdle[i] = 0;
            this.drillHit[i] = 0;
            this.hungry[i] = 0;
            continue;
          }
          // a bite on a drifting fragment moves: the unit holds on and moves with it
          const fc = world.cellCenter(food[i]);
          // (unless that would carry it into the planet: then it stays and eats from where it is)
          p.x = pos[i3] + fc.x - foodPos[i3]; p.y = pos[i3 + 1] + fc.y - foodPos[i3 + 1]; p.z = pos[i3 + 2] + fc.z - foodPos[i3 + 2];
          if (!world.isSolidCell(world.cellAt(p))) { pos[i3] = p.x; pos[i3 + 1] = p.y; pos[i3 + 2] = p.z; }
          foodPos[i3] = fc.x; foodPos[i3 + 1] = fc.y; foodPos[i3 + 2] = fc.z;
          // every ship first turns to face its bite and eats (a laser ship: fires) only then
          if (!this.aim(i)) continue;
          if (this.isOrb(i)) {
            // an orb ship fires one orb at a time and waits for it to burst
            if (!this.orbOut[i]) this.orbOut[i] = world.fireOrb(i, food[i], pos[i3], pos[i3 + 1], pos[i3 + 2]);
            this.hungry[i] = 0;
            continue;
          }
          if (this.isStorm(i)) {
            const at = world.storm(food[i], food[i]);
            this.stormSideN[i] = at.length / 3;
            for (let k = 0; k < at.length; k++) this.stormSides[i * 6 + k] = at[k];
          } else if (this.isPiercer(i)) {
            if (world.isFloating(food[i])) world.pierce(food[i], i); // on a drifting piece: just its bite
            else {
              // aimed: the line from here through the bite is locked, and it fires along it to the end
              const l = Math.hypot(foodPos[i3] - pos[i3], foodPos[i3 + 1] - pos[i3 + 1], foodPos[i3 + 2] - pos[i3 + 2]) || 1;
              this.pierceDir[i3] = (foodPos[i3] - pos[i3]) / l;
              this.pierceDir[i3 + 1] = (foodPos[i3 + 1] - pos[i3 + 1]) / l;
              this.pierceDir[i3 + 2] = (foodPos[i3 + 2] - pos[i3 + 2]) / l;
              this.pierceEnd[i3] = foodPos[i3]; this.pierceEnd[i3 + 1] = foodPos[i3 + 1]; this.pierceEnd[i3 + 2] = foodPos[i3 + 2];
              this.pierceOn[i] = 1;
              this.pierceAfter[i] = 0;
              world.release(food[i]);
              food[i] = -1;
              landed[i] = 0;
            }
          } else world.bite(food[i], food[i]);
          this.hungry[i] = 0;
          continue;
        }
        landed[i] = 0;
        this.drillAim[i] = 0; // (a drill picks its direction again next time)
      }

      const px = pos[i3], py = pos[i3 + 1], pz = pos[i3 + 2];
      const laser = i < this.lasers;
      const orb = this.isOrb(i);
      const piercer = this.isPiercer(i);
      const ranged = laser || orb || piercer || this.isStorm(i); // laser, storm, orb ships and piercers eat from a distance
      const speed = laser ? this.speed * c.laser.speedFactor : this.speed;
      let sx = 0, sy = 0, sz = 0;   // separation
      let ax = 0, ay = 0, az = 0;   // alignment
      let cx = 0, cy = 0, cz = 0;   // cohesion
      let n = 0;

      const gx = Math.floor(px / cell), gy = Math.floor(py / cell), gz = Math.floor(pz / cell);
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) for (let oz = -1; oz <= 1; oz++) {
        for (let j = this.head[this.hash(gx + ox, gy + oy, gz + oz)]; j !== -1; j = this.next[j]) {
          if (j === i) continue;
          const j3 = j * 3;
          const dx = px - pos[j3], dy = py - pos[j3 + 1], dz = pz - pos[j3 + 2];
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > per2 || d2 === 0) continue;
          n++;
          ax += dir[j3]; ay += dir[j3 + 1]; az += dir[j3 + 2];
          cx += pos[j3]; cy += pos[j3 + 1]; cz += pos[j3 + 2];
          if (d2 < sep2) { sx += dx / d2; sy += dy / d2; sz += dz / d2; }
        }
      }

      // the unit's target: at matter — its own bite, otherwise — the swarm target
      let tx = target.x, ty = target.y, tz = target.z;
      let targetWeight = w.target;
      let flocking = 1;
      // a bite is kept until eaten, even when the swarm moves on; new ones are picked near the swarm target
      if (food[i] >= 0 && !world.isFood(food[i])) {
        world.release(food[i]);
        food[i] = -1;
      }
      const tug = this.isTug(i);
      const passive = tug || this.isSupport(i); // tugs and support ships don't eat
      // a cleaner eats only small drifting pieces (at most `cleaner.maxPiece` voxels)
      const cleaner = this.isCleaner(i);
      // was another type a moment ago (a slider moved): its bite isn't one for it any more
      if (food[i] >= 0 && (passive || (cleaner && !world.isScrap(food[i])))) { world.release(food[i]); food[i] = -1; }
      if (food[i] < 0 && !passive && !world.holding) {
        p.x = px; p.y = py; p.z = pz;
        if (cleaner) {
          food[i] = world.pickScrap(p);
        } else if (this.redirect[i] && world.clickPoint) {
          food[i] = world.pickFood(world.clickPoint);
        } else {
          food[i] = world.pickFood(p);
        }
        if (food[i] >= 0) {
          const fc = world.cellCenter(food[i]);
          foodPos[i3] = fc.x; foodPos[i3 + 1] = fc.y; foodPos[i3 + 2] = fc.z;
          best[i] = Infinity;
          stuck[i] = 0;
        }
      }
      if (food[i] >= 0) {
        const fc = world.cellCenter(food[i]); // a fragment's voxels move
        foodPos[i3] = fc.x; foodPos[i3 + 1] = fc.y; foodPos[i3 + 2] = fc.z;
        tx = foodPos[i3]; ty = foodPos[i3 + 1]; tz = foodPos[i3 + 2];
        targetWeight = w.feed;
        // no free flying — only separation stays, the unit flies straight to its voxel
        flocking = 0;
      }
      // a tug flies to its piece (or, towing it, ahead of it towards home)
      if (tug && this.tugHas[i]) {
        tx = this.tugGoal[i3]; ty = this.tugGoal[i3 + 1]; tz = this.tugGoal[i3 + 2];
        targetWeight = w.feed;
        flocking = 0;
      }

      // no bite eaten for `retarget.frames` while chasing one: stop for `retarget.pauseFrames`
      // (a moving bite may come closer meanwhile), then take another (see retarget)
      if (food[i] >= 0 && !world.holding) {
        if (++this.hungry[i] >= c.retarget.frames) {
          this.hungry[i] = 0;
          this.pause[i] = c.retarget.pauseFrames;
          continue;
        }
      } else this.hungry[i] = 0;

      // within reach of its own bite: land on it. At constant speed a unit could otherwise
      // circle a small, isolated scrap forever without ever touching it.
      if (food[i] >= 0) {
        const fx0 = foodPos[i3] - px, fy0 = foodPos[i3 + 1] - py, fz0 = foodPos[i3 + 2] - pz;
        // a laser ship stops at laser range and eats from there
        const reach = (orb ? c.orb.range : piercer ? c.piercer.reach : ranged ? c.laser.reach : c.reachDistance) + speed;
        if (fx0 * fx0 + fy0 * fy0 + fz0 * fz0 < reach * reach) {
          landed[i] = 1;
          this.aimed[i] = 0; // a new bite: it must turn to it first
          this.redirect[i] = 0;
          const l0 = Math.hypot(fx0, fy0, fz0) || 1;
          dir[i3] = fx0 / l0; dir[i3 + 1] = fy0 / l0; dir[i3 + 2] = fz0 / l0;
          continue;
        }
      }

      // stuck detection: no progress towards the target for a while, while touching a wall
      // (a corner of a crater or tunnel) → bite through the blocking voxel if it isn't someone
      // else's, otherwise turn in a random direction to slide out
      const goalDist = Math.hypot(tx - px, ty - py, tz - pz);
      if (goalDist < best[i] - c.stuck.progress) { best[i] = goalDist; stuck[i] = 0; } else stuck[i]++;
      if (blockAge[i] < 255) blockAge[i]++;
      if (stuck[i] > c.stuck.frames) {
        const b = lastBlock[i];
        if (blockAge[i] < c.stuck.recentContact && world.isFood(b)) {
          if (!world.holding && !passive && world.canBite(b, food[i]) && (!cleaner || world.isScrap(b))) {
            if (b !== food[i]) {
              world.release(food[i]);
              world.claim(b);
              food[i] = b;
              const fc = world.cellCenter(b);
              foodPos[i3] = fc.x; foodPos[i3 + 1] = fc.y; foodPos[i3 + 2] = fc.z;
            }
            landed[i] = 1;
            this.aimed[i] = 0;
          } else {
            const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, q = Math.sqrt(1 - u * u);
            dir[i3] = q * Math.cos(a); dir[i3 + 1] = u; dir[i3 + 2] = q * Math.sin(a);
          }
        }
        stuck[i] = 0;
        best[i] = Infinity;
        if (landed[i]) continue;
      }

      // planet in the way: aim for a waypoint over the surface instead, so the unit flies around it
      const way = aroundPlanet(px, py, pz, tx, ty, tz, world.planetRadius, c.avoid);
      if (way) { tx = way[0]; ty = way[1]; tz = way[2]; }

      // sum of steering forces (each a weighted unit vector)
      let fx = 0, fy = 0, fz = 0;
      const add = (x, y, z, weight) => {
        const l = Math.hypot(x, y, z);
        if (l > 1e-6) { fx += (x / l) * weight; fy += (y / l) * weight; fz += (z / l) * weight; }
      };
      add(sx, sy, sz, w.separation);
      if (n > 0) {
        add(ax, ay, az, w.alignment * flocking);
        add(cx / n - px, cy / n - py, cz / n - pz, this.cohesion * flocking);
      }
      add(tx - px, ty - py, tz - pz, targetWeight);

      // turn at a limited rate, then normalise → constant speed
      let dx = dir[i3] + fx * c.turnRate, dy = dir[i3 + 1] + fy * c.turnRate, dz = dir[i3 + 2] + fz * c.turnRate;
      let l = Math.hypot(dx, dy, dz) || 1;
      dx /= l; dy /= l; dz /= l;

      // Move axis by axis; at high speed split into substeps so a voxel can't be skipped.
      // A solid voxel stops movement along that axis — no bounce and no passing through:
      //  - a feeding unit that hits its own or a free voxel lands on it and starts eating,
      //  - otherwise it slides along the surface.
      p.x = px; p.y = py; p.z = pz;
      // a fragment that drifted onto the unit doesn't trap it: it may fly out
      const inFragment = world.floatingAt(p) >= 0;
      const d = [dx, dy, dz];
      const substeps = Math.max(1, Math.ceil(speed / MAX_STEP));
      const stepLen = speed / substeps;
      move: for (let s = 0; s < substeps; s++) {
        for (let a = 0; a < 3; a++) {
          const ax2 = AXES[a];
          const old = p[ax2];
          p[ax2] = old + d[a] * stepLen;
          let idx = world.cellAt(p);
          // the grid, then the drifting fragments (units don't fly through them either)
          if (!world.isSolidCell(idx) && (inFragment || (idx = world.floatingAt(p)) < 0)) continue;
          p[ax2] = old;
          // land on its own bite or a free voxel. Only next to its own bite —
          // touching the planet on the way somewhere else is not a reason to stop there
          if (food[i] >= 0 && world.canBite(idx, food[i]) && (!cleaner || idx === food[i] || world.isScrap(idx)) &&
              (idx === food[i] || nearOwnBite(world.cellCenter(idx), foodPos, i3, c.landSwapDistance))) {
            if (idx !== food[i]) {
              world.release(food[i]);
              world.claim(idx);
              food[i] = idx;
              const fc = world.cellCenter(idx);
              foodPos[i3] = fc.x; foodPos[i3 + 1] = fc.y; foodPos[i3 + 2] = fc.z;
            }
            landed[i] = 1;
            this.aimed[i] = 0;
            // landed on a bite it flew to (picked near the click): it has arrived, from now on it
            // eats on from here. (Biting through a wall when stuck does not count — see above.)
            this.redirect[i] = 0;
            d[0] = foodPos[i3] - p.x; d[1] = foodPos[i3 + 1] - p.y; d[2] = foodPos[i3 + 2] - p.z; // face the bite
            break move;
          }
          d[a] = 0; // slide
          lastBlock[i] = idx;
          blockAge[i] = 0;
        }
      }

      pos[i3] = p.x; pos[i3 + 1] = p.y; pos[i3 + 2] = p.z;
      l = Math.hypot(d[0], d[1], d[2]);
      if (l > 1e-6) { dir[i3] = d[0] / l; dir[i3 + 1] = d[1] / l; dir[i3 + 2] = d[2] / l; }
      else { dir[i3] = dx; dir[i3 + 1] = dy; dir[i3 + 2] = dz; }
    }
  }

  /**
   * After a pause: unit `i` takes another free bite (its own stays claimed while it looks, so
   * it isn't picked again). If there is no other, it goes back to the one it had.
   */
  retarget(i, world) {
    const old = this.food[i];
    if (old < 0 || !world.isFood(old)) return; // gone meanwhile: a new one is picked as usual
    const i3 = i * 3;
    const at = { x: this.pos[i3], y: this.pos[i3 + 1], z: this.pos[i3 + 2] };
    const idx = this.isCleaner(i) ? world.pickScrap(at) : world.pickFood(at);
    if (idx < 0) return; // nothing else: keep the old one
    world.release(old);  // the old bite, or the extra claim when the same one came back
    if (idx === old) return;
    this.food[i] = idx;
    const fc = world.cellCenter(idx);
    this.foodPos[i3] = fc.x; this.foodPos[i3 + 1] = fc.y; this.foodPos[i3 + 2] = fc.z;
    this.best[i] = Infinity;
    this.stuck[i] = 0;
  }


  /**
   * Draws the units with their smoothed heading (see turnLook) and the laser beams.
   */
  render(camera) {
    this.updateColors();
    this.renderBeams(camera);
    this.renderPiercers(camera);
    this.renderStorms(camera);
    this.renderTows();
    this.renderTrails(camera);
    if (this.remote) this.turnLook(); // a guest's copy: no simulation turns it
    this.renderDrills(); // after turnLook: the bits follow the drawn heading
    const dm = this.dummy;
    const look = this.look;
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      if (this.hidden[i]) { this.mesh.setMatrixAt(i, HIDDEN); continue; }
      const lx = look[i3], ly = look[i3 + 1], lz = look[i3 + 2];
      dm.position.set(this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2]);
      dm.quaternion.setFromUnitVectors(FORWARD, this.v.set(lx, ly, lz));
      dm.updateMatrix();
      this.mesh.setMatrixAt(i, dm.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

// the rest of the swarm, one file per part: ship types, a guest's copy, hyperspace, laser beams and
// storm bolts, tractor beams
for (const part of [ShipTypes, RemoteSwarm, Hyperspace, Beams, TowBeams, DrillBits]) {
  Object.defineProperties(Swarm3D.prototype, Object.getOwnPropertyDescriptors(part));
}
