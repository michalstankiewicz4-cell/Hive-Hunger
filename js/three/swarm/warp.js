import { linearTexture } from '../textures.js';

const THREE = window.THREE;

/**
 * Jumping to hyperspace (Swarm3D): after a planet every ship waits a random time, speeds up away
 * from the planet and is gone, leaving a streak (renderTrails).
 */
export const Hyperspace = {

  /**
   * Every ship jumps to hyperspace after a random wait (0 … `warp.window` frames; with many ships
   * several go at once): its jump direction is its heading turned away from the planet.
   */
  jumpAll() {
    const w = this.cfg.warp;
    for (let i = 0; i < this.count; i++) {
      if (this.hidden[i]) continue;
      this.warpDelay[i] = Math.floor(Math.random() * w.window);
    }
  },

  /** Ship i starts its jump along (dx, dy, dz) (on a guest: told by the host). */
  startWarp(i, dx, dy, dz) {
    const i3 = i * 3;
    this.warpDelay[i] = -1;
    this.warpT[i] = 1;
    const l = Math.hypot(dx, dy, dz) || 1;
    this.warpDir[i3] = dx / l; this.warpDir[i3 + 1] = dy / l; this.warpDir[i3 + 2] = dz / l;
    this.warpFrom[i3] = this.pos[i3]; this.warpFrom[i3 + 1] = this.pos[i3 + 1]; this.warpFrom[i3 + 2] = this.pos[i3 + 2];
    this.dir[i3] = this.look[i3] = this.warpDir[i3];
    this.dir[i3 + 1] = this.look[i3 + 1] = this.warpDir[i3 + 1];
    this.dir[i3 + 2] = this.look[i3 + 2] = this.warpDir[i3 + 2];
  },

  /** One frame of jumping: waits count down; jumping ships speed up and are gone after `warp.frames`. */
  stepWarp(remote = false) {
    const w = this.cfg.warp, P = this.pos, D = this.warpDir;
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      if (!remote && this.warpDelay[i] >= 0 && !this.hidden[i]) {
        if (this.warpDelay[i]-- === 0) {
          // away from the planet, roughly where it was heading
          const px = P[i3], py = P[i3 + 1], pz = P[i3 + 2], pl = Math.hypot(px, py, pz) || 1;
          const dx = this.dir[i3] + (px / pl) * w.outward, dy = this.dir[i3 + 1] + (py / pl) * w.outward, dz = this.dir[i3 + 2] + (pz / pl) * w.outward;
          this.startWarp(i, dx, dy, dz);
          this.started.push([i, this.warpDir[i3], this.warpDir[i3 + 1], this.warpDir[i3 + 2]]);
        }
      }
      if (this.warpT[i] > 0) {
        const v = Math.min(w.maxSpeed, this.speed * Math.pow(w.accel, this.warpT[i]));
        P[i3] += D[i3] * v; P[i3 + 1] += D[i3 + 1] * v; P[i3 + 2] += D[i3 + 2] * v;
        if (++this.warpT[i] > w.frames) {
          this.warpT[i] = 0;
          this.hidden[i] = 1;
          this.trails.push({ i, from: Array.from(this.warpFrom.subarray(i3, i3 + 3)), to: [P[i3], P[i3 + 1], P[i3 + 2]], age: 0 });
        }
      }
    }
  },

  /** Every ship is hidden: gone to hyperspace, or not out of the tunnel yet. */
  get allHidden() {
    for (let i = 0; i < this.count; i++) if (!this.hidden[i]) return false;
    return true;
  },

  /** Clears the jump state of every ship (a new planet). */
  resetWarp() {
    this.warpDelay.fill(-1);
    this.warpT.fill(0);
    this.started.length = 0;
  },

  /**
   * Hyperspace streaks: from where a ship started its jump to where it is (or vanished) — a
   * glowing band in the tunnel's blues with light streaks along it, brightest at the ship, that
   * fades after the ship is gone.
   */
  renderTrails(camera) {
    const w = this.cfg.warp;
    const live = [];
    for (let i = 0; i < this.count; i++) {
      if (this.warpT[i] > 0) live.push({ from: this.warpFrom.subarray(i * 3, i * 3 + 3), to: this.pos.subarray(i * 3, i * 3 + 3), fade: 1, width: 1 });
    }
    for (const t of this.trails) {
      t.age++;
      live.push({ from: t.from, to: t.to, fade: Math.max(0, 1 - t.age / w.trailFade), width: 1 + t.age / w.trailFade });
    }
    this.trails = this.trails.filter((t) => t.age < w.trailFade);
    this.warpTrails ||= [];
    live.forEach((t, n) => {
      const m = this.warpTrails[n] || (this.warpTrails[n] = makeWarpTrail(w, this.scene));
      placeWarpTrail(m, t, w, camera);
    });
    for (let k = live.length; k < this.warpTrails.length; k++) this.warpTrails[k].group.visible = false;
  },
};

/**
 * A hyperspace streak: a camera-facing band from the jump's start to the ship (bright and narrow
 * at the ship, wider and fainter behind, in the tunnel's blues) plus light streaks along it.
 */
let trailGlow = null;
function makeWarpTrail(cfg, scene) {
  const group = new THREE.Group();
  // along the band (u): faint behind → bright at the ship (one texture for every streak)
  const glow = trailGlow || (trailGlow = linearTexture(64, 4, [0, 0, 64, 0], [[0, 'rgba(255,255,255,0)'], [0.6, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,1)']]));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 1, 0, 1, 1]), 2));
  geo.setIndex([0, 2, 1, 1, 2, 3]);
  const band = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map: glow, color: cfg.color, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide,
  }));
  const n = cfg.streaks;
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3).setUsage(THREE.DynamicDrawUsage));
  const col = new Float32Array(n * 6), bright = new THREE.Color(cfg.streakColor), dim = bright.clone().multiplyScalar(0.05);
  for (let k = 0; k < n; k++) col.set([dim.r, dim.g, dim.b, bright.r, bright.g, bright.b], k * 6);
  sGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const streaks = new THREE.LineSegments(sGeo, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  const offs = Array.from({ length: n }, () => [Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 0.6]);
  for (const m of [band, streaks]) m.frustumCulled = false;
  group.add(band, streaks);
  scene.add(group);
  return { group, band, streaks, offs };
}

const WT_A = new THREE.Vector3(), WT_B = new THREE.Vector3(), WT_D = new THREE.Vector3(), WT_S = new THREE.Vector3(), WT_T = new THREE.Vector3();

function placeWarpTrail(m, t, cfg, camera) {
  m.group.visible = true;
  const a = WT_A.set(t.from[0], t.from[1], t.from[2]), b = WT_B.set(t.to[0], t.to[1], t.to[2]);
  const d = WT_D.subVectors(b, a);
  const len = d.length() || 1;
  d.divideScalar(len);
  const view = camera ? WT_T.addVectors(a, b).multiplyScalar(0.5).sub(camera.position) : WT_T.set(0, 0, -1);
  const s = WT_S.crossVectors(d, view).normalize();
  const wHead = cfg.width * 0.35 * t.width, wTail = cfg.width * t.width;
  const P = m.band.geometry.attributes.position.array;
  P.set([a.x - s.x * wTail, a.y - s.y * wTail, a.z - s.z * wTail, a.x + s.x * wTail, a.y + s.y * wTail, a.z + s.z * wTail,
    b.x - s.x * wHead, b.y - s.y * wHead, b.z - s.z * wHead, b.x + s.x * wHead, b.y + s.y * wHead, b.z + s.z * wHead]);
  m.band.geometry.attributes.position.needsUpdate = true;
  m.band.material.opacity = t.fade * 0.9;
  // light streaks: parallel lines across the band's width, ending near the ship
  const u = WT_T.crossVectors(d, s).normalize();
  const L = m.streaks.geometry.attributes.position.array;
  m.offs.forEach(([x, y, back], k) => {
    const sx = s.x * x * wTail * 0.8 + u.x * y * wTail * 0.4, sy = s.y * x * wTail * 0.8 + u.y * y * wTail * 0.4, sz = s.z * x * wTail * 0.8 + u.z * y * wTail * 0.4;
    const e = 1 - back * 0.3;
    L.set([a.x + sx, a.y + sy, a.z + sz, a.x + d.x * len * e + sx * 0.3, a.y + d.y * len * e + sy * 0.3, a.z + d.z * len * e + sz * 0.3], k * 6);
  });
  m.streaks.geometry.attributes.position.needsUpdate = true;
  m.streaks.material.opacity = t.fade;
}
