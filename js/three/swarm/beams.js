import { linearTexture, radialTexture } from '../textures.js';

const THREE = window.THREE;

/**
 * Laser beams and storm ships' forked lightning (Swarm3D).
 */
export const Beams = {
  /** Laser beams: from every laser ship eating its bite (and facing it) to the bite. */
  renderBeams(camera) {
    const firing = this.firing, to = this.beamTo;
    if (!this.remote) {
      // here the simulation runs: a landed laser ship that faces its bite is firing
      for (let i = 0; i < this.count; i++) {
        const on = i < this.lasers && this.landed[i] && this.aimed[i] && this.food[i] >= 0 ? 1 : 0;
        firing[i] = on;
        if (on) { to[i * 3] = this.foodPos[i * 3]; to[i * 3 + 1] = this.foodPos[i * 3 + 1]; to[i * 3 + 2] = this.foodPos[i * 3 + 2]; }
      }
    }
    const { band, hits, cfg } = this.beams;
    const P = band.geometry.attributes.position.array, H = hits.geometry.attributes.position.array;
    const cam = camera ? camera.position : null;
    const t = performance.now() * 0.02;
    let n = 0;
    for (let i = 0; i < this.count; i++) {
      if (!firing[i]) continue;
      const i3 = i * 3;
      const ax = this.pos[i3], ay = this.pos[i3 + 1], az = this.pos[i3 + 2];
      const bx = to[i3], by = to[i3 + 1], bz = to[i3 + 2];
      // across the beam, facing the camera: beam × (camera → middle)
      let dx = bx - ax, dy = by - ay, dz = bz - az;
      let vx = (ax + bx) / 2 - (cam ? cam.x : 0), vy = (ay + by) / 2 - (cam ? cam.y : 0), vz = (az + bz) / 2 - (cam ? cam.z : 100);
      let sx = dy * vz - dz * vy, sy = dz * vx - dx * vz, sz = dx * vy - dy * vx;
      const sl = Math.hypot(sx, sy, sz) || 1;
      const w = cfg.width * (0.85 + 0.15 * Math.sin(t + i * 1.7)) / 2; // a slight shimmer
      sx = (sx / sl) * w; sy = (sy / sl) * w; sz = (sz / sl) * w;
      const o = n * 12;
      P[o] = ax - sx; P[o + 1] = ay - sy; P[o + 2] = az - sz;
      P[o + 3] = ax + sx; P[o + 4] = ay + sy; P[o + 5] = az + sz;
      P[o + 6] = bx - sx; P[o + 7] = by - sy; P[o + 8] = bz - sz;
      P[o + 9] = bx + sx; P[o + 10] = by + sy; P[o + 11] = bz + sz;
      H[n * 3] = bx; H[n * 3 + 1] = by; H[n * 3 + 2] = bz;
      n++;
    }
    band.geometry.setDrawRange(0, n * 6);
    band.geometry.attributes.position.needsUpdate = true;
    hits.geometry.setDrawRange(0, n);
    hits.geometry.attributes.position.needsUpdate = true;
    hits.material.size = cfg.hitSize * (0.8 + 0.4 * Math.random());
    band.material.opacity = 0.85 + 0.15 * Math.random();
    this.beamCount = n;
  },

  /**
   * Storm ships' lightning, a fresh flash every `storm.flashEvery` frames: straight at the bite,
   * forking at `storm.fork` of the way into the bolt to the bite and two weaker ones to the side voxels.
   */
  renderStorms(camera) {
    const sc = this.cfg.storm;
    this.stormBolts.update(camera);
    if (++this.stormClock % sc.flashEvery !== 0) return;
    for (const [i, x, y, z, sides] of this.stormList()) {
      if (i >= this.count) continue;
      const i3 = i * 3, px = this.pos[i3], py = this.pos[i3 + 1], pz = this.pos[i3 + 2];
      const fx = px + (x - px) * sc.fork, fy = py + (y - py) * sc.fork, fz = pz + (z - pz) * sc.fork;
      this.stormBolts.show([px, py, pz, fx, fy, fz, x, y, z], sc.boltColor, 1);
      for (let k = 0; k + 2 < sides.length; k += 3) {
        this.stormBolts.show([fx, fy, fz, sides[k], sides[k + 1], sides[k + 2]], sc.boltColor, sc.sideGlow);
      }
    }
  },
};

export /** Laser beam meshes: glowing bands (camera-facing quads) and a glow at each hit point. */
function makeBeams(max, cfg) {
  // across the band: transparent edge → red glow → white-hot core → red glow → edge
  const bandTex = linearTexture(4, 64, [0, 0, 0, 64], [
    [0, 'rgba(0,0,0,0)'], [0.22, 'rgba(120,0,0,1)'], [0.42, 'rgba(255,60,40,1)'], [0.5, 'rgba(255,235,225,1)'],
    [0.58, 'rgba(255,60,40,1)'], [0.78, 'rgba(120,0,0,1)'], [1, 'rgba(0,0,0,0)'],
  ]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 12), 3).setUsage(THREE.DynamicDrawUsage));
  const uv = new Float32Array(max * 8), index = [];
  for (let n = 0; n < max; n++) {
    uv.set([0, 0, 0, 1, 1, 0, 1, 1], n * 8);
    const v = n * 4;
    index.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.setDrawRange(0, 0);
  const band = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map: bandTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  band.frustumCulled = false;

  // where it hits: a soft round glow
  const hitGeo = new THREE.BufferGeometry();
  hitGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage));
  hitGeo.setDrawRange(0, 0);
  const hits = new THREE.Points(hitGeo, new THREE.PointsMaterial({
    map: radialTexture([[0, 'rgba(255,240,230,1)'], [0.25, 'rgba(255,80,50,0.9)'], [0.6, 'rgba(160,10,0,0.35)'], [1, 'rgba(0,0,0,0)']]), size: cfg.hitSize, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  hits.frustumCulled = false;
  return { band, hits, cfg };
}
