const THREE = window.THREE;
const FORWARD = new THREE.Vector3(0, 0, 1);
const HASH_SIZE = 4096; // potęga dwójki
const AXES = ['x', 'y', 'z'];
const MAX_STEP = 0.2;   // maks. długość kroku ruchu (mniej niż połowa woksela)

/**
 * Rój jako stado (boids). Każdy osobnik:
 *  - trzyma dystans od sąsiadów (separacja),
 *  - leci w tę samą stronę co sąsiedzi (wyrównanie),
 *  - trzyma się grupy (spójność),
 *  - leci do celu roju.
 * Wszyscy lecą ze stałą, identyczną prędkością — zmienia się tylko kierunek.
 * Sąsiedzi wyszukiwani przez siatkę haszującą, więc działa płynnie także dla ponad tysiąca osobników.
 */
export class Swarm3D {
  constructor(scene, cfg, spawn) {
    this.cfg = cfg;
    this.max = cfg.maxCount;
    this.count = 0;
    this.speed = cfg.speed; // wspólna, stała prędkość wszystkich osobników (zmieniana suwakiem)
    this.spawn = spawn.clone();
    this.pos = new Float32Array(this.max * 3);
    this.dir = new Float32Array(this.max * 3);
    // każdy osobnik ma własny „kąsek” — woksel, w który celowo leci, żeby go zjeść
    this.food = new Int32Array(this.max).fill(-1);
    this.foodPos = new Float32Array(this.max * 3);
    // 1 = osobnik siedzi na swoim kąsku i go wygryza
    this.landed = new Uint8Array(this.max);

    // parametry zmieniane suwakami
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

  /** Zmienia liczbę osobników na żywo. Nowe pojawiają się przy środku stada. */
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
        // losowy kierunek równomiernie na sferze
        const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, q = Math.sqrt(1 - u * u);
        this.dir[i3] = q * Math.cos(a);
        this.dir[i3 + 1] = u;
        this.dir[i3 + 2] = q * Math.sin(a);
        this.food[i] = -1;
        this.landed[i] = 0;
      }
    }
    // usuwane osobniki zwalniają swoje rezerwacje
    for (let i = n; i < this.count; i++) {
      if (this.food[i] >= 0) this.world?.release(this.food[i]);
      this.food[i] = -1;
    }
    this.count = n;
    this.mesh.count = n;
  }

  center() {
    const out = new THREE.Vector3();
    for (let i = 0; i < this.count; i++) out.x += this.pos[i * 3], out.y += this.pos[i * 3 + 1], out.z += this.pos[i * 3 + 2];
    return out.divideScalar(this.count || 1);
  }

  hash(ix, iy, iz) {
    return ((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) & (HASH_SIZE - 1);
  }

  /** Zasięg widzenia sąsiadów — co najmniej trochę większy niż odstęp. */
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
   * @param {{x:number,y:number,z:number}} target cel roju
   * @param {object} world
   *   feeding: czy cel roju jest przy materii (wtedy osobniki celowo jedzą),
   *   pickFood(): indeks woksela do zjedzenia przy celu albo -1,
   *   cellCenter(idx): środek woksela, cellAt(p), isSolidCell(idx), bite(idx)
   */
  update(target, world) {
    const c = this.cfg;
    const w = c.weights;
    const { pos, dir, food, foodPos, landed } = this;
    const cell = this.perception;
    const per2 = cell * cell;
    const sep2 = this.separationDistance * this.separationDistance;
    this.world = world;
    const p = { x: 0, y: 0, z: 0 };

    this.buildGrid();

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;

      // siedzi na kąsku: wygryza go, aż zniknie, potem startuje
      if (landed[i]) {
        if (food[i] >= 0 && world.isSolidCell(food[i])) {
          world.bite(food[i], food[i]);
          continue;
        }
        landed[i] = 0;
      }

      const px = pos[i3], py = pos[i3 + 1], pz = pos[i3 + 2];
      let sx = 0, sy = 0, sz = 0;   // separacja
      let ax = 0, ay = 0, az = 0;   // wyrównanie
      let cx = 0, cy = 0, cz = 0;   // spójność
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

      // cel osobnika: przy materii — własny kąsek, w innym wypadku — cel roju
      let tx = target.x, ty = target.y, tz = target.z;
      let targetWeight = w.target;
      let flocking = 1;
      // kąsek trzymany do końca, nawet gdy rój leci dalej; nowy wybierany przy celu roju
      if (food[i] >= 0 && !world.isSolidCell(food[i])) {
        world.release(food[i]);
        food[i] = -1;
      }
      if (food[i] < 0 && world.feeding) {
        food[i] = world.pickFood();
        if (food[i] >= 0) {
          const fc = world.cellCenter(food[i]);
          foodPos[i3] = fc.x; foodPos[i3 + 1] = fc.y; foodPos[i3 + 2] = fc.z;
        }
      }
      if (food[i] >= 0) {
        tx = foodPos[i3]; ty = foodPos[i3 + 1]; tz = foodPos[i3 + 2];
        targetWeight = w.feed;
        flocking = c.feedFlocking;
      }

      // suma sterowań (każde jako wektor jednostkowy z wagą)
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

      // skręt o ograniczonej szybkości, potem normalizacja → stała prędkość
      let dx = dir[i3] + fx * c.turnRate, dy = dir[i3 + 1] + fy * c.turnRate, dz = dir[i3 + 2] + fz * c.turnRate;
      let l = Math.hypot(dx, dy, dz) || 1;
      dx /= l; dy /= l; dz /= l;

      // Ruch oś po osi; przy dużej prędkości dzielony na kroki, żeby nie przeskoczyć przez woksel.
      // Pełny woksel zatrzymuje ruch w tej osi — bez odbicia i bez przenikania:
      //  - jedzący osobnik trafia w swój albo wolny woksel → ląduje na nim i zaczyna jeść,
      //  - w innym wypadku ślizga się wzdłuż powierzchni.
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
          if (food[i] >= 0 && world.canBite(idx, food[i])) {
            if (idx !== food[i]) {
              world.release(food[i]);
              world.claim(idx);
              food[i] = idx;
              const fc = world.cellCenter(idx);
              foodPos[i3] = fc.x; foodPos[i3 + 1] = fc.y; foodPos[i3 + 2] = fc.z;
            }
            landed[i] = 1;
            d[0] = foodPos[i3] - p.x; d[1] = foodPos[i3 + 1] - p.y; d[2] = foodPos[i3 + 2] - p.z; // przodem do kąska
            break move;
          }
          d[a] = 0; // ślizg
        }
      }

      pos[i3] = p.x; pos[i3 + 1] = p.y; pos[i3 + 2] = p.z;
      l = Math.hypot(d[0], d[1], d[2]);
      if (l > 1e-6) { dir[i3] = d[0] / l; dir[i3 + 1] = d[1] / l; dir[i3 + 2] = d[2] / l; }
      else { dir[i3] = dx; dir[i3 + 1] = dy; dir[i3 + 2] = dz; }
    }
  }

  render() {
    const dm = this.dummy;
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      dm.position.set(this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2]);
      dm.quaternion.setFromUnitVectors(FORWARD, this.v.set(this.dir[i3], this.dir[i3 + 1], this.dir[i3 + 2]));
      dm.updateMatrix();
      this.mesh.setMatrixAt(i, dm.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
