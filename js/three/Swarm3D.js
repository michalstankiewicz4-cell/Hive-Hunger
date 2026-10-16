import { Lightning3D } from './Lightning3D.js';

const THREE = window.THREE;
const FORWARD = new THREE.Vector3(0, 0, 1);
const HASH_SIZE = 4096; // power of two
const AXES = ['x', 'y', 'z'];
const MAX_STEP = 0.2;   // max movement step length (less than half a voxel)

function nearOwnBite(cell, foodPos, i3, maxDist) {
  const dx = cell.x - foodPos[i3], dy = cell.y - foodPos[i3 + 1], dz = cell.z - foodPos[i3 + 2];
  return dx * dx + dy * dy + dz * dz <= maxDist * maxDist;
}

/**
 * If the straight path from p to t passes through the planet (centre at the origin),
 * returns a waypoint over the surface, partway along the great circle towards t (or straight up
 * when the unit is down in a pit); otherwise null.
 */
export function aroundPlanet(px, py, pz, tx, ty, tz, R, cfg) {
  if (!(R > 0)) return null;
  const dx = tx - px, dy = ty - py, dz = tz - pz;
  const len2 = dx * dx + dy * dy + dz * dz;
  if (len2 < cfg.minDistance * cfg.minDistance) return null;
  const s = Math.max(0, Math.min(1, -(px * dx + py * dy + pz * dz) / len2));
  const cx = px + dx * s, cy = py + dy * s, cz = pz + dz * s;
  const pl = Math.hypot(px, py, pz) || 1, tl = Math.hypot(tx, ty, tz) || 1;
  // blocked only when the path dips clearly deeper than both of its ends — i.e. it really
  // goes through the planet (a dive to the bottom of a crater is fine)
  if (Math.hypot(cx, cy, cz) > Math.min(pl, tl, R) - cfg.dipMargin) return null;

  let ux = px / pl, uy = py / pl, uz = pz / pl;
  // below the surface (in a pit it has dug): climb straight out first, the way it came in
  if (pl < R - cfg.pitDepth) return [ux * (R + cfg.altitude), uy * (R + cfg.altitude), uz * (R + cfg.altitude)];
  let mx = ux + tx / tl, my = uy + ty / tl, mz = uz + tz / tl;
  let ml = Math.hypot(mx, my, mz);
  if (ml < 1e-3) { mx = -uy; my = ux; mz = 0; ml = Math.hypot(mx, my, mz) || 1; } // opposite sides: any perpendicular
  mx /= ml; my /= ml; mz /= ml;
  // halfway between "above me" and the great-circle midpoint, at a safe altitude
  let wx = ux + mx, wy = uy + my, wz = uz + mz;
  const wl = Math.hypot(wx, wy, wz) || 1;
  const alt = Math.max(pl, R + cfg.altitude);
  return [(wx / wl) * alt, (wy / wl) * alt, (wz / wl) * alt];
}

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
    // in nearest-block mode its next bite is picked near the clicked point
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
    // colours by ship type, the same for every player: eaters, laser ships, storm ships
    this.baseColor = new THREE.Color(cfg.eaterColor);
    this.laserColor = new THREE.Color(cfg.laser.color);
    this.stormColor = new THREE.Color(cfg.storm.color);
    this.tugColor = new THREE.Color(cfg.tug.color);
    this.coloredTugs = -1;
    this.scene = scene;
    this.coloredStorms = -1;
    // the storm ships' lightning (the chain-lightning look, short-lived flashes)
    this.stormBolts = new Lightning3D(scene, { life: cfg.storm.flashFrames, jag: 0.25, pieces: 4 });
    this.stormClock = 0;
    this.coloredLasers = -1; // lasers shown in red last time (colours are set again when it changes)

    // laser beams: a glowing band per firing laser ship (a quad turned towards the camera, a
    // white-hot core fading to red at the edges) and a glow where it hits
    this.beams = makeBeams(this.max, cfg.laser);
    scene.add(this.beams.band, this.beams.hits);

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

  /** Laser ships among the units (the first `lasers` of them). */
  isLaser(i) {
    return i < this.lasers;
  }

  /** Units in red (lasers) and in the swarm's colour (eaters). */
  updateColors() {
    const n = Math.min(this.lasers, this.count), m = Math.min(n + this.storms, this.count), t = Math.min(m + this.tugs, this.count);
    if (n === this.coloredLasers && m === this.coloredStorms && t === this.coloredTugs && this.colorsFor === this.count) return;
    this.coloredLasers = n;
    this.coloredStorms = m;
    this.coloredTugs = t;
    this.colorsFor = this.count;
    for (let i = 0; i < this.count; i++) {
      this.mesh.setColorAt(i, i < n ? this.laserColor : i < m ? this.stormColor : i < t ? this.tugColor : this.baseColor);
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  /** Tugs among the units (after the storm ships). */
  isTug(i) {
    const a = this.lasers + this.storms;
    return i >= a && i < a + this.tugs;
  }

  /** Storm ships among the units (after the laser ships). */
  isStorm(i) {
    return i >= this.lasers && i < this.lasers + this.storms;
  }

  /**
   * Multiplayer guest: show positions and headings received from the host instead of
   * simulating. Units move smoothly towards the received positions between updates.
   */
  setRemote(count, pos, dir, lasers = 0, beams = null, storms = 0, bolts = null, tugs = 0, tows = null) {
    this.remote = true;
    this.lasers = lasers;
    this.storms = storms;
    this.tugs = tugs;
    this.tows = tows || [];
    this.remoteBolts = bolts || [];
    this.firing.fill(0);
    if (beams) for (const [i, x, y, z] of beams) {
      if (i >= this.max) continue;
      this.firing[i] = 1;
      this.beamTo[i * 3] = x; this.beamTo[i * 3 + 1] = y; this.beamTo[i * 3 + 2] = z;
    }
    count = Math.min(count, this.max);
    if (count !== this.count) {
      for (let i = this.count; i < count; i++) {
        const i3 = i * 3;
        for (let a = 0; a < 3; a++) {
          this.pos[i3 + a] = pos[i3 + a];
          this.dir[i3 + a] = dir[i3 + a];
          this.look[i3 + a] = dir[i3 + a];
        }
      }
      this.count = count;
      this.mesh.count = count;
    }
    if (!this.remotePos || this.remotePos.length < count * 3) {
      this.remotePos = new Float32Array(this.max * 3);
    }
    this.remotePos.set(pos.subarray(0, count * 3));
    this.dir.set(dir.subarray(0, count * 3));
  }

  /** Multiplayer guest: one display step towards the last positions from the host. */
  followRemote(k) {
    if (!this.remotePos) return;
    const n = this.count * 3;
    for (let i = 0; i < n; i++) {
      const d = this.remotePos[i] - this.pos[i];
      // a big jump (e.g. a new planet or a respawn) snaps instead of sliding across the screen
      this.pos[i] = Math.abs(d) > 6 ? this.remotePos[i] : this.pos[i] + d * k;
    }
  }

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
   *   feeding: whether the swarm target is at matter (units then eat deliberately),
   *   nearestMode: test mechanic — each unit picks the nearest free voxel to itself and never idles,
   *   pickFood(p): index of a voxel to eat (near the target, or nearest to p in nearestMode), or -1,
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

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;

      // giving up on a bite it couldn't reach: stays still for a moment, then picks another
      if (this.pause[i] > 0) {
        if (--this.pause[i] === 0) this.retarget(i, world);
        continue;
      }

      // landed on its bite: eats it until it is gone, then takes off
      if (landed[i]) {
        if (food[i] >= 0 && world.isFood(food[i]) && !this.isTug(i)) {
          // a bite on a drifting fragment moves: the unit holds on and moves with it
          const fc = world.cellCenter(food[i]);
          pos[i3] += fc.x - foodPos[i3]; pos[i3 + 1] += fc.y - foodPos[i3 + 1]; pos[i3 + 2] += fc.z - foodPos[i3 + 2];
          foodPos[i3] = fc.x; foodPos[i3 + 1] = fc.y; foodPos[i3 + 2] = fc.z;
          // every ship first turns to face its bite and eats (a laser ship: fires) only then
          if (!this.aim(i)) continue;
          if (this.isStorm(i)) {
            const at = world.storm(food[i], food[i]);
            this.stormSideN[i] = at.length / 3;
            for (let k = 0; k < at.length; k++) this.stormSides[i * 6 + k] = at[k];
          } else world.bite(food[i], food[i]);
          this.hungry[i] = 0;
          continue;
        }
        landed[i] = 0;
      }

      const px = pos[i3], py = pos[i3 + 1], pz = pos[i3 + 2];
      const laser = i < this.lasers;
      const ranged = laser || this.isStorm(i); // laser and storm ships eat from laser range
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
      if (tug && food[i] >= 0) { world.release(food[i]); food[i] = -1; } // was an eater a moment ago
      if (food[i] < 0 && !tug && (world.feeding || world.nearestMode) && !world.holding) {
        p.x = px; p.y = py; p.z = pz;
        if (world.nearestMode && this.redirect[i] && world.clickPoint) {
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
        // nearestMode: no free flying — only separation stays, the unit flies straight to its voxel
        flocking = world.nearestMode ? 0 : c.feedFlocking;
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
        const reach = (ranged ? c.laser.reach : c.reachDistance) + speed;
        if (fx0 * fx0 + fy0 * fy0 + fz0 * fz0 < reach * reach) {
          landed[i] = 1;
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
          if (!world.holding && !tug && world.canBite(b, food[i])) {
            if (b !== food[i]) {
              world.release(food[i]);
              world.claim(b);
              food[i] = b;
              const fc = world.cellCenter(b);
              foodPos[i3] = fc.x; foodPos[i3 + 1] = fc.y; foodPos[i3 + 2] = fc.z;
            }
            landed[i] = 1;
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
          // land on its own bite or a free voxel. In nearest-block mode only next to its own bite —
          // touching the planet on the way somewhere else is not a reason to stop there
          if (food[i] >= 0 && world.canBite(idx, food[i]) &&
              (idx === food[i] || !world.nearestMode || nearOwnBite(world.cellCenter(idx), foodPos, i3, c.landSwapDistance))) {
            if (idx !== food[i]) {
              world.release(food[i]);
              world.claim(idx);
              food[i] = idx;
              const fc = world.cellCenter(idx);
              foodPos[i3] = fc.x; foodPos[i3 + 1] = fc.y; foodPos[i3 + 2] = fc.z;
            }
            landed[i] = 1;
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
    const idx = world.pickFood({ x: this.pos[i3], y: this.pos[i3 + 1], z: this.pos[i3 + 2] });
    if (idx < 0) return; // nothing else: keep the old one
    world.release(old);  // the old bite, or the extra claim when the same one came back
    if (idx === old) return;
    this.food[i] = idx;
    const fc = world.cellCenter(idx);
    this.foodPos[i3] = fc.x; this.foodPos[i3 + 1] = fc.y; this.foodPos[i3 + 2] = fc.z;
    this.best[i] = Infinity;
    this.stuck[i] = 0;
  }

  /** Laser beams: from every laser ship eating its bite (and facing it) to the bite. */
  renderBeams(camera) {
    const firing = this.firing, to = this.beamTo;
    if (!this.remote) {
      // here the simulation runs: a landed laser ship that faces its bite is firing
      for (let i = 0; i < this.count; i++) {
        const on = i < this.lasers && this.landed[i] && this.aimed[i] && this.food[i] >= 0 ? 1 : 0;
        firing[i] = on;
        if (on) { to[i * 3] = this.foodPos[i * 3]; to[i * 3 + 1] = this.foodPos[i * 3 + 1]; to[i * 3 + 2] = this.foodPos[i * 3 + 2]; }
      }
    }
    const { band, hits, cfg } = this.beams;
    const P = band.geometry.attributes.position.array, H = hits.geometry.attributes.position.array;
    const cam = camera ? camera.position : null;
    const t = performance.now() * 0.02;
    let n = 0;
    for (let i = 0; i < this.count; i++) {
      if (!firing[i]) continue;
      const i3 = i * 3;
      const ax = this.pos[i3], ay = this.pos[i3 + 1], az = this.pos[i3 + 2];
      const bx = to[i3], by = to[i3 + 1], bz = to[i3 + 2];
      // across the beam, facing the camera: beam × (camera → middle)
      let dx = bx - ax, dy = by - ay, dz = bz - az;
      let vx = (ax + bx) / 2 - (cam ? cam.x : 0), vy = (ay + by) / 2 - (cam ? cam.y : 0), vz = (az + bz) / 2 - (cam ? cam.z : 100);
      let sx = dy * vz - dz * vy, sy = dz * vx - dx * vz, sz = dx * vy - dy * vx;
      const sl = Math.hypot(sx, sy, sz) || 1;
      const w = cfg.width * (0.85 + 0.15 * Math.sin(t + i * 1.7)) / 2; // a slight shimmer
      sx = (sx / sl) * w; sy = (sy / sl) * w; sz = (sz / sl) * w;
      const o = n * 12;
      P[o] = ax - sx; P[o + 1] = ay - sy; P[o + 2] = az - sz;
      P[o + 3] = ax + sx; P[o + 4] = ay + sy; P[o + 5] = az + sz;
      P[o + 6] = bx - sx; P[o + 7] = by - sy; P[o + 8] = bz - sz;
      P[o + 9] = bx + sx; P[o + 10] = by + sy; P[o + 11] = bz + sz;
      H[n * 3] = bx; H[n * 3 + 1] = by; H[n * 3 + 2] = bz;
      n++;
    }
    band.geometry.setDrawRange(0, n * 6);
    band.geometry.attributes.position.needsUpdate = true;
    hits.geometry.setDrawRange(0, n);
    hits.geometry.attributes.position.needsUpdate = true;
    hits.material.size = cfg.hitSize * (0.8 + 0.4 * Math.random());
    band.material.opacity = 0.85 + 0.15 * Math.random();
    this.beamCount = n;
  }

  /**
   * Storm ships' lightning, a fresh flash every `storm.flashEvery` frames: straight at the bite,
   * forking at `storm.fork` of the way into the bolt to the bite and two weaker ones to the side voxels.
   */
  renderStorms(camera) {
    const sc = this.cfg.storm;
    this.stormBolts.update(camera);
    if (++this.stormClock % sc.flashEvery !== 0) return;
    for (const [i, x, y, z, sides] of this.stormList()) {
      if (i >= this.count) continue;
      const i3 = i * 3, px = this.pos[i3], py = this.pos[i3 + 1], pz = this.pos[i3 + 2];
      const fx = px + (x - px) * sc.fork, fy = py + (y - py) * sc.fork, fz = pz + (z - pz) * sc.fork;
      this.stormBolts.show([px, py, pz, fx, fy, fz, x, y, z], sc.boltColor, 1);
      for (let k = 0; k + 2 < sides.length; k += 3) {
        this.stormBolts.show([fx, fy, fz, sides[k], sides[k + 1], sides[k + 2]], sc.boltColor, sc.sideGlow);
      }
    }
  }

  /**
   * Tractor beams: a green cone from each towing tug over the whole piece, made of a soft glow
   * and streaks of light, brightest at the tug.
   */
  renderTows() {
    let n = 0;
    const v = this.v, up = TOW_UP;
    for (const [i, id] of this.tows) {
      const f = this.fragmentById?.(id);
      if (!f || f.dead || i >= this.count) continue;
      const beam = this.towBeams[n] || (this.towBeams[n] = makeTowBeam(this.cfg.tug, this.scene));
      n++;
      const i3 = i * 3;
      beam.group.position.set(this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2]);
      v.copy(f.pos).sub(beam.group.position);
      const len = v.length() || 1;
      beam.group.quaternion.setFromUnitVectors(up, v.divideScalar(len));
      const r = f.radius * 1.05;
      beam.group.scale.set(r, len, r);
      beam.group.visible = true;
      if ((this.stormClock + n) % 3 === 0) beam.shimmer();
      beam.cone.material.opacity = 0.32 + Math.random() * 0.08;
    }
    for (let k = n; k < this.towBeams.length; k++) this.towBeams[k].group.visible = false;
  }

  /** Removes the tractor beam meshes (the swarm is going away). */
  disposeTows() {
    for (const b of this.towBeams) this.scene.remove(b.group);
    this.towBeams = [];
  }

  /** Storm ships firing now: [[unit, x, y, z, [side points…]], …] (on a guest: from the host). */
  stormList() {
    if (this.remote) return this.remoteBolts || [];
    const out = [];
    const end = Math.min(this.lasers + this.storms, this.count);
    for (let i = this.lasers; i < end; i++) {
      if (!(this.landed[i] && this.aimed[i] && this.food[i] >= 0)) continue;
      const i3 = i * 3, n = this.stormSideN[i] * 3;
      out.push([i, this.foodPos[i3], this.foodPos[i3 + 1], this.foodPos[i3 + 2], Array.from(this.stormSides.subarray(i * 6, i * 6 + n))]);
    }
    return out;
  }

  /** Units currently firing their laser, with the point they hit: [[unit, x, y, z], …] */
  beamList() {
    const out = [];
    for (let i = 0; i < Math.min(this.lasers, this.count); i++) {
      if (this.firing[i]) out.push([i, this.beamTo[i * 3], this.beamTo[i * 3 + 1], this.beamTo[i * 3 + 2]]);
    }
    return out;
  }

  /**
   * Draws the units with their smoothed heading (see turnLook) and the laser beams.
   */
  render(camera) {
    this.updateColors();
    this.renderBeams(camera);
    this.renderStorms(camera);
    this.renderTows();
    if (this.remote) this.turnLook(); // a guest's copy: no simulation turns it
    const dm = this.dummy;
    const look = this.look;
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      const lx = look[i3], ly = look[i3 + 1], lz = look[i3 + 2];
      dm.position.set(this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2]);
      dm.quaternion.setFromUnitVectors(FORWARD, this.v.set(lx, ly, lz));
      dm.updateMatrix();
      this.mesh.setMatrixAt(i, dm.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const TOW_UP = new THREE.Vector3(0, 1, 0);

/**
 * One tractor beam: in unit size along +y from the tug (scaled to the piece): an open cone with a
 * glow fading from the tug, and streaks of light from the tug to random points across the piece.
 */
function makeTowBeam(cfg, scene) {
  const group = new THREE.Group();
  // along the cone: bright at the tug (bottom of the canvas = the tug end), fading out
  const c = document.createElement('canvas');
  c.width = 4; c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 64, 0, 0);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0.08)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 64);
  const coneGeo = new THREE.CylinderGeometry(1, 0.04, 1, 24, 1, true);
  coneGeo.translate(0, 0.5, 0); // the narrow end at the tug, the wide one over the piece
  const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(c), color: cfg.beamColor, transparent: true, opacity: 0.35,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  // streaks: bright at the tug, dim at the piece
  const n = cfg.streaks;
  const pos = new Float32Array(n * 6), col = new Float32Array(n * 6);
  const bright = new THREE.Color(cfg.beamColor), dim = bright.clone().multiplyScalar(0.12);
  for (let k = 0; k < n; k++) {
    col.set([bright.r, bright.g, bright.b, dim.r, dim.g, dim.b], k * 6);
  }
  const streakGeo = new THREE.BufferGeometry();
  streakGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  streakGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const streaks = new THREE.LineSegments(streakGeo, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  const shimmer = () => {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.95;
      pos.set([0, 0, 0, Math.cos(a) * r, 1, Math.sin(a) * r], k * 6);
    }
    streakGeo.attributes.position.needsUpdate = true;
  };
  shimmer();
  for (const m of [cone, streaks]) m.frustumCulled = false;
  group.add(cone, streaks);
  scene.add(group);
  return { group, cone, streaks, shimmer };
}

/** Laser beam meshes: glowing bands (camera-facing quads) and a glow at each hit point. */
function makeBeams(max, cfg) {
  // across the band: transparent edge → red glow → white-hot core → red glow → edge
  const c = document.createElement('canvas');
  c.width = 4; c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.22, 'rgba(120,0,0,1)');
  grad.addColorStop(0.42, 'rgba(255,60,40,1)');
  grad.addColorStop(0.5, 'rgba(255,235,225,1)');
  grad.addColorStop(0.58, 'rgba(255,60,40,1)');
  grad.addColorStop(0.78, 'rgba(120,0,0,1)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 64);
  const bandTex = new THREE.CanvasTexture(c);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 12), 3).setUsage(THREE.DynamicDrawUsage));
  const uv = new Float32Array(max * 8), index = [];
  for (let n = 0; n < max; n++) {
    uv.set([0, 0, 0, 1, 1, 0, 1, 1], n * 8);
    const v = n * 4;
    index.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.setDrawRange(0, 0);
  const band = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map: bandTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  band.frustumCulled = false;

  // where it hits: a soft round glow
  const h = document.createElement('canvas');
  h.width = h.height = 64;
  const hg = h.getContext('2d');
  const rad = hg.createRadialGradient(32, 32, 0, 32, 32, 32);
  rad.addColorStop(0, 'rgba(255,240,230,1)');
  rad.addColorStop(0.25, 'rgba(255,80,50,0.9)');
  rad.addColorStop(0.6, 'rgba(160,10,0,0.35)');
  rad.addColorStop(1, 'rgba(0,0,0,0)');
  hg.fillStyle = rad;
  hg.fillRect(0, 0, 64, 64);
  const hitGeo = new THREE.BufferGeometry();
  hitGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage));
  hitGeo.setDrawRange(0, 0);
  const hits = new THREE.Points(hitGeo, new THREE.PointsMaterial({
    map: new THREE.CanvasTexture(h), size: cfg.hitSize, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  hits.frustumCulled = false;
  return { band, hits, cfg };
}
