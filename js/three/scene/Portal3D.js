import { radialTexture } from '../textures.js';

const THREE = window.THREE;
const ORIGIN = new THREE.Vector3(); // the planet's centre: the tunnel faces it
const OUT = new THREE.Vector3(0, 0, 1);
// scratch values for update()
const _p = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _pq = new THREE.Quaternion();

/**
 * The spawn point: a subspace tunnel. Closed it is a small, dim, slowly turning vortex (click it
 * to call the swarm back); it opens into a wide blue tunnel — a funnel of light streaks swirling
 * into the distance around a bright white-blue core — when the ships arrive or a tug brings a
 * piece home, and closes again. It lives in the space group (it stays put in space while the
 * planet turns) and faces the planet.
 *
 * open() / close() / pulse(frames) set where it is heading; `openness` (0 closed … 1 open) eases
 * towards that every frame.
 */
export class Portal3D {
  constructor(parent, position, cfg) {
    this.cfg = cfg;
    this.t = 0;
    this.active = false;   // the swarm is called back home: the vortex glows brighter
    this.target = 0;       // 0 closed, 1 open
    this.openness = 0;
    this.pulseFrames = 0;  // open for a while, then close (a tug's delivery)

    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.inner = new THREE.Group(); // faces the planet; +z = out of the tunnel
    this.group.add(this.inner);

    const streakTex = streakTexture(cfg.streaks);
    this.narrow = 0;       // 0 … 1: how much of `narrowing` applies now (only while opening)
    const layer = (radiusTop, depth, opacity, color, repeat) => {
      const geo = trumpet(radiusTop, radiusTop * 0.08, depth, cfg.flare, cfg.fadeEnd);
      geo.rotateX(-Math.PI / 2);          // along z: the narrow end at z = 0, the wide bell back at −depth
      geo.translate(0, 0, -depth / 2);
      const tex = streakTex.clone();
      tex.needsUpdate = true;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeat, 1);
      const mat = new THREE.MeshBasicMaterial({
        map: tex, color, vertexColors: true, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      this.inner.add(mesh);
      return { mesh, tex, mat, base: opacity, radius: radiusTop, depth };
    };
    this.layers = [
      layer(1, 2.4, 0.9, cfg.color, 3),
      layer(0.8, 3.2, 0.7, cfg.innerColor, 5),
      layer(1.25, 1.4, 0.45, cfg.rimColor, 2),
    ];
    const glow = radialTexture([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.8)'], [0.6, 'rgba(255,255,255,0.2)'], [1, 'rgba(255,255,255,0)']]);
    this.core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: cfg.coreColor, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.core.position.z = -0.6;
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: cfg.color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.inner.add(this.core, this.halo);
    parent.add(this.group);
    this.apply();
  }

  open() { this.target = 1; this.pulseFrames = 0; }

  close() { this.target = 0; this.pulseFrames = 0; }

  /** Open for `frames` frames, then close (a tug's delivery). */
  pulse(frames = this.cfg.pulseFrames) {
    this.target = 1;
    this.pulseFrames = frames;
  }

  /** Is it heading open (sent to guests)? */
  get wantOpen() {
    return this.target === 1;
  }

  /** Guests: open or close as the host's tunnel does. */
  setOpen(on) {
    this.target = on ? 1 : 0;
  }

  /** World position of the tunnel's mouth (it moves with the space group). */
  worldPosition(out) {
    return this.group.getWorldPosition(out);
  }

  /** Is a ray close enough to click it? */
  hitBy(ray) {
    const p = this.worldPosition(new THREE.Vector3());
    return ray.distanceToPoint(p) < this.cfg.hitRadius + this.radius() * 0.6;
  }

  /** Mouth radius now. */
  radius() {
    const c = this.cfg;
    return c.closedRadius + (c.openRadius - c.closedRadius) * this.openness;
  }

  /** Where a ship comes out: just inside the mouth, at a random point of it. */
  exitPoint(out) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * this.radius() * 0.5;
    out.set(Math.cos(a) * r, Math.sin(a) * r, -0.3);
    return this.inner.localToWorld(out);
  }

  /** The direction out of the tunnel (world). */
  outward(out) {
    out.set(0, 0, 1).transformDirection(this.inner.matrixWorld);
    return out;
  }

  update(camera, facing = ORIGIN) {
    this.t++;
    const c = this.cfg;
    if (this.pulseFrames > 0 && --this.pulseFrames === 0) this.target = 0;
    // ease open / closed
    const speed = this.target > this.openness ? 1 / c.openFrames : 1 / c.closeFrames;
    this.openness += Math.max(-speed, Math.min(speed, this.target - this.openness));
    // narrower while it opens; once open it widens back to its usual shape (`narrowFrames`)
    if (this.target === 1 && this.openness < 1) this.narrow = 1;
    else this.narrow = Math.max(0, this.narrow - 1 / c.narrowFrames);
    // face the planet (the origin)
    if (facing) {
      this.group.updateWorldMatrix(true, false);
      const p = this.group.getWorldPosition(_p);
      const dir = _d.copy(facing).sub(p).normalize();
      const q = _q.setFromUnitVectors(OUT, dir);
      const parentQ = this.group.parent ? this.group.parent.getWorldQuaternion(_pq) : _pq.identity();
      this.inner.quaternion.copy(parentQ.invert().multiply(q));
    }
    this.apply();
  }

  apply() {
    const c = this.cfg, o = this.openness, r = this.radius();
    const glowUp = this.active ? 1.6 : 1;
    // swirl: every layer turns and its streaks run inwards
    this.layers.forEach((L, n) => {
      const zs = 0.35 + 0.65 * o + 0.05;
      L.mesh.scale.set(r, r, zs * narrowing(L, r, zs, (c.narrowing * this.narrow * Math.PI) / 180));
      L.mesh.rotation.z = this.t * (0.01 + n * 0.006) * (n % 2 ? -1 : 1);
      L.tex.offset.y = (this.t * (0.012 + n * 0.004)) % 1;
      L.mat.opacity = L.base * (0.35 + 0.65 * o) * (n === 2 ? glowUp : 1);
    });
    const coreSize = r * (0.9 + 0.12 * Math.sin(this.t * 0.07)) * (0.7 + 0.6 * o);
    this.core.scale.set(coreSize, coreSize, 1);
    this.core.material.opacity = (0.5 + 0.5 * o) * glowUp;
    const halo = r * 3.2 * (0.5 + 0.5 * o);
    this.halo.scale.set(halo, halo, 1);
    this.halo.material.opacity = 0.25 + 0.4 * o + (this.active ? 0.2 : 0);
  }

  dispose() {
    this.group.parent?.remove(this.group);
  }
}

/**
 * How much longer layer L must be to look `by` radians narrower at its current size (`r` across,
 * `zs` along): the angle between the axis and the line from the narrow end to the rim gets smaller.
 */
function narrowing(L, r, zs, by) {
  if (by <= 0) return 1;
  const spread = 0.92 * L.radius * r, along = L.depth * zs;
  const angle = Math.atan2(spread, along);
  return spread / Math.tan(Math.max(0.05, angle - by)) / along;
}

/**
 * An open tube along y like CylinderGeometry (`wide` radius at the top, `narrow` at the bottom),
 * but its radius grows as t^flare along it (t = 0 at the narrow end, 1 at the top): narrow most of
 * the way, opening out at the end like the bell of a trumpet.
 */
function trumpet(wide, narrow, depth, flare, fadeEnd) {
  const geo = new THREE.CylinderGeometry(wide, narrow, depth, 48, 32, true);
  const P = geo.attributes.position;
  // the last `fadeEnd` of the streaks (at the bell) fade out: vertex colours from white to black
  // (with additive blending, black adds nothing — transparent)
  const col = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) {
    const t = Math.min(1, Math.max(0, P.getY(i) / depth + 0.5)); // (a tiny negative would make pow NaN)
    const straight = narrow + (wide - narrow) * t, bell = narrow + (wide - narrow) * Math.pow(t, flare);
    const k = straight > 1e-6 ? bell / straight : 1;
    P.setX(i, P.getX(i) * k);
    P.setZ(i, P.getZ(i) * k);
    const f = Math.min(1, (1 - t) / fadeEnd);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = f;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Light streaks running along the tunnel: `count` bright thin lines and soft glows, unevenly
 * spread — bunched around a few random places with gaps between.
 */
function streakTexture(count) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,1)';
  g.fillRect(0, 0, 256, 128);
  const bunches = Array.from({ length: 5 }, () => ({ x: Math.random() * 256, spread: 6 + Math.random() * 26 }));
  for (let k = 0; k < count; k++) {
    // most around a bunch (a rough bell curve around it), a few anywhere
    const b = bunches[(Math.random() * bunches.length) | 0];
    const off = (Math.random() + Math.random() + Math.random() - 1.5) * b.spread;
    const x = (Math.random() < 0.15 ? Math.random() * 256 : b.x + off + 256) % 256;
    const w = 1 + Math.random() * (k < count / 6 ? 10 : 3);
    const grad = g.createLinearGradient(0, 0, 0, 128);
    const a = 0.25 + Math.random() * 0.75;
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.2 + Math.random() * 0.3, `rgba(255,255,255,${a})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(x, 0, w, 128);
  }
  return new THREE.CanvasTexture(c);
}
