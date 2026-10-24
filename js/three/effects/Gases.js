import { LIQUID_TIME, LIQUID_GLSL } from '../liquidShader.js';
import { Grid3D } from './Grid3D.js';

const THREE = window.THREE;

/**
 * Gas let loose in space: every voxel of solid gas that is eaten or destroyed becomes a puff of a
 * cloud. There is no gravity: puffs drift off slowly, are stirred about (`stir`, a slow swirl that
 * changes from place to place and over time), push each other apart within `reach` so the cloud
 * spreads, slow down (`damping`), never drift faster than `maxSpeed` (unless a scoop draws them in), swell from `size` to `maxSize`, and stay out of solid voxels. Only
 * scoops can take them in (Player.updateScoops: `pull`, `take`, `nearest`).
 *
 * Drawn as soft wisps — points with their own noise pattern, size and colour mix (CONFIG.gas.colors),
 * so the cloud is patchy and uneven, never one flat blob; the wisps churn slowly with LIQUID_TIME.
 */
export class Gases {
  /** @param {object} cfg CONFIG.gas */
  constructor(scene, cfg, max = 3000) {
    this.cfg = cfg;
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.seed = new Float32Array(max);
    this.col = new Float32Array(max * 3);
    this.pulled = new Uint8Array(max); // drawn in by a scoop this frame: not held to maxSpeed
    this.count = 0;
    this.taken = 0; // (tests) puffs taken in by scoops
    this.grid = new Grid3D(max, cfg.reach);
    this.force = new Float32Array(max * 3); // (per frame: pushed apart)

    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.aSeed = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.aColor = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('aSize', this.aSize);
    g.setAttribute('aSeed', this.aSeed);
    g.setAttribute('aColor', this.aColor);
    g.setDrawRange(0, 0);
    this.uniforms = { uTime: LIQUID_TIME, uScale: { value: 400 }, uOpacity: { value: cfg.opacity } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute float aSize; attribute float aSeed; attribute vec3 aColor;
        uniform float uScale;
        varying float vSeed; varying vec3 vColor;
        void main() {
          vSeed = aSeed; vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uOpacity;
        varying float vSeed; varying vec3 vColor;
        #define LQ_OCTAVES 3
        ${LIQUID_GLSL}
        void main() {
          vec2 uv = gl_PointCoord * 2.0 - 1.0;
          float r = length(uv);
          if (r > 1.0) discard;
          // a wisp: soft at the edge, torn by its own churning noise
          float n = lqFbm(vec3(uv * 1.6, vSeed * 13.0) + vec3(uTime * 0.12, -uTime * 0.08, uTime * 0.05));
          float a = smoothstep(1.0, 0.15, r) * smoothstep(0.3, 0.72, n) * uOpacity;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor * (0.75 + 0.5 * n), a);
        }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  /** Points' size on screen: the canvas height in pixels and the camera's field of view (degrees). */
  setView(heightPx, fovDeg) {
    this.uniforms.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  /** A puff at `at`, off along `dir` (any length) with a little at random. */
  spill(at, dir) {
    if (this.count >= this.max) return;
    const c = this.cfg, i = this.count++, i3 = i * 3;
    const l = Math.hypot(dir.x, dir.y, dir.z) || 1;
    this.pos[i3] = at.x; this.pos[i3 + 1] = at.y; this.pos[i3 + 2] = at.z;
    this.vel[i3] = (dir.x / l) * c.speed + (Math.random() - 0.5) * c.speed;
    this.vel[i3 + 1] = (dir.y / l) * c.speed + (Math.random() - 0.5) * c.speed;
    this.vel[i3 + 2] = (dir.z / l) * c.speed + (Math.random() - 0.5) * c.speed;
    this.size[i] = c.size * (0.7 + Math.random() * 0.6);
    this.seed[i] = Math.random();
    // its own mix of the cloud's colours
    const a = c.colors[(Math.random() * c.colors.length) | 0], b = c.colors[(Math.random() * c.colors.length) | 0], t = Math.random();
    for (let k = 0; k < 3; k++) this.col[i3 + k] = (a[k] + (b[k] - a[k]) * t) / 255;
  }

  remove(i) {
    const j = --this.count;
    if (i === j) return;
    this.pos.copyWithin(i * 3, j * 3, j * 3 + 3);
    this.vel.copyWithin(i * 3, j * 3, j * 3 + 3);
    this.col.copyWithin(i * 3, j * 3, j * 3 + 3);
    this.size[i] = this.size[j];
    this.seed[i] = this.seed[j];
    this.pulled[i] = this.pulled[j];
  }

  clear() {
    this.count = 0;
    this.draw();
  }

  /** One frame: the cloud spreads, swirls and slows down; solid voxels of `planet` stop the puffs. */
  step(planet) {
    const n = this.count, P = this.pos, V = this.vel, c = this.cfg, h = c.reach, h2 = h * h, grid = this.grid, found = grid.found;
    if (!n) { this.draw(); return; }
    const t = LIQUID_TIME.value;
    grid.build(P, n);
    const F = this.force;
    F.fill(0, 0, n * 3);
    // every pair once, pushed apart: the cloud spreads
    for (let i = 0; i < n; i++) {
      const i3 = i * 3, x = P[i3], y = P[i3 + 1], z = P[i3 + 2];
      const m = grid.near(i);
      for (let q = 0; q < m; q++) {
        const j3 = found[q] * 3, dx = x - P[j3], dy = y - P[j3 + 1], dz = z - P[j3 + 2], d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > h2 || d2 < 1e-12) continue;
        const dd = Math.sqrt(d2), f = c.push * (1 - dd / h) / dd;
        F[i3] += dx * f; F[i3 + 1] += dy * f; F[i3 + 2] += dz * f;
        F[j3] -= dx * f; F[j3 + 1] -= dy * f; F[j3 + 2] -= dz * f;
      }
    }
    for (let i = 0; i < n; i++) {
      const i3 = i * 3, x = P[i3], y = P[i3 + 1], z = P[i3 + 2];
      let fx = F[i3], fy = F[i3 + 1], fz = F[i3 + 2];
      // a slow swirl that differs from place to place and drifts with time
      fx += c.stir * Math.sin(y * 1.3 + t * 0.7 + this.seed[i] * 6);
      fy += c.stir * Math.sin(z * 1.1 + t * 0.9);
      fz += c.stir * Math.sin(x * 1.2 + t * 0.5);
      V[i3] = (V[i3] + fx) * c.damping;
      V[i3 + 1] = (V[i3 + 1] + fy) * c.damping;
      V[i3 + 2] = (V[i3 + 2] + fz) * c.damping;
      // a cloud drifts lazily: no faster than maxSpeed, unless a scoop is drawing it in
      const sp = Math.hypot(V[i3], V[i3 + 1], V[i3 + 2]);
      if (!this.pulled[i] && sp > c.maxSpeed) { const k = c.maxSpeed / sp; V[i3] *= k; V[i3 + 1] *= k; V[i3 + 2] *= k; }
      this.pulled[i] = 0;
      if (this.size[i] < c.maxSize) this.size[i] += c.grow;
    }
    const p = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      p.x = P[i3] + V[i3]; p.y = P[i3 + 1] + V[i3 + 1]; p.z = P[i3 + 2] + V[i3 + 2];
      if (planet && planet.alive && planet.isSolid(p)) {
        V[i3] *= -0.2; V[i3 + 1] *= -0.2; V[i3 + 2] *= -0.2;
        continue;
      }
      P[i3] = p.x; P[i3 + 1] = p.y; P[i3 + 2] = p.z;
    }
    this.draw();
  }

  /** Puffs within `range` of (x, y, z) are drawn towards it at `strength`. */
  pull(x, y, z, range, strength) {
    const P = this.pos, V = this.vel;
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3, dx = x - P[i3], dy = y - P[i3 + 1], dz = z - P[i3 + 2], d = Math.hypot(dx, dy, dz);
      if (d > range || d < 1e-6) continue;
      const f = strength * (1 - (d / range) * 0.5);
      V[i3] += (dx / d) * f; V[i3 + 1] += (dy / d) * f; V[i3 + 2] += (dz / d) * f;
      this.pulled[i] = 1;
    }
  }

  /** Puffs within `radius` of (x, y, z) are taken in (gone); returns how many. */
  take(x, y, z, radius) {
    const P = this.pos;
    let n = 0;
    for (let i = this.count - 1; i >= 0; i--) {
      const i3 = i * 3;
      if ((x - P[i3]) ** 2 + (y - P[i3 + 1]) ** 2 + (z - P[i3 + 2]) ** 2 > radius * radius) continue;
      this.remove(i);
      n++;
    }
    this.taken += n;
    return n;
  }

  nearest(x, y, z) {
    const P = this.pos;
    let best = -1, bestD = Infinity;
    for (let i = 0; i < this.count; i++) {
      const d = (x - P[i * 3]) ** 2 + (y - P[i * 3 + 1]) ** 2 + (z - P[i * 3 + 2]) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  draw() {
    const n = this.count;
    this.aPos.array.set(this.pos.subarray(0, n * 3));
    this.aSize.array.set(this.size.subarray(0, n));
    this.aSeed.array.set(this.seed.subarray(0, n));
    this.aColor.array.set(this.col.subarray(0, n * 3));
    for (const a of [this.aPos, this.aSize, this.aSeed, this.aColor]) a.needsUpdate = true;
    this.points.geometry.setDrawRange(0, n);
  }
}
