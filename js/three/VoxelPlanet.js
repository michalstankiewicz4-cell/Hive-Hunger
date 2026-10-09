import { terrainColor, mix } from '../utils/terrain.js';

const THREE = window.THREE;

export const BITE = Object.freeze({ MISS: 0, HIT: 1, REMOVED: 2 });

const NEIGHBORS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/**
 * Planeta z wokseli. Zewnętrzna warstwa ma kolory terenu (ocean, ląd, lód, chmury),
 * pod nią jest skała.
 *
 * Rysowane są tylko odsłonięte woksele (mające pustego sąsiada) — gdy rój coś zje,
 * sąsiedzi pod spodem są dorysowywani. Dzięki temu można mieć drobne woksele.
 */
export class VoxelPlanet {
  constructor(scene, cfg) {
    this.scene = scene;
    this.cfg = cfg;
    this.s = cfg.voxelSize;
    this.R = cfg.radius;                    // promień w jednostkach świata
    this.Rv = Math.round(this.R / this.s);  // promień w wokselach
    this.N = this.Rv * 2;
    this.seed = (Math.random() * 1e6) | 0;
    this.alive = true;

    const N = this.N, n3 = N * N * N;
    this.hp = new Float32Array(n3);
    this.slotOf = new Int32Array(n3).fill(-1);
    // ilu osobników zarezerwowało dany woksel do zjedzenia
    this.claims = new Uint16Array(n3);

    let total = 0;
    for (let k = 0; k < N; k++) {
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const x = i + 0.5 - this.Rv, y = j + 0.5 - this.Rv, z = k + 0.5 - this.Rv;
          if (x * x + y * y + z * z <= this.Rv * this.Rv) {
            this.hp[(k * N + j) * N + i] = cfg.strength;
            total++;
          }
        }
      }
    }
    this.total = total;
    this.left = total;

    this.geometry = new THREE.BoxGeometry(this.s, this.s, this.s);
    this.material = this.createMaterial();
    this.capacity = 0;
    this.count = 0;
    this.createMesh(Math.ceil(4 * Math.PI * this.Rv * this.Rv * 2.2));

    this._v = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._c = new THREE.Color();
    for (let idx = 0; idx < n3; idx++) {
      if (this.hp[idx] > 0 && this.isExposed(idx)) this.addInstance(idx);
    }
    this.dirty = true;

    this.atmosphere = this.createAtmosphere();
    scene.add(this.atmosphere);
  }

  createMaterial() {
    const material = new THREE.MeshLambertMaterial();
    // Normalna woksela przechylona w stronę normalnej kuli — płynne cieniowanie dnia i nocy.
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <beginnormal_vertex>',
        `vec3 sphereNormal = normalize((instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz + 1e-4);
         vec3 objectNormal = normalize(mix(vec3(normal), sphereNormal, ${this.cfg.sphereShading.toFixed(2)}));`,
      );
    };
    return material;
  }

  createMesh(capacity) {
    const old = this.mesh;
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    const idxOfSlot = new Int32Array(capacity);

    if (old) {
      mesh.instanceMatrix.array.set(old.instanceMatrix.array.subarray(0, this.count * 16));
      mesh.instanceColor.array.set(old.instanceColor.array.subarray(0, this.count * 3));
      idxOfSlot.set(this.idxOfSlot.subarray(0, this.count));
      this.scene.remove(old);
    }
    mesh.count = this.count;
    this.mesh = mesh;
    this.idxOfSlot = idxOfSlot;
    this.capacity = capacity;
    this.scene.add(mesh);
  }

  // --- siatka ---

  coords(idx) {
    const N = this.N;
    return [idx % N, ((idx / N) | 0) % N, (idx / (N * N)) | 0];
  }

  index(i, j, k) {
    const N = this.N;
    if (i < 0 || j < 0 || k < 0 || i >= N || j >= N || k >= N) return -1;
    return (k * N + j) * N + i;
  }

  isExposed(idx) {
    const [i, j, k] = this.coords(idx);
    for (const [a, b, c] of NEIGHBORS) {
      const n = this.index(i + a, j + b, k + c);
      if (n < 0 || this.hp[n] <= 0) return true;
    }
    return false;
  }

  cellCenter(idx, out) {
    const [i, j, k] = this.coords(idx);
    const s = this.s;
    return out.set((i + 0.5) * s - this.R, (j + 0.5) * s - this.R, (k + 0.5) * s - this.R);
  }

  /** Indeks woksela pod punktem (obiekt z x, y, z) albo -1. */
  cellAt(p) {
    const s = this.s;
    return this.index(Math.floor((p.x + this.R) / s), Math.floor((p.y + this.R) / s), Math.floor((p.z + this.R) / s));
  }

  isSolid(p) {
    const idx = this.cellAt(p);
    return idx >= 0 && this.hp[idx] > 0;
  }

  // --- kolory ---

  colorOf(idx) {
    const p = this.cellCenter(idx, this._v);
    const d = p.length() || 1;
    let rgb;
    if (d > this.R - this.cfg.terrainDepth) {
      rgb = terrainColor(p.x / d, -p.y / d, p.z / d, this.seed, this.cfg.surface);
    } else {
      rgb = mix(this.cfg.rockCore, this.cfg.rock, d / this.R);
    }
    return [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
  }

  // --- instancje ---

  addInstance(idx) {
    if (this.count >= this.capacity) this.createMesh(Math.ceil(this.capacity * 1.6));
    const slot = this.count++;
    this.mesh.count = this.count;
    this._m.makeTranslation(...this.cellCenter(idx, this._v).toArray());
    this.mesh.setMatrixAt(slot, this._m);
    const [r, g, b] = this.colorOf(idx);
    this.mesh.setColorAt(slot, this._c.setRGB(r, g, b));
    this.slotOf[idx] = slot;
    this.idxOfSlot[slot] = idx;
    this.dirty = true;
  }

  removeInstance(idx) {
    const slot = this.slotOf[idx];
    if (slot < 0) return;
    const last = this.count - 1;
    if (slot !== last) {
      const m = this.mesh.instanceMatrix.array, c = this.mesh.instanceColor.array;
      m.copyWithin(slot * 16, last * 16, last * 16 + 16);
      c.copyWithin(slot * 3, last * 3, last * 3 + 3);
      const moved = this.idxOfSlot[last];
      this.idxOfSlot[slot] = moved;
      this.slotOf[moved] = slot;
    }
    this.slotOf[idx] = -1;
    this.count = last;
    this.mesh.count = last;
    this.dirty = true;
  }

  // --- jedzenie ---

  bite(idx, amount) {
    if (!this.alive || idx < 0 || this.hp[idx] <= 0) return BITE.MISS;
    this.hp[idx] -= amount;
    if (this.hp[idx] > 0) return BITE.HIT;
    this.remove(idx);
    return BITE.REMOVED;
  }

  claim(idx) {
    if (idx >= 0) this.claims[idx]++;
  }

  release(idx) {
    if (idx >= 0 && this.claims[idx] > 0) this.claims[idx]--;
  }

  /** Czy woksel jest zarezerwowany przez kogoś innego niż właściciel `ownFood`. */
  claimedByOther(idx, ownFood) {
    return idx !== ownFood && this.claims[idx] > 0;
  }

  /**
   * Gryzie woksele w kuli o promieniu `radius` wokół woksela `idx`, pomijając
   * woksele zarezerwowane przez inne osobniki; onRemoved(idx) dla zjedzonych.
   */
  biteSphere(idx, radius, amount, onRemoved, ownFood = -1) {
    if (!this.alive || idx < 0) return;
    const [ci, cj, ck] = this.coords(idx);
    const r = radius / this.s, r2 = r * r, ri = Math.ceil(r);
    for (let dk = -ri; dk <= ri; dk++) for (let dj = -ri; dj <= ri; dj++) for (let di = -ri; di <= ri; di++) {
      if (di * di + dj * dj + dk * dk > r2) continue;
      const n = this.index(ci + di, cj + dj, ck + dk);
      if (n < 0 || this.claimedByOther(n, ownFood)) continue;
      if (this.bite(n, amount) === BITE.REMOVED) onRemoved(n);
    }
  }

  remove(idx) {
    this.hp[idx] = 0;
    this.removeInstance(idx);
    this.left--;
    const [i, j, k] = this.coords(idx);
    for (const [a, b, c] of NEIGHBORS) {
      const n = this.index(i + a, j + b, k + c);
      if (n >= 0 && this.hp[n] > 0 && this.slotOf[n] < 0) this.addInstance(n);
    }
  }

  /**
   * Wszystkie odsłonięte (widoczne) woksele w kuli o promieniu `r` wokół punktu.
   * Wynik trafia do tablicy `out` (czyszczonej na początku); zwraca jej długość.
   */
  exposedNear(p, r, out) {
    out.length = 0;
    if (!this.alive) return 0;
    const s = this.s, R = this.R;
    const ci = (p.x + R) / s, cj = (p.y + R) / s, ck = (p.z + R) / s;
    const rv = r / s, rv2 = rv * rv;
    const i0 = Math.max(0, Math.floor(ci - rv)), i1 = Math.min(this.N - 1, Math.floor(ci + rv));
    const j0 = Math.max(0, Math.floor(cj - rv)), j1 = Math.min(this.N - 1, Math.floor(cj + rv));
    const k0 = Math.max(0, Math.floor(ck - rv)), k1 = Math.min(this.N - 1, Math.floor(ck + rv));
    for (let k = k0; k <= k1; k++) {
      const dk = k + 0.5 - ck;
      for (let j = j0; j <= j1; j++) {
        const dj = j + 0.5 - cj;
        for (let i = i0; i <= i1; i++) {
          const di = i + 0.5 - ci;
          if (di * di + dj * dj + dk * dk > rv2) continue;
          const idx = (k * this.N + j) * this.N + i;
          if (this.slotOf[idx] >= 0) out.push(idx);
        }
      }
    }
    return out.length;
  }

  /** Najbliższy wolny (niczyj) woksel z losowej próbki odsłoniętych; gdy brak wolnych — najbliższy dowolny. */
  findMatter(p, samples) {
    if (!this.alive || this.count === 0) return null;
    let best = -1, bestD = Infinity, bestFree = false;
    const v = this._v;
    const n = Math.min(samples, this.count);
    for (let k = 0; k < n; k++) {
      const idx = this.idxOfSlot[(Math.random() * this.count) | 0];
      const free = this.claims[idx] === 0;
      if (bestFree && !free) continue;
      this.cellCenter(idx, v);
      const d = (v.x - p.x) ** 2 + (v.y - p.y) ** 2 + (v.z - p.z) ** 2;
      if ((free && !bestFree) || d < bestD) { bestD = d; best = idx; bestFree = free; }
    }
    if (best < 0) return null;
    const c = this.cellCenter(best, new THREE.Vector3());
    return { x: c.x, y: c.y, z: c.z };
  }


  /** Pierwszy pełny woksel na promieniu albo null. */
  raycastSolid(ray, out) {
    const R = this.R;
    const o = ray.origin, d = ray.direction;
    const b = o.dot(d);
    const disc = b * b - (o.lengthSq() - R * R);
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    const t0 = Math.max(0, -b - sq), t1 = -b + sq;
    for (let t = t0; t <= t1; t += this.s * 0.4) {
      out.copy(d).multiplyScalar(t).add(o);
      if (this.isSolid(out)) return out;
    }
    return null;
  }

  get eatenFraction() {
    return this.alive ? 1 - this.left / this.total : 1;
  }

  /** Rozsypuje resztę planety; callback dostaje (idx, kolor) dla odsłoniętych wokseli. */
  shatter(onCell) {
    this.alive = false;
    this.scene.remove(this.atmosphere);
    for (let s = 0; s < this.count; s++) {
      const idx = this.idxOfSlot[s];
      onCell(idx, this.colorOf(idx));
    }
    this.hp.fill(0);
    this.count = 0;
    this.mesh.count = 0;
    this.left = 0;
  }

  sync() {
    if (!this.dirty) return;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.dirty = false;
  }

  createAtmosphere() {
    const a = this.cfg.atmosphere;
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(a.color[0] / 255, a.color[1] / 255, a.color[2] / 255) },
        uInner: { value: this.R },
        uOuter: { value: this.R * a.scale },
        uPower: { value: a.power },
        uIntensity: { value: a.intensity },
      },
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uInner, uOuter, uPower, uIntensity;
        varying vec3 vWorld;
        void main() {
          // odległość promienia widzenia od środka planety (środek w 0,0,0)
          vec3 dir = normalize(vWorld - cameraPosition);
          float d = length(cross(dir, -cameraPosition));
          // tylko pierścień poza planetą — przez wygryzione dziury poświata nie prześwituje
          float f = d < uInner ? 0.0 : pow(clamp((uOuter - d) / (uOuter - uInner), 0.0, 1.0), uPower);
          gl_FragColor = vec4(uColor * f * uIntensity, 1.0);
        }`,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    return new THREE.Mesh(new THREE.SphereGeometry(this.R * a.scale, 64, 32), material);
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.scene.remove(this.atmosphere);
    this.geometry.dispose();
    this.material.dispose();
    this.atmosphere.geometry.dispose();
    this.atmosphere.material.dispose();
  }
}
