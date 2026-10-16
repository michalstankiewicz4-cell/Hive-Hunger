import { bandGlowTexture } from '../textures.js';

const THREE = window.THREE;

/**
 * Lightning bolts (chain lightning, storm ships): a jagged white core with a thin coloured glow
 * along it — `glowPx` pixels on each side, whatever the distance — fading out over `life`
 * frames. Purely visual — the damage is done in VoxelPlanet / Game3D on the host.
 *
 * The glow is a ribbon of camera-facing quads along the core's path, re-aimed every frame in
 * `update(camera)` so its width stays the same on screen.
 */
export class Lightning3D {
  constructor(scene, { life = 20, jag = 0.35, pieces = 5, glowPx = 2 } = {}) {
    this.scene = scene;
    this.life = life;
    this.jag = jag;
    this.pieces = pieces;
    this.glowPx = glowPx;
    this.bolts = [];
    this.shown = 0; // bolts drawn so far (tests)
    this.glowTexture = bandGlowTexture();
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._v = new THREE.Vector3();
  }

  /**
   * @param {number[]} path [x, y, z, x, y, z, …] — the points the bolt goes through, in order
   * @param {number} strength 0…1 — brightness (weaker side bolts)
   */
  show(path, color, strength = 1) {
    this.shown++;
    const pts = this.jagged(path, this.jag);
    // the core: a 1-pixel white line
    const coreGeo = new THREE.BufferGeometry();
    coreGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const core = new THREE.Line(coreGeo, new THREE.LineBasicMaterial({
      color: 0xffffff, transparent: true, opacity: strength, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    // the glow: a ribbon along the same path (positions set in update)
    const segs = pts.length / 3 - 1;
    const glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segs * 12), 3));
    const uv = new Float32Array(segs * 8), index = [];
    for (let n = 0; n < segs; n++) {
      uv.set([0, 0, 0, 1, 1, 0, 1, 1], n * 8);
      const v = n * 4;
      index.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    }
    glowGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    glowGeo.setIndex(index);
    const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({
      map: this.glowTexture, color, transparent: true, opacity: strength, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    }));
    glow.frustumCulled = false;
    glow.visible = false; // until update() has aimed it at the camera
    this.scene.add(glow, core);
    this.bolts.push({ lines: [glow, core], pts, glow, age: 0, strength });
  }

  /** Splits every segment into pieces and pushes the inner points sideways at random. */
  jagged(path, amount) {
    const out = [];
    for (let i = 0; i + 5 < path.length; i += 3) {
      const ax = path[i], ay = path[i + 1], az = path[i + 2];
      const bx = path[i + 3], by = path[i + 4], bz = path[i + 5];
      for (let k = 0; k < this.pieces; k++) {
        const t = k / this.pieces;
        const off = k === 0 ? 0 : amount;
        out.push(
          ax + (bx - ax) * t + (Math.random() - 0.5) * off,
          ay + (by - ay) * t + (Math.random() - 0.5) * off,
          az + (bz - az) * t + (Math.random() - 0.5) * off,
        );
      }
    }
    out.push(path[path.length - 3], path[path.length - 2], path[path.length - 1]);
    return out;
  }

  /** Aims a bolt's glow ribbon at the camera, `glowPx` pixels to each side of the core. */
  aimGlow(b, camera) {
    const P = b.glow.geometry.attributes.position.array, pts = b.pts;
    const cam = camera.position;
    const perPx = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, window.innerHeight || 600);
    const half = this.glowPx + 0.5; // the core's own pixel in the middle
    const a = this._a, c = this._b, s = this._s, v = this._v;
    for (let n = 0; n + 1 < pts.length / 3; n++) {
      a.fromArray(pts, n * 3);
      c.fromArray(pts, n * 3 + 3);
      v.addVectors(a, c).multiplyScalar(0.5).sub(cam);
      const w = half * perPx * v.length();
      s.subVectors(c, a).cross(v);
      const l = s.length() || 1;
      s.multiplyScalar(w / l);
      const o = n * 12;
      P[o] = a.x - s.x; P[o + 1] = a.y - s.y; P[o + 2] = a.z - s.z;
      P[o + 3] = a.x + s.x; P[o + 4] = a.y + s.y; P[o + 5] = a.z + s.z;
      P[o + 6] = c.x - s.x; P[o + 7] = c.y - s.y; P[o + 8] = c.z - s.z;
      P[o + 9] = c.x + s.x; P[o + 10] = c.y + s.y; P[o + 11] = c.z + s.z;
    }
    b.glow.geometry.attributes.position.needsUpdate = true;
    b.glow.visible = true;
  }

  /** Removes every bolt at once. */
  clear() {
    for (const b of this.bolts) b.age = this.life;
    this.update();
  }

  /** One frame: bolts flicker and fade; with a camera, the glow ribbons turn to face it. */
  update(camera) {
    for (const b of this.bolts) {
      b.age++;
      const f = 1 - b.age / this.life;
      // flicker while fading
      for (const line of b.lines) line.material.opacity = Math.max(0, f) * (0.6 + 0.4 * Math.random()) * b.strength;
      if (camera && b.age < this.life) this.aimGlow(b, camera);
    }
    const done = this.bolts.filter((b) => b.age >= this.life);
    for (const b of done) {
      for (const line of b.lines) {
        this.scene.remove(line);
        line.geometry.dispose();
        line.material.dispose();
      }
    }
    if (done.length) this.bolts = this.bolts.filter((b) => b.age < this.life);
  }
}
