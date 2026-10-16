import { radialTexture } from '../textures.js';

const THREE = window.THREE;
const FORWARD = new THREE.Vector3(0, 0, 1);

/**
 * Snipers' shots: a thin bright streak (a little smaller than an eater) flying straight at its
 * target, speeding up by `accel` (5%) for every voxel it has flown. In front of it a rounded,
 * glowing cap — like a meteor entering an atmosphere (a round bow shock, not a jet's sharp V) —
 * that grows brighter and longer as it speeds up, with a short fading wake behind. At the target
 * `onHit(shot)` (the host destroys the voxel hit) and a small flash.
 *
 * On the host a shot follows its target voxel (it may be on a drifting piece); on a guest it just
 * flies to the point the host sent.
 */
export class Shots {
  constructor(scene, cfg, voxelSize) {
    this.scene = scene;
    this.cfg = cfg;
    this.voxel = voxelSize;
    this.list = [];
    this.flashes = [];
    this.nextId = 1;
    this.fired = 0; // (tests)
    const [w, h, l] = cfg.shotSize;
    this.streakGeometry = new THREE.BoxGeometry(w, h, l);
    this.streakMaterial = new THREE.MeshBasicMaterial({ color: cfg.shotColor });
    // the cap: a rounded bow wrapped round the front of the shot and swept back — a paraboloid
    // from its tip (z = 0) to radius 1 at z = −1 — glowing at its edges (as seen from the camera),
    // see-through in the middle, hot white at the tip, fading out towards the back
    const profile = [];
    for (let k = 0; k <= 12; k++) { const u = k / 12; profile.push(new THREE.Vector2(Math.max(0.001, u), -u * u)); }
    this.capGeometry = new THREE.LatheGeometry(profile, 24); // around y; y = −u² back
    this.capGeometry.rotateX(Math.PI / 2); // y → z: the tip forward (+z), the bow sweeping back to −z
    this.capMaterial = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(cfg.shockColor) }, core: { value: new THREE.Color(cfg.shockCore) }, glow: { value: 1 } },
      vertexShader: `varying vec3 vN; varying vec3 vV; varying float vBack;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
          vBack = clamp(-position.z, 0.0, 1.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 color; uniform vec3 core; uniform float glow; varying vec3 vN; varying vec3 vV; varying float vBack;
        void main() { float f = abs(dot(normalize(vN), normalize(vV)));
          float rim = pow(1.0 - f, 2.0);              // the edges as seen from the camera glow
          float tip = pow(1.0 - vBack, 6.0);          // white-hot at the very front
          float fade = pow(1.0 - vBack, 1.5);         // dying out towards the back
          vec3 c = mix(color, core, tip) * glow * (0.12 + 0.9 * rim + 0.8 * tip) * fade;
          gl_FragColor = vec4(c, 1.0); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.glowTexture = radialTexture([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,200,140,0.7)'], [1, 'rgba(0,0,0,0)']]);
  }

  get any() {
    return this.list.length > 0;
  }

  /** A shot from `from` to `to`; `target` (the voxel, host), `owner` (a player), `unit` (host). */
  fire(from, to, { target = -1, owner = null, unit = -1 } = {}) {
    const c = this.cfg;
    const group = new THREE.Group();
    const streak = new THREE.Mesh(this.streakGeometry, this.streakMaterial);
    const cap = new THREE.Mesh(this.capGeometry, this.capMaterial.clone());
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTexture, color: c.shockColor, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    // the wake: a fading line behind it
    const wakeGeo = new THREE.BufferGeometry();
    wakeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const bright = new THREE.Color(c.shockColor);
    wakeGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array([bright.r, bright.g, bright.b, 0, 0, 0]), 3));
    const wake = new THREE.Line(wakeGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    wake.frustumCulled = false;
    group.add(streak, cap, halo);
    group.position.set(from.x, from.y, from.z);
    this.scene.add(group, wake);
    const shot = { id: this.nextId++, group, cap, halo, wake, to: new THREE.Vector3(to.x, to.y, to.z), target, owner, unit, speed: c.speed, flown: 0 };
    this.aim(shot);
    this.list.push(shot);
    this.fired++;
    return shot;
  }

  /** Turns the shot towards its target. */
  aim(s) {
    const d = SHOT_D.subVectors(s.to, s.group.position);
    if (d.lengthSq() > 1e-12) s.group.quaternion.setFromUnitVectors(FORWARD, d.normalize());
  }

  /**
   * One frame: shots fly (speeding up by `accel` per voxel flown) towards their target
   * (`targetPos(shot, out)` may move it); at it they hit: `onHit(shot)` and a flash.
   */
  update(onHit, targetPos = null) {
    const c = this.cfg;
    for (const s of this.list) {
      if (targetPos) targetPos(s, s.to);
      const p = s.group.position;
      const d = SHOT_D.subVectors(s.to, p), dist = d.length();
      if (dist <= s.speed) {
        p.copy(s.to);
        s.done = true;
        onHit?.(s);
        this.flash(p);
        continue;
      }
      this.aim(s);
      SHOT_P.copy(p);
      p.addScaledVector(d, s.speed / dist);
      s.flown += s.speed;
      // 5% faster for every voxel flown
      s.speed = c.speed * Math.pow(c.accel, s.flown / this.voxel);
      // the cap and wake grow with the speed
      const k = Math.min(3, s.speed / c.speed);
      const r = c.shockRadius * (0.8 + 0.2 * k);
      s.cap.scale.set(r, r, c.shockLength * (0.7 + 0.3 * k)); // longer as it speeds up
      s.cap.position.z = c.shotSize[2] / 2 + r * 0.25; // just ahead of the tip
      s.cap.material.uniforms.glow.value = 0.6 + 0.2 * k;
      const h = c.shockRadius * 4 * (0.7 + 0.15 * k);
      s.halo.scale.set(h, h, 1);
      s.halo.position.z = c.shotSize[2] / 2;
      s.halo.material.opacity = 0.35 + 0.1 * k;
      const W = s.wake.geometry.attributes.position.array, back = c.wake * k;
      d.normalize();
      W[0] = p.x; W[1] = p.y; W[2] = p.z;
      W[3] = p.x - d.x * back; W[4] = p.y - d.y * back; W[5] = p.z - d.z * back;
      s.wake.geometry.attributes.position.needsUpdate = true;
    }
    for (const s of this.list.filter((x) => x.done)) this.remove(s);
    this.list = this.list.filter((x) => !x.done);
    for (const f of this.flashes) {
      f.age++;
      const k = f.age / c.flashFrames;
      f.sprite.scale.setScalar(c.flashSize * (0.4 + k));
      f.sprite.material.opacity = Math.max(0, 1 - k);
    }
    for (const f of this.flashes.filter((x) => x.age >= c.flashFrames)) {
      this.scene.remove(f.sprite);
      f.sprite.material.dispose();
    }
    this.flashes = this.flashes.filter((x) => x.age < c.flashFrames);
  }

  flash(at) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTexture, color: this.cfg.shockColor, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sprite.position.copy(at);
    this.scene.add(sprite);
    this.flashes.push({ sprite, age: 0 });
  }

  remove(s) {
    this.scene.remove(s.group, s.wake);
    s.cap.material.dispose();
    s.halo.material.dispose();
    s.wake.geometry.dispose();
    s.wake.material.dispose();
  }

  clear() {
    for (const s of this.list) this.remove(s);
    this.list = [];
  }
}

const SHOT_D = new THREE.Vector3(), SHOT_P = new THREE.Vector3();
