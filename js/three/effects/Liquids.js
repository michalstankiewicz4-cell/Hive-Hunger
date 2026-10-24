import { LIQUID_TIME, LIQUID_GLSL } from '../liquidShader.js';
import { Grid3D } from './Grid3D.js';

const THREE = window.THREE;

/**
 * Liquid let loose in space: every voxel of a liquid (water, lava — a level's `liquids`) that is
 * eaten or destroyed becomes a droplet. There is no gravity: the droplets keep moving, slow down
 * (`damping`), pull at their neighbours within `reach` (`cohesion`, like surface tension) so they
 * gather into floating blobs, and push apart closer than `rest` so the blobs don't collapse into a
 * point. Lava is thicker: it slows down faster and holds together harder. Droplets bounce softly off
 * solid voxels. Ordinary ships can't take them in — only siphons can (Player.updateSiphons, which
 * calls `pull` and `take`).
 *
 * Drawn as small spheres, one instanced mesh per kind (water see-through blue, lava glowing), each
 * droplet with its own `seed`: the moving lava and water looks (liquidShader.js) differ from drop to drop.
 */
export class Liquids {
  /** @param {object} cfg CONFIG.liquids: per kind { color, glow, opacity, size, damping, cohesion, reach, rest, push, speed } */
  constructor(scene, cfg, max = 4000) {
    this.cfg = cfg;
    this.max = max;
    this.kinds = Object.keys(cfg);
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.kind = new Uint8Array(max);
    this.seed = new Float32Array(max);
    this.count = 0;
    this.taken = 0; // (tests) droplets taken in by siphons
    this.cell = Math.max(...this.kinds.map((k) => cfg[k].reach));
    this.grid = new Grid3D(max, this.cell / 2, 2);
    this.force = new Float32Array(max * 3); // (per frame: apart / together, and how many pull together)
    this.pullF = new Float32Array(max * 3);
    this.together = new Uint16Array(max);
    this.meshes = this.kinds.map((k) => {
      const c = cfg[k];
      const mat = c.glow
        ? new THREE.MeshBasicMaterial({ color: c.color })
        : new THREE.MeshPhongMaterial({ color: c.color, transparent: true, opacity: c.opacity ?? 0.8, shininess: 80, specular: 0x99bbff });
      const geo = new THREE.IcosahedronGeometry(c.size, 1); // (small on screen: 80 faces are enough)
      geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage));
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = LIQUID_TIME;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nattribute float aSeed;\nvarying float vSeed;\nvarying vec3 vLocal;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>\nvSeed = aSeed;\nvLocal = position / ${c.size.toFixed(3)};`);
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nuniform float uTime;\nvarying float vSeed;\nvarying vec3 vLocal;\n#define LQ_OCTAVES 2\n${LIQUID_GLSL}`);
        shader.fragmentShader = c.glow
          // lava: its own churning crust and veins on every drop
          ? shader.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );',
            'vec4 diffuseColor = vec4( lavaColor(vLocal * 0.9 + vec3(vSeed * 37.0), uTime + vSeed * 10.0) * 1.35, opacity );')
          // water: rippling brightness and a glint, different on every drop
          : shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            diffuseColor.rgb *= waterShade(vLocal * 1.6 + vec3(vSeed * 37.0), uTime + vSeed * 10.0);
            totalEmissiveRadiance += vec3(0.25, 0.45, 0.7) * waterGlint(vLocal * 1.6 + vec3(vSeed * 37.0), uTime + vSeed * 10.0);`);
      };
      const mesh = new THREE.InstancedMesh(geo, mat, max);
      mesh.count = 0;
      mesh.frustumCulled = false;
      scene.add(mesh);
      return mesh;
    });
    this.m = new THREE.Matrix4();
  }

  /** A droplet of liquid `kind` at `at`, moving off along `dir` (any length) — with a little at random. */
  spill(kind, at, dir) {
    const k = this.kinds.indexOf(kind);
    if (k < 0 || this.count >= this.max) return;
    const c = this.cfg[kind], i = this.count++, i3 = i * 3;
    const l = Math.hypot(dir.x, dir.y, dir.z) || 1;
    this.pos[i3] = at.x; this.pos[i3 + 1] = at.y; this.pos[i3 + 2] = at.z;
    this.vel[i3] = (dir.x / l) * c.speed + (Math.random() - 0.5) * c.speed;
    this.vel[i3 + 1] = (dir.y / l) * c.speed + (Math.random() - 0.5) * c.speed;
    this.vel[i3 + 2] = (dir.z / l) * c.speed + (Math.random() - 0.5) * c.speed;
    this.kind[i] = k;
    this.seed[i] = Math.random();
  }

  /** Droplet i is gone (the last one takes its place). */
  remove(i) {
    const j = --this.count;
    if (i !== j) {
      this.pos.copyWithin(i * 3, j * 3, j * 3 + 3);
      this.vel.copyWithin(i * 3, j * 3, j * 3 + 3);
      this.kind[i] = this.kind[j];
      this.seed[i] = this.seed[j];
    }
  }

  clear() {
    this.count = 0;
    this.draw();
  }

  /** One frame: neighbours pull and push, everything slows down and moves; solid voxels of `planet` stop them. */
  step(planet) {
    const n = this.count, P = this.pos, V = this.vel, grid = this.grid, found = grid.found, K = this.kind;
    if (!n) { this.draw(); return; }
    grid.build(P, n);
    const cfgs = this.kinds.map((k) => this.cfg[k]), F = this.force, G = this.pullF, T = this.together;
    F.fill(0, 0, n * 3); G.fill(0, 0, n * 3); T.fill(0, 0, n);
    // every pair once: closer than `rest` apart, further (within `reach`, the same liquid) together
    for (let i = 0; i < n; i++) {
      const i3 = i * 3, c = cfgs[K[i]], reach2 = c.reach * c.reach;
      const x = P[i3], y = P[i3 + 1], z = P[i3 + 2];
      const m = grid.near(i);
      for (let q = 0; q < m; q++) {
        const j = found[q], j3 = j * 3;
        const dx = P[j3] - x, dy = P[j3 + 1] - y, dz = P[j3 + 2] - z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > reach2 || d2 < 1e-12) continue;
        const dd = Math.sqrt(d2), ux = dx / dd, uy = dy / dd, uz = dz / dd;
        if (dd < c.rest) {
          const f = c.push * (c.rest - dd);
          F[i3] -= ux * f; F[i3 + 1] -= uy * f; F[i3 + 2] -= uz * f;
          F[j3] += ux * f; F[j3 + 1] += uy * f; F[j3 + 2] += uz * f;
        } else if (K[j] === K[i]) {
          const f = c.cohesion * (dd - c.rest);
          G[i3] += ux * f; G[i3 + 1] += uy * f; G[i3 + 2] += uz * f; T[i]++;
          G[j3] -= ux * f; G[j3 + 1] -= uy * f; G[j3 + 2] -= uz * f; T[j]++;
        }
      }
    }
    for (let i = 0; i < n; i++) {
      const i3 = i * 3, c = cfgs[K[i]];
      // the pull together counts as if from at most `crowd` neighbours: a blob keeps its droplets apart
      // (before, hundreds pulling at once squeezed a blob into a point — slow, every droplet near every other)
      const k = T[i] > c.crowd ? c.crowd / T[i] : 1;
      const fx = F[i3] + G[i3] * k, fy = F[i3 + 1] + G[i3 + 1] * k, fz = F[i3 + 2] + G[i3 + 2] * k;
      V[i3] = (V[i3] + fx) * c.damping;
      V[i3 + 1] = (V[i3 + 1] + fy) * c.damping;
      V[i3 + 2] = (V[i3 + 2] + fz) * c.damping;
    }
    const p = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      p.x = P[i3] + V[i3]; p.y = P[i3 + 1] + V[i3 + 1]; p.z = P[i3 + 2] + V[i3 + 2];
      // a solid voxel in the way: it stays and bounces back softly
      if (planet && planet.alive && planet.isSolid(p)) {
        V[i3] *= -0.3; V[i3 + 1] *= -0.3; V[i3 + 2] *= -0.3;
        continue;
      }
      P[i3] = p.x; P[i3 + 1] = p.y; P[i3 + 2] = p.z;
    }
    this.draw();
  }

  /** Droplets within `range` of (x, y, z) are drawn towards it at `strength`; returns the nearest one's index or -1. */
  pull(x, y, z, range, strength) {
    const P = this.pos, V = this.vel;
    let best = -1, bestD = Infinity;
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3, dx = x - P[i3], dy = y - P[i3 + 1], dz = z - P[i3 + 2], d = Math.hypot(dx, dy, dz);
      if (d < bestD) { bestD = d; best = i; }
      if (d > range || d < 1e-6) continue;
      const f = strength * (1 - d / range * 0.5);
      V[i3] += (dx / d) * f; V[i3 + 1] += (dy / d) * f; V[i3 + 2] += (dz / d) * f;
    }
    return best;
  }

  /** Droplets within `radius` of (x, y, z) are taken in (gone); returns how many. */
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

  /** The nearest droplet to (x, y, z): its index, or -1. */
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
    const counts = this.meshes.map(() => 0);
    for (let i = 0; i < this.count; i++) {
      const k = this.kind[i], mesh = this.meshes[k];
      this.m.makeTranslation(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      mesh.geometry.attributes.aSeed.array[counts[k]] = this.seed[i];
      mesh.setMatrixAt(counts[k]++, this.m);
    }
    this.meshes.forEach((mesh, k) => {
      mesh.count = counts[k];
      mesh.instanceMatrix.needsUpdate = true;
      mesh.geometry.attributes.aSeed.needsUpdate = true;
    });
  }
}
