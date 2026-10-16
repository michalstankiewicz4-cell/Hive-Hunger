import { linearTexture } from '../textures.js';

const THREE = window.THREE;

/**
 * Tugs' tractor beams (Swarm3D): a fan of light from the tug to the towed piece's outline.
 */
export const TowBeams = {
  /**
   * Tractor beams: a green cone from each towing tug over the whole piece, made of a soft glow
   * and streaks of light, brightest at the tug.
   */
  renderTows() {
    let n = 0;
    const fr = this.fragments?.();
    for (const [i, id] of this.tows) {
      const f = this.fragmentById?.(id);
      if (!fr || !f || f.dead || i >= this.count) continue;
      const beam = this.towBeams[n] || (this.towBeams[n] = makeTowBeam(this.cfg.tug, this.scene));
      n++;
      const i3 = i * 3;
      this.shapeTow(beam, this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2], f, fr);
      beam.group.visible = true;
      beam.cone.material.opacity = 0.32 + Math.random() * 0.08;
    }
    for (let k = n; k < this.towBeams.length; k++) this.towBeams[k].group.visible = false;
  },

  /**
   * Shapes a tractor beam to its piece: the piece's outline as seen from the tug (the convex hull
   * of its outer voxels, flattened across the beam onto the piece's centre, 5% larger) — the beam
   * fans out from the tug to that outline, and its light streaks end inside it.
   */
  shapeTow(beam, ax, ay, az, f, fr) {
    const s = this.cfg.tug, half = fr.planet.s / 2;
    const d = TOW_D.set(f.pos.x - ax, f.pos.y - ay, f.pos.z - az).normalize();
    // two directions across the beam
    const u = TOW_U.set(Math.abs(d.y) < 0.9 ? 0 : 1, Math.abs(d.y) < 0.9 ? 1 : 0, 0).cross(d).normalize();
    const w = TOW_W.crossVectors(d, u);
    // the outer voxels (a sample of them), flattened across the beam
    const ex = fr.exposedOf(f), step = Math.max(1, Math.floor(ex.length / s.outlinePoints));
    const pts = [];
    for (let k = 0; k < ex.length; k += step) {
      if (fr.fragOf[ex[k]] !== f.id) continue;
      fr.worldCenter(ex[k], TOW_P).sub(f.pos);
      pts.push([TOW_P.dot(u), TOW_P.dot(w)]);
    }
    let hull = convexHull(pts);
    if (hull.length < 3) hull = [[-half, -half], [half, -half], [half, half], [-half, half]].map(([x, y]) => [x + (pts[0]?.[0] || 0), y + (pts[0]?.[1] || 0)]);
    // 5% larger than the piece (and half a voxel out, the voxels' own size)
    let cx = 0, cy = 0;
    for (const [x, y] of hull) { cx += x; cy += y; }
    cx /= hull.length; cy /= hull.length;
    if (hull.length > s.rimMax) { const k = Math.ceil(hull.length / s.rimMax); hull = hull.filter((_, n) => n % k === 0); }
    const rim = hull.map(([x, y]) => {
      const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1;
      const k = (l * s.outlineScale + half) / l;
      return [cx + dx * k, cy + dy * k];
    });
    // the fan: the tug, then the outline (world positions)
    const P = beam.cone.geometry.attributes.position.array, U = beam.cone.geometry.attributes.uv.array;
    P[0] = ax; P[1] = ay; P[2] = az; U[0] = 0.5; U[1] = 0;
    rim.forEach(([x, y], k) => {
      const o = (k + 1) * 3;
      P[o] = f.pos.x + u.x * x + w.x * y; P[o + 1] = f.pos.y + u.y * x + w.y * y; P[o + 2] = f.pos.z + u.z * x + w.z * y;
      U[(k + 1) * 2] = k / rim.length; U[(k + 1) * 2 + 1] = 1;
    });
    if (beam.rimN !== rim.length) {
      // the fan: tug → outline point k → outline point k+1, closing back on the first
      const I = beam.cone.geometry.index.array, m = rim.length;
      for (let k = 0; k < m; k++) { I[k * 3] = 0; I[k * 3 + 1] = 1 + k; I[k * 3 + 2] = 1 + ((k + 1) % m); }
      beam.cone.geometry.index.needsUpdate = true;
    }
    beam.cone.geometry.setDrawRange(0, rim.length * 3);
    beam.cone.geometry.attributes.position.needsUpdate = true;
    beam.cone.geometry.attributes.uv.needsUpdate = true;
    // light streaks: from the tug to random points inside the outline, re-drawn every few frames
    if ((this.stormClock + beam.seed) % 3 === 0 || beam.rimN !== rim.length) {
      beam.ends = [];
      for (let k = 0; k < s.streaks; k++) {
        const [x, y] = rim[(Math.random() * rim.length) | 0], t = Math.sqrt(Math.random()) * 0.95;
        beam.ends.push([cx + (x - cx) * t, cy + (y - cy) * t]);
      }
    }
    beam.rimN = rim.length;
    const L = beam.streaks.geometry.attributes.position.array;
    beam.ends.forEach(([x, y], k) => {
      const o = k * 6;
      L[o] = ax; L[o + 1] = ay; L[o + 2] = az;
      L[o + 3] = f.pos.x + u.x * x + w.x * y; L[o + 4] = f.pos.y + u.y * x + w.y * y; L[o + 5] = f.pos.z + u.z * x + w.z * y;
    });
    beam.streaks.geometry.attributes.position.needsUpdate = true;
  },

  /** Removes the tractor beam meshes (the swarm is going away). */
  disposeTows() {
    for (const b of this.towBeams) this.scene.remove(b.group);
    this.towBeams = [];
    for (const b of this.warpTrails || []) this.scene.remove(b.group);
    this.warpTrails = [];
  },
};

const TOW_D = new THREE.Vector3(), TOW_U = new THREE.Vector3(), TOW_W = new THREE.Vector3(), TOW_P = new THREE.Vector3();

/** Convex hull of 2D points [[x, y], …] (monotone chain), counter-clockwise. */
function convexHull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

/**
 * One tractor beam (world positions, set by shapeTow every frame): a fan of triangles from the
 * tug to the piece's outline with a glow fading away from the tug, and streaks of light.
 */
let towSeed = 0;
let towGlow = null; // one texture for every tractor beam
function makeTowBeam(cfg, scene) {
  const group = new THREE.Group();
  // along the beam: bright at the tug (uv y = 0, the bottom of the canvas), fading out
  const glow = towGlow || (towGlow = linearTexture(4, 64, [0, 64, 0, 0], [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0.08)']]));
  const R = cfg.rimMax;
  const coneGeo = new THREE.BufferGeometry();
  coneGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((R + 1) * 3), 3).setUsage(THREE.DynamicDrawUsage));
  coneGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((R + 1) * 2), 2).setUsage(THREE.DynamicDrawUsage));
  coneGeo.setIndex(new THREE.BufferAttribute(new Uint16Array(R * 3), 1)); // the fan, see shapeTow
  const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({
    map: glow, color: cfg.beamColor, transparent: true, opacity: 0.35,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  // streaks: bright at the tug, dim at the piece
  const n = cfg.streaks;
  const col = new Float32Array(n * 6);
  const bright = new THREE.Color(cfg.beamColor), dim = bright.clone().multiplyScalar(0.12);
  for (let k = 0; k < n; k++) col.set([bright.r, bright.g, bright.b, dim.r, dim.g, dim.b], k * 6);
  const streakGeo = new THREE.BufferGeometry();
  streakGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3).setUsage(THREE.DynamicDrawUsage));
  streakGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const streaks = new THREE.LineSegments(streakGeo, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  for (const m of [cone, streaks]) m.frustumCulled = false;
  group.add(cone, streaks);
  scene.add(group);
  return { group, cone, streaks, seed: towSeed++, ends: [], rimN: 0 };
}
