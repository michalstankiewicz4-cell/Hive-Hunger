import { PlanetSurface } from '../planet/PlanetSurface.js';
import { buildCarrierVoxels } from './carrierVoxels.js';

const THREE = window.THREE;

/**
 * The Hive Carrier drawn: its voxels (carrierVoxels.js) under the planets' smooth surface (rounded,
 * one mesh per chunk, built once), the voxels that glow as small lit cubes (the launch cells' floors
 * pulse slowly, windows flicker now and then), glows behind the nozzles and blinking running lights.
 * Not physical: nothing eats it, it is only drawn.
 *
 * Built once (`CarrierModel.shared()`), each detail the first time it is needed: `group(scale, f)` gives a
 * new group drawing it — the map's small one at half the detail (f = 2: an eighth of the voxels, so the
 * map stays light), the full-size one aboard with every voxel. `update(t)` moves the lights on.
 */
export class CarrierModel {
  static shared() {
    if (!CarrierModel.instance) CarrierModel.instance = new CarrierModel();
    return CarrierModel.instance;
  }

  constructor() {
    const t0 = performance.now();
    this.voxels = buildCarrierVoxels();
    this.time = { value: 0 };
    this.hullMaterial = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 38, specular: 0x2c323c });
    this.lightMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.lightMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.time;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aPhase;\nattribute float aSpeed;\nuniform float uTime;\nvarying float vGlow;')
        // a slow breath; windows (slow) now and then dim for a moment
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float w = sin(uTime * aSpeed + aPhase);
          vGlow = aSpeed < 0.5 ? (w > 0.97 ? 0.45 : 1.0) : 0.72 + 0.28 * w;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vGlow;')
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse * vGlow, opacity );');
    };
    this.glowTexture = glowTexture();
    this.details = new Map();
    this.buildMs = performance.now() - t0;
  }

  /**
   * The drawn carrier at `f` voxels per drawn voxel (1: every voxel — aboard; 2: half as fine, an
   * eighth of the voxels — the map's small one), built the first time it is asked for.
   */
  detail(f) {
    if (this.details.has(f)) return this.details.get(f);
    const t0 = performance.now();
    const v = f === 1 ? this.voxels : coarse(this.voxels, f);
    // the hull: PlanetSurface reads a planet-like grid
    const grid = {
      scene: new THREE.Group(), NX: v.NX, NY: v.NY, NZ: v.NZ, HX: (v.NX * f) / 2, HY: (v.NY * f) / 2, HZ: (v.NZ * f) / 2, s: f,
      hp: v.hp, cfg: { strength: 1 }, colors: v.colors, colorOffset: (i) => i * 3, tags: v.tags, liquidOf: null,
    };
    const surface = new PlanetSurface(grid, 'smooth', this.hullMaterial);
    // the glowing voxels: one instanced cube each, its own colour, pulse and phase
    const L = v.lights, n = L.length, O = this.voxels;
    const box = new THREE.BoxGeometry(0.92 * f, 0.92 * f, 0.92 * f);
    const phase = new Float32Array(n), speed = new Float32Array(n), matrices = new Float32Array(n * 16), colors = new Float32Array(n * 3);
    const m = new THREE.Matrix4();
    L.forEach((l, i) => {
      phase[i] = l.cell !== undefined ? l.cell * 2.39996 : Math.random() * 6.28; // (a launch cell's floor pulses as one)
      speed[i] = l.kind === 'cell' ? 1.1 : l.kind === 'nozzle' ? 3.5 : l.kind === 'vent' ? 2.2 : 0.4;
      m.makeTranslation((l.x + 0.5) * f - O.NX / 2, (l.y + 0.5) * f - O.NY / 2, (l.z + 0.5) * f - O.NZ / 2).toArray(matrices, i * 16);
      colors.set(l.color.map((c) => c / 255), i * 3);
    });
    box.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    box.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(speed, 1));
    const d = { hull: [...surface.meshes.values()].map((mm) => mm.geometry), triangles: surface.triangles, box, matrices, colors, lights: n, ms: performance.now() - t0 };
    this.details.set(f, d);
    return d;
  }

  /** Triangles of the full-size hull (tests). */
  get triangles() {
    return this.detail(1).triangles;
  }

  /** A new group drawing the carrier, `scale` per voxel (centred; the bow along +x), at detail `f` (see detail). */
  group(scale = 1, f = 1) {
    const v = this.voxels, d = this.detail(f), g = new THREE.Group();
    for (const geo of d.hull) g.add(new THREE.Mesh(geo, this.hullMaterial));
    const lights = new THREE.InstancedMesh(d.box, this.lightMaterial, d.lights);
    lights.instanceMatrix.array.set(d.matrices);
    lights.instanceColor = new THREE.InstancedBufferAttribute(d.colors.slice(), 3);
    lights.frustumCulled = false;
    g.add(lights);
    // engine glows behind the nozzles and the running lights
    g.userData.glows = [];
    for (const nz of v.nozzles) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTexture, color: 0x8fd4ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.position.set(-2 - v.NX / 2, nz.y + 0.5 - v.NY / 2, nz.z + 0.5 - v.NZ / 2);
      s.scale.setScalar(nz.r * 3.2);
      s.userData = { base: nz.r * 3.2, kind: 'engine', phase: Math.random() * 6 };
      g.add(s);
      g.userData.glows.push(s);
    }
    for (const b of v.beacons) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTexture, color: new THREE.Color(b.color[0] / 255, b.color[1] / 255, b.color[2] / 255), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.position.set(b.x + 0.5 - v.NX / 2, b.y + 0.5 - v.NY / 2, b.z + 0.5 - v.NZ / 2);
      s.scale.setScalar(5);
      s.userData = { base: 5, kind: 'beacon', period: b.period, phase: Math.random() * b.period };
      g.add(s);
      g.userData.glows.push(s);
    }
    g.scale.setScalar(scale);
    return g;
  }

  /** Lights move on: `t` seconds; the groups' glows pulse and blink. */
  update(t, groups) {
    this.time.value = t;
    for (const g of groups) for (const s of g.userData.glows) {
      const u = s.userData;
      if (u.kind === 'engine') {
        const k = 0.85 + 0.15 * Math.sin(t * 5.3 + u.phase) + 0.05 * Math.sin(t * 17 + u.phase);
        s.scale.setScalar(u.base * k);
        s.material.opacity = 0.75 + 0.25 * k;
      } else {
        // a short flash once a period
        const f = ((t + u.phase) % u.period) / u.period;
        s.material.opacity = f < 0.12 ? 1 : 0.08;
      }
    }
  }
}

/**
 * The carrier `f` times coarser: a block of f³ voxels is solid when at least half of it is (its colour
 * their average, its module the first one's), else a light when any of it glows.
 */
function coarse(v, f) {
  const NX = Math.ceil(v.NX / f), NY = Math.ceil(v.NY / f), NZ = Math.ceil(v.NZ / f), N = NX * NY * NZ;
  const hp = new Uint8Array(N), colors = new Uint8Array(N * 3), tags = new Uint8Array(N);
  const lit = new Map(v.lights.map((l) => [(l.z * v.NY + l.y) * v.NX + l.x, l]));
  const lights = [], half = (f * f * f) / 2;
  for (let z = 0; z < NZ; z++) for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
    let n = 0, r = 0, g = 0, b = 0, tag = 0, light = null;
    for (let c = 0; c < f; c++) for (let bb = 0; bb < f; bb++) for (let a = 0; a < f; a++) {
      const X = x * f + a, Y = y * f + bb, Z = z * f + c;
      if (X >= v.NX || Y >= v.NY || Z >= v.NZ) continue;
      const i = (Z * v.NY + Y) * v.NX + X;
      if (v.hp[i]) { n++; r += v.colors[i * 3]; g += v.colors[i * 3 + 1]; b += v.colors[i * 3 + 2]; tag ||= v.tags[i]; }
      else if (!light) light = lit.get(i) || null;
    }
    const o = (z * NY + y) * NX + x;
    if (n >= half) { hp[o] = 1; colors[o * 3] = r / n; colors[o * 3 + 1] = g / n; colors[o * 3 + 2] = b / n; tags[o] = tag; }
    else if (light) lights.push({ ...light, x, y, z });
  }
  return { NX, NY, NZ, hp, colors, tags, lights };
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** A top view of the carrier for the map's card: every column's highest voxel, darker the lower. */
export function paintCarrier(g, W) {
  const v = CarrierModel.shared().voxels, { NX, NY, NZ } = v;
  g.fillStyle = '#05060c';
  g.fillRect(0, 0, W, W);
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(200,215,255,${0.2 + Math.random() * 0.5})`; g.fillRect(Math.random() * W, Math.random() * W, 1, 1); }
  const lit = new Map(v.lights.map((l) => [(l.z * NY + l.y) * NX + l.x, l.color]));
  const k = (W - 16) / NX, oy = (W - NZ * k) / 2;
  for (let x = 0; x < NX; x++) for (let z = 0; z < NZ; z++) {
    for (let y = NY - 1; y >= 0; y--) {
      const i = (z * NY + y) * NX + x, light = lit.get(i);
      if (!v.hp[i] && !light) continue;
      const c = light || [v.colors[i * 3], v.colors[i * 3 + 1], v.colors[i * 3 + 2]], d = light ? 1 : 0.55 + 0.45 * (y / NY) * 1.6;
      g.fillStyle = `rgb(${Math.min(255, c[0] * d) | 0},${Math.min(255, c[1] * d) | 0},${Math.min(255, c[2] * d) | 0})`;
      // the bow points up-right: x across the picture
      g.fillRect(8 + x * k, oy + z * k, Math.ceil(k), Math.ceil(k));
      break;
    }
  }
}
