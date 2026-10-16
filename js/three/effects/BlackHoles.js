const THREE = window.THREE;
const MAX = 8; // holes drawn at once

/**
 * Black holes left by bombers: for `grow + hold + shrink` frames (1 s + 2 s + 1 s) a hole bends
 * the picture around it (gravitational lensing: what is behind it shows up as a ring around a
 * black disc) and pulls in debris and drifting pieces within `range` — gently. Debris that falls
 * in is gone; a piece that falls in is swallowed (its voxels count as eaten for the hole's owner).
 *
 * The lensing is a pass over the whole frame: when a hole is up, the scene is drawn into a
 * texture first, then onto the screen through a shader that moves every pixel's sample point the
 * way a point lens does (β = θ − θE² / θ), with a black disc inside the horizon.
 */
export class BlackHoles {
  constructor(cfg) {
    this.cfg = cfg;
    this.holes = [];
    this.made = 0; // (tests)
    this._v = new THREE.Vector3();
    this._p = new THREE.Vector3();
  }

  get any() {
    return this.holes.length > 0;
  }

  /** A hole at `pos` (planet frame); `owner` (a player, on the host) gets what it swallows. */
  add(pos, owner = null) {
    this.holes.push({ pos: new THREE.Vector3(pos.x, pos.y, pos.z), age: 0, owner });
    this.made++;
  }

  /** 0 … 1: grows for `grow` frames, holds, shrinks for `shrink` frames. */
  strength(h) {
    const c = this.cfg;
    if (h.age < c.grow) return h.age / c.grow;
    if (h.age < c.grow + c.hold) return 1;
    return Math.max(0, 1 - (h.age - c.grow - c.hold) / c.shrink);
  }

  /**
   * One frame: holes age; debris within range is pulled in (and gone at the core); on the host
   * (`fragments` given) drifting pieces are pulled too and swallowed at the core — `onSwallow(f, owner)`.
   */
  update(debris, fragments = null, onSwallow = null) {
    const c = this.cfg;
    for (const h of this.holes) {
      h.age++;
      const s = this.strength(h);
      if (s <= 0) continue;
      const hx = h.pos.x, hy = h.pos.y, hz = h.pos.z, r2 = c.range * c.range, core = c.core * s;
      // debris: a gentle pull, stronger closer in
      const { pos, vel, life } = debris;
      for (let i = 0; i < debris.count; i++) {
        const i3 = i * 3;
        const dx = hx - pos[i3], dy = hy - pos[i3 + 1], dz = hz - pos[i3 + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > r2) continue;
        const d = Math.sqrt(d2) || 1;
        if (d < core) { life[i] = 0; continue; }
        const a = (c.pullDebris * s * (1 + (c.range - d) / c.range)) / d;
        vel[i3] += dx * a; vel[i3 + 1] += dy * a; vel[i3 + 2] += dz * a;
      }
      if (!fragments) continue;
      for (const f of [...fragments.list]) {
        if (f.dead) continue;
        const v = this._v.subVectors(h.pos, f.pos), d = v.length();
        if (d > c.range + f.radius) continue;
        if (d < core + f.radius * 0.3) { onSwallow?.(f, h.owner); continue; }
        f.vel.addScaledVector(v.divideScalar(d || 1), c.pullPieces * s);
        if (f.vel.length() > c.maxPieceSpeed) f.vel.setLength(c.maxPieceSpeed);
        if (!f.towed) f.origin.copy(f.pos); // its own drift limit doesn't hold it back
      }
    }
    this.holes = this.holes.filter((h) => h.age < c.grow + c.hold + c.shrink);
  }

  clear() {
    this.holes = [];
  }

  // --- drawing ---

  /** Draws the frame — through the lens pass when a hole is up. */
  render(renderer, scene, camera) {
    if (!this.any) {
      renderer.render(scene, camera);
      return;
    }
    camera.updateMatrixWorld(); // (where the holes are on screen must match this frame's camera)
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    if (!this.target || this.target.width !== size.x || this.target.height !== size.y) {
      this.target?.dispose();
      this.target = new THREE.WebGLRenderTarget(size.x, size.y);
    }
    this.pass ||= makeLensPass();
    const u = this.pass.material.uniforms;
    const aspect = size.x / size.y, tanHalf = Math.tan((camera.fov * Math.PI) / 360);
    let n = 0;
    for (const h of this.holes) {
      const s = this.strength(h);
      if (s <= 0 || n >= MAX) continue;
      const p = this._p.copy(h.pos).project(camera);
      const dist = this._v.copy(h.pos).applyMatrix4(camera.matrixWorldInverse).z;
      if (dist >= 0) continue; // behind the camera
      // the Einstein radius on screen, in units of the screen height
      const re = (this.cfg.size * s) / (-dist * tanHalf * 2);
      u.holes.value[n].set((p.x + 1) / 2, (p.y + 1) / 2, re, s);
      n++;
    }
    if (n === 0) {
      renderer.render(scene, camera);
      return;
    }
    u.count.value = n;
    u.aspect.value = aspect;
    u.tDiffuse.value = this.target.texture;
    u.ring.value.set(this.cfg.ringColor);
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.pass.scene, this.pass.camera);
  }
}

function makeLensPass() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      aspect: { value: 1 },
      count: { value: 0 },
      holes: { value: Array.from({ length: MAX }, () => new THREE.Vector4()) },
      ring: { value: new THREE.Color() },
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float aspect;
      uniform int count;
      uniform vec4 holes[${MAX}];
      uniform vec3 ring;
      varying vec2 vUv;
      void main() {
        vec2 uv = vUv;
        float dark = 0.0;
        float glow = 0.0;
        for (int i = 0; i < ${MAX}; i++) {
          if (i >= count) break;
          vec4 h = holes[i];
          vec2 d = (vUv - h.xy) * vec2(aspect, 1.0);   // in screen-height units
          float r = max(length(d), 1e-5);
          float re = h.z;                                 // Einstein radius
          // a point lens: the light seen at r comes from r - re^2 / r (from across the hole inside the ring)
          float src = r - re * re / r;
          uv += (d / r) * (src - r) / vec2(aspect, 1.0);
          float horizon = re * 0.55;
          dark = max(dark, 1.0 - smoothstep(horizon * 0.92, horizon, r));
          glow += h.w * exp(-pow((r - horizon * 1.08) / (re * 0.06 + 1e-4), 2.0)) * 0.6;
        }
        vec3 col = texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb;
        col = col * (1.0 - dark) + ring * glow;
        gl_FragColor = vec4(col, 1.0);
      }`,
    depthTest: false,
    depthWrite: false,
  });
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);
  return { scene, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), material };
}
