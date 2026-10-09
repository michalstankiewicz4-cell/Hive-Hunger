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

    // parameters changed by sliders
    this.separationDistance = cfg.separationDistance;
    this.cohesion = cfg.weights.cohesion;

    this.head = new Int32Array(HASH_SIZE);
    this.next = new Int32Array(this.max);

    const [w, h, l] = cfg.size;
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(w, h, l),
      new THREE.MeshBasicMaterial({ color: cfg.color }),
      this.max,
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

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
   * Multiplayer guest: show positions and headings received from the host instead of
   * simulating. Units move smoothly towards the received positions between updates.
   */
  setRemote(count, pos, dir) {
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
   *   cellCenter(idx): voxel centre, cellAt(p), isSolidCell(idx), bite(idx)
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

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;

      // landed on its bite: eats it until it is gone, then takes off
      if (landed[i]) {
        if (food[i] >= 0 && world.isSolidCell(food[i])) {
          world.bite(food[i], food[i]);
          continue;
        }
        landed[i] = 0;
      }

      const px = pos[i3], py = pos[i3 + 1], pz = pos[i3 + 2];
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
      if (food[i] >= 0 && !world.isSolidCell(food[i])) {
        world.release(food[i]);
        food[i] = -1;
      }
      if (food[i] < 0 && (world.feeding || world.nearestMode) && !world.holding) {
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
        tx = foodPos[i3]; ty = foodPos[i3 + 1]; tz = foodPos[i3 + 2];
        targetWeight = w.feed;
        // nearestMode: no free flying — only separation stays, the unit flies straight to its voxel
        flocking = world.nearestMode ? 0 : c.feedFlocking;
      }

      // within reach of its own bite: land on it. At constant speed a unit could otherwise
      // circle a small, isolated scrap forever without ever touching it.
      if (food[i] >= 0) {
        const fx0 = foodPos[i3] - px, fy0 = foodPos[i3 + 1] - py, fz0 = foodPos[i3 + 2] - pz;
        const reach = c.reachDistance + this.speed;
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
        if (blockAge[i] < c.stuck.recentContact && world.isSolidCell(b)) {
          if (!world.holding && world.canBite(b, food[i])) {
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
      const d = [dx, dy, dz];
      const substeps = Math.max(1, Math.ceil(this.speed / MAX_STEP));
      const stepLen = this.speed / substeps;
      move: for (let s = 0; s < substeps; s++) {
        for (let a = 0; a < 3; a++) {
          const ax2 = AXES[a];
          const old = p[ax2];
          p[ax2] = old + d[a] * stepLen;
          const idx = world.cellAt(p);
          if (!world.isSolidCell(idx)) continue;
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
   * Draws the units. The drawn heading follows the flying direction smoothly (turnSmoothing),
   * so sharp changes — sliding along a wall, landing on a bite — don't look like snapping.
   * Only the look is smoothed; movement and collisions use the real direction.
   */
  render() {
    const dm = this.dummy;
    const k = this.cfg.turnSmoothing;
    const look = this.look;
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      let lx = look[i3] + (this.dir[i3] - look[i3]) * k;
      let ly = look[i3 + 1] + (this.dir[i3 + 1] - look[i3 + 1]) * k;
      let lz = look[i3 + 2] + (this.dir[i3 + 2] - look[i3 + 2]) * k;
      const l = Math.hypot(lx, ly, lz);
      if (l < 1e-4) { lx = this.dir[i3]; ly = this.dir[i3 + 1]; lz = this.dir[i3 + 2]; }
      else { lx /= l; ly /= l; lz /= l; }
      look[i3] = lx; look[i3 + 1] = ly; look[i3 + 2] = lz;
      dm.position.set(this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2]);
      dm.quaternion.setFromUnitVectors(FORWARD, this.v.set(lx, ly, lz));
      dm.updateMatrix();
      this.mesh.setMatrixAt(i, dm.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
