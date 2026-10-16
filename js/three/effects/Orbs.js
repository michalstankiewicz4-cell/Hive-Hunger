import { radialTexture } from '../textures.js';

const THREE = window.THREE;

/**
 * Plasma orbs fired by magenta orb ships: a ball the size of a voxel with a pulsing glow and a
 * fiery tail (sparks left behind it, white-yellow at the ball → orange → dark red, shrinking and
 * fading) that flies slowly to its target and bursts there (Game3D.orbBurst destroys everything within
 * `blast`), with a short flash. On the host an orb follows its target voxel (it may be on a
 * drifting piece); on a guest it just flies to the point the host sent.
 */
export class Orbs {
  constructor(scene, cfg, voxelSize) {
    this.scene = scene;
    this.cfg = cfg;
    this.size = voxelSize;
    this.list = [];
    this.flashes = [];
    this.nextId = 1;
    this.fired = 0; // (tests)
    this.glowTexture = radialTexture([[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,120,255,0.9)'], [0.5, 'rgba(220,40,200,0.35)'], [1, 'rgba(0,0,0,0)']]);
    this.coreGeometry = new THREE.SphereGeometry(voxelSize / 2, 12, 8);
    this.coreMaterial = new THREE.MeshBasicMaterial({ color: cfg.color });
    this.time = 0;
    // the fiery tails: one point cloud for all of them (per-point size and colour)
    const max = cfg.tailMax;
    this.tail = { pos: new Float32Array(max * 3), vel: new Float32Array(max * 3), life: new Float32Array(max), n: 0, max };
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.tailPoints = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: { map: { value: this.glowTexture }, scale: { value: 300 } },
      vertexShader: `attribute float size; attribute vec3 color; varying vec3 vColor;
        uniform float scale;
        void main() { vColor = color; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vColor;
        void main() { vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vColor * t.a, 1.0); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.tailPoints.frustumCulled = false;
    scene.add(this.tailPoints);
  }

  /** A spark of the tail at p, drifting a little. */
  spark(p) {
    const t = this.tail;
    const i = t.n < t.max ? t.n++ : (Math.random() * t.max) | 0;
    const j = this.cfg.tailJitter;
    t.pos.set([p.x + (Math.random() - 0.5) * j, p.y + (Math.random() - 0.5) * j, p.z + (Math.random() - 0.5) * j], i * 3);
    t.vel.set([(Math.random() - 0.5) * 0.01, (Math.random() - 0.5) * 0.01, (Math.random() - 0.5) * 0.01], i * 3);
    t.life[i] = 1;
  }

  /** Tail sparks age: white-yellow → orange → dark red, shrinking, then gone. */
  updateTail() {
    const t = this.tail, geo = this.tailPoints.geometry;
    const P = geo.attributes.position.array, C = geo.attributes.color.array, S = geo.attributes.size.array;
    const fade = 1 / this.cfg.tailFrames;
    // point size in world units: pixels per unit at distance 1 (50° field of view)
    this.tailPoints.material.uniforms.scale.value = (window.innerHeight || 600) / (2 * Math.tan((25 * Math.PI) / 180));
    let w = 0;
    for (let r = 0; r < t.n; r++) {
      const l = t.life[r] - fade;
      if (l <= 0) continue;
      for (let a = 0; a < 3; a++) {
        t.vel[w * 3 + a] = t.vel[r * 3 + a];
        t.pos[w * 3 + a] = t.pos[r * 3 + a] + t.vel[r * 3 + a];
        P[w * 3 + a] = t.pos[w * 3 + a];
      }
      t.life[w] = l;
      // fire colours by age
      C[w * 3] = Math.min(1, 0.35 + l);
      C[w * 3 + 1] = Math.max(0, l * l * 0.95);
      C[w * 3 + 2] = Math.max(0, (l - 0.7) * 2);
      S[w] = this.size * this.cfg.tailSize * (0.35 + 0.65 * l);
      w++;
    }
    t.n = w;
    geo.setDrawRange(0, w);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
  }

  get any() {
    return this.list.length > 0;
  }

  /**
   * An orb from `from` to `to` ({x, y, z}); `target` = the voxel aimed at (host), `owner` (a
   * player) and `unit` (the ship that fired it, host).
   */
  fire(from, to, { target = -1, owner = null, unit = -1 } = {}) {
    const core = new THREE.Mesh(this.coreGeometry, this.coreMaterial);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTexture, color: this.cfg.glowColor, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const group = new THREE.Group();
    group.add(core, glow);
    group.position.set(from.x, from.y, from.z);
    this.scene.add(group);
    const orb = { id: this.nextId++, group, glow, to: new THREE.Vector3(to.x, to.y, to.z), target, owner, unit, phase: Math.random() * 6 };
    this.list.push(orb);
    this.fired++;
    return orb;
  }

  /**
   * One frame: orbs fly at `speed` towards their target (`targetPos(orb, out)` may move it — a
   * voxel on a drifting piece); at it they burst: `onBurst(orb)`, then a flash.
   */
  update(onBurst, targetPos = null) {
    this.time++;
    const c = this.cfg, v = this._v || (this._v = new THREE.Vector3());
    for (const o of this.list) {
      if (targetPos) targetPos(o, o.to);
      const p = o.group.position;
      v.subVectors(o.to, p);
      const d = v.length();
      if (d <= c.speed) {
        p.copy(o.to);
        o.done = true;
        onBurst?.(o);
        this.flash(p);
        continue;
      }
      // the tail: sparks along the way it just flew
      const from = p.clone();
      p.addScaledVector(v, c.speed / d);
      for (let k = 0; k < c.tailPerFrame; k++) this.spark(v.copy(from).lerp(p, k / c.tailPerFrame));
      // the glow pulses
      const s = this.size * c.glowSize * (1 + 0.35 * Math.sin(this.time * c.pulse + o.phase));
      o.glow.scale.set(s, s, 1);
    }
    this.updateTail();
    for (const o of this.list.filter((x) => x.done)) this.remove(o);
    this.list = this.list.filter((x) => !x.done);
    // flashes: a quick bright bloom that fades
    for (const f of this.flashes) {
      f.age++;
      const k = f.age / c.flashFrames;
      f.sprite.scale.setScalar(this.size * c.flashSize * (0.4 + k));
      f.sprite.material.opacity = Math.max(0, 1 - k);
    }
    for (const f of this.flashes.filter((x) => x.age >= c.flashFrames)) {
      this.scene.remove(f.sprite);
      f.sprite.material.dispose();
    }
    this.flashes = this.flashes.filter((x) => x.age < c.flashFrames);
  }

  flash(at) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTexture, color: this.cfg.glowColor, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    sprite.position.copy(at);
    this.scene.add(sprite);
    this.flashes.push({ sprite, age: 0 });
  }

  remove(o) {
    this.scene.remove(o.group);
    o.glow.material.dispose();
  }

  clear() {
    for (const o of this.list) this.remove(o);
    this.list = [];
  }
}
