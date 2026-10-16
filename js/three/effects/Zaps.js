import { bandGlowTexture } from '../textures.js';

const THREE = window.THREE;

/**
 * Support ships' lightning: a bolt that jumps between ships of the same swarm, in a random order,
 * and is gone once it has reached the last one: it runs from ship to ship over `life` frames
 * (1.5 s), then fades out quickly. As it finishes a jump, `onJump(points)` gets the world points of
 * that jump (Game3D.zap destroys the voxels on them). This draws it:
 *  - the main bolt: a white 1-pixel core, not straight but irregularly bent (smooth random
 *    offsets across each jump, larger in the middle), with a `glowPx` (4) pixel glow and energy
 *    flowing along it (bright pulses running from ship to ship);
 *  - branches: short forked side bolts from random points of it, with a `branchGlowPx` (2) pixel
 *    glow — only for the look.
 * Shapes are made relative to the ships (along / across each jump), so the bolt follows them as
 * they fly. A seeded random generator gives the guests the same shape from the host's seed.
 */
export class Zaps {
  constructor(scene, cfg) {
    this.scene = scene;
    this.cfg = cfg;
    this.list = [];
    this.made = 0; // (tests)
    this.glowTexture = bandGlowTexture();
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._u = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._q = new THREE.Vector3();
  }

  /**
   * A bolt through the ships `chain` (unit indices of `swarm`, the support ship first).
   * Returns the world points of its main path now (for destroying what lies on it).
   */
  add(swarm, chain, seed, onJump = null) {
    const c = this.cfg, rnd = mulberry(seed);
    const segs = [];
    for (let k = 0; k + 1 < chain.length; k++) {
      // the bend: a few random control offsets across the jump, smoothed, zero at both ends
      const n = c.points, ctrl = [];
      for (let m = 0; m <= 4; m++) ctrl.push([(rnd() - 0.5) * 2, (rnd() - 0.5) * 2]);
      const pts = [];
      for (let m = 0; m <= n; m++) {
        const t = m / n, env = Math.sin(Math.PI * t);
        const x = t * 4, i = Math.min(3, Math.floor(x)), f = x - i, s = f * f * (3 - 2 * f);
        const ou = (ctrl[i][0] + (ctrl[i + 1][0] - ctrl[i][0]) * s) * env * c.bend + (rnd() - 0.5) * c.jag * env;
        const ov = (ctrl[i][1] + (ctrl[i + 1][1] - ctrl[i][1]) * s) * env * c.bend + (rnd() - 0.5) * c.jag * env;
        pts.push([t, ou, ov]);
      }
      segs.push({ a: chain[k], b: chain[k + 1], pts });
    }
    // branches: from random points of the main bolt, short, forking once more
    const branches = [];
    const total = segs.length * c.points;
    for (let k = 0; k < c.branches * segs.length; k++) {
      const at = Math.floor(rnd() * total), seg = Math.floor(at / c.points), m = at % c.points;
      const make = (len, depth) => {
        const out = [[0, 0, 0]];
        let x = 0, y = 0, z = 0;
        const dx = (rnd() - 0.5) * 2, dy = (rnd() - 0.5) * 2, dz = rnd() * 0.8 + 0.2; // mostly onwards
        const steps = 5;
        for (let j = 1; j <= steps; j++) {
          x += (dx + (rnd() - 0.5) * 0.9) * len / steps;
          y += (dy + (rnd() - 0.5) * 0.9) * len / steps;
          z += (dz + (rnd() - 0.5) * 0.6) * len / steps;
          out.push([x, y, z]);
        }
        const sub = depth > 0 && rnd() < 0.6 ? make(len * 0.5, depth - 1) : null;
        return { pts: out, sub, from: Math.floor(rnd() * steps) };
      };
      branches.push({ seg, m, shape: make(c.branchLength * (0.5 + rnd()), 1) });
    }
    const bolt = { swarm, segs, branches, age: 0, phase: rnd() * 10, meshes: [], done: 0, onJump };
    // meshes: main (core line + glow ribbon) and every branch line (+ its sub-branch)
    const mainN = segs.length * (c.points + 1);
    bolt.main = this.makeLine(mainN, c.glowPx, 1);
    bolt.branchMeshes = [];
    for (const b of branches) {
      bolt.branchMeshes.push(this.makeLine(b.shape.pts.length, c.branchGlowPx, c.branchBrightness));
      if (b.shape.sub) bolt.branchMeshes.push(this.makeLine(b.shape.sub.pts.length, c.branchGlowPx, c.branchBrightness * 0.7));
    }
    this.list.push(bolt);
    this.made++;
    this.place(bolt, null);
    return bolt;
  }

  /** How far along the chain the bolt has run (in jumps). */
  head(bolt) {
    const c = this.cfg;
    return Math.min(bolt.segs.length, (bolt.age / Math.max(1, c.life - c.fadeOut)) * bolt.segs.length);
  }

  /** A core line (vertex colours) and a glow ribbon for `n` points. */
  makeLine(n, glowPx, brightness) {
    const core = new THREE.BufferGeometry();
    core.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    core.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const line = new THREE.Line(core, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const segs = n - 1;
    const glow = new THREE.BufferGeometry();
    glow.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segs * 12), 3).setUsage(THREE.DynamicDrawUsage));
    glow.setAttribute('color', new THREE.BufferAttribute(new Float32Array(segs * 12), 3).setUsage(THREE.DynamicDrawUsage));
    const uv = new Float32Array(segs * 8), index = [];
    for (let k = 0; k < segs; k++) {
      uv.set([0, 0, 0, 1, 1, 0, 1, 1], k * 8);
      const v = k * 4;
      index.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    }
    glow.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    glow.setIndex(index);
    const ribbon = new THREE.Mesh(glow, new THREE.MeshBasicMaterial({
      map: this.glowTexture, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    }));
    for (const m of [line, ribbon]) { m.frustumCulled = false; this.scene.add(m); }
    return { line, ribbon, n, glowPx, brightness, pts: new Float32Array(n * 3), light: new Float32Array(n) };
  }

  /** Where every point of a bolt is now (it follows the ships) and how bright. */
  place(bolt, camera) {
    const c = this.cfg, s = bolt.swarm, P = s.pos;
    const a = this._a, b = this._b, d = this._d, u = this._u, w = this._w;
    const main = bolt.main;
    const fade = bolt.age > c.life - c.fadeOut ? Math.max(0, (c.life - bolt.age) / c.fadeOut) : 1;
    const head = this.head(bolt);
    const flicker = 0.75 + 0.25 * Math.random();
    let k = 0, along = 0;
    const segFrames = [];
    for (const seg of bolt.segs) {
      a.fromArray(P, seg.a * 3); b.fromArray(P, seg.b * 3);
      d.subVectors(b, a);
      const len = d.length() || 1;
      d.divideScalar(len);
      u.set(Math.abs(d.y) < 0.9 ? 0 : 1, Math.abs(d.y) < 0.9 ? 1 : 0, 0).cross(d).normalize();
      w.crossVectors(d, u);
      segFrames.push({ a: a.clone(), d: d.clone(), u: u.clone(), w: w.clone(), len });
      for (const [t, ou, ov] of seg.pts) {
        main.pts[k * 3] = a.x + d.x * t * len + (u.x * ou + w.x * ov) * len;
        main.pts[k * 3 + 1] = a.y + d.y * t * len + (u.y * ou + w.y * ov) * len;
        main.pts[k * 3 + 2] = a.z + d.z * t * len + (u.z * ou + w.z * ov) * len;
        // energy flowing along: bright pulses running from ship to ship
        const x = along + t;
        const pulse = Math.pow(0.5 + 0.5 * Math.sin((x * c.flowWaves - bolt.age * c.flowSpeed + bolt.phase) * Math.PI * 2), 4);
        // only as far as it has run (the newest part brightest)
        main.light[k] = x > head ? 0 : fade * flicker * (0.55 + 0.45 * pulse) * (head - x < 0.3 ? 1.3 : 1);
        k++;
      }
      along += 1;
    }
    bolt.worldMain = main.pts;
    this.drawLine(main, camera);
    // branches, in the frame of the jump they grow from
    let bm = 0;
    for (const br of bolt.branches) {
      const f = segFrames[br.seg];
      const base = br.seg * (c.points + 1) + br.m;
      const ox = main.pts[base * 3], oy = main.pts[base * 3 + 1], oz = main.pts[base * 3 + 2];
      const put = (shape, mesh, x0, y0, z0) => {
        shape.pts.forEach(([x, y, z], j) => {
          mesh.pts[j * 3] = x0 + f.u.x * x + f.w.x * y + f.d.x * z;
          mesh.pts[j * 3 + 1] = y0 + f.u.y * x + f.w.y * y + f.d.y * z;
          mesh.pts[j * 3 + 2] = z0 + f.u.z * x + f.w.z * y + f.d.z * z;
          mesh.light[j] = fade * flicker * mesh.brightness * main.light[base] * (1 - j / shape.pts.length * 0.7);
        });
        this.drawLine(mesh, camera);
      };
      const mesh = bolt.branchMeshes[bm++];
      put(br.shape, mesh, ox, oy, oz);
      if (br.shape.sub) {
        const j = br.shape.from;
        put(br.shape.sub, bolt.branchMeshes[bm++], mesh.pts[j * 3], mesh.pts[j * 3 + 1], mesh.pts[j * 3 + 2]);
      }
    }
  }

  /** Writes a line's core and (with a camera) its glow ribbon, `glowPx` pixels to each side. */
  drawLine(m, camera) {
    const color = new THREE.Color(this.cfg.color), glowColor = new THREE.Color(this.cfg.glowColor);
    const P = m.line.geometry.attributes.position.array, C = m.line.geometry.attributes.color.array;
    P.set(m.pts);
    for (let j = 0; j < m.n; j++) { C[j * 3] = color.r * m.light[j]; C[j * 3 + 1] = color.g * m.light[j]; C[j * 3 + 2] = color.b * m.light[j]; }
    m.line.geometry.attributes.position.needsUpdate = true;
    m.line.geometry.attributes.color.needsUpdate = true;
    if (!camera) { m.ribbon.visible = false; return; }
    m.ribbon.visible = true;
    const R = m.ribbon.geometry.attributes.position.array, RC = m.ribbon.geometry.attributes.color.array;
    const cam = camera.position, a = this._p, b = this._q, v = this._d, s = this._u;
    const perPx = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, window.innerHeight || 600);
    for (let j = 0; j + 1 < m.n; j++) {
      a.fromArray(m.pts, j * 3); b.fromArray(m.pts, j * 3 + 3);
      v.addVectors(a, b).multiplyScalar(0.5).sub(cam);
      const half = (m.glowPx + 0.5) * perPx * v.length();
      s.subVectors(b, a).cross(v);
      s.multiplyScalar(half / (s.length() || 1));
      const o = j * 12;
      R[o] = a.x - s.x; R[o + 1] = a.y - s.y; R[o + 2] = a.z - s.z;
      R[o + 3] = a.x + s.x; R[o + 4] = a.y + s.y; R[o + 5] = a.z + s.z;
      R[o + 6] = b.x - s.x; R[o + 7] = b.y - s.y; R[o + 8] = b.z - s.z;
      R[o + 9] = b.x + s.x; R[o + 10] = b.y + s.y; R[o + 11] = b.z + s.z;
      const la = m.light[j], lb = m.light[j + 1];
      for (const [q, l] of [[0, la], [1, la], [2, lb], [3, lb]]) {
        RC[o + q * 3] = glowColor.r * l; RC[o + q * 3 + 1] = glowColor.g * l; RC[o + q * 3 + 2] = glowColor.b * l;
      }
    }
    m.ribbon.geometry.attributes.position.needsUpdate = true;
    m.ribbon.geometry.attributes.color.needsUpdate = true;
  }

  /** One frame: bolts run on, follow their ships, report finished jumps, and are gone after `life` frames. */
  update(camera) {
    const n = this.cfg.points + 1;
    for (const b of this.list) {
      b.age++;
      if (b.age < this.cfg.life && b.segs.every((sg) => sg.a < b.swarm.count && sg.b < b.swarm.count)) {
        this.place(b, camera);
        while (b.done < Math.floor(this.head(b) + 1e-6) && b.done < b.segs.length) {
          b.onJump?.(b.main.pts.subarray(b.done * n * 3, (b.done + 1) * n * 3));
          b.done++;
        }
      } else b.age = this.cfg.life;
    }
    for (const b of this.list.filter((x) => x.age >= this.cfg.life)) this.dispose(b);
    this.list = this.list.filter((x) => x.age < this.cfg.life);
  }

  dispose(b) {
    for (const m of [b.main, ...b.branchMeshes]) {
      for (const o of [m.line, m.ribbon]) { this.scene.remove(o); o.geometry.dispose(); o.material.dispose(); }
    }
  }

  clear() {
    for (const b of this.list) this.dispose(b);
    this.list = [];
  }
}

/** A small seeded random generator (the same bolt shape on every screen). */
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
