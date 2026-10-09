const THREE = window.THREE;

/** Odłamki w 3D jako chmura punktów; zanikają przez przyciemnianie koloru. */
export class Debris3D {
  constructor(scene, cfg) {
    this.cfg = cfg;
    const max = cfg.max;
    this.count = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.base = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setDrawRange(0, 0);

    this.points = new THREE.Points(
      this.geometry,
      new THREE.PointsMaterial({ size: cfg.size, vertexColors: true, sizeAttenuation: true }),
    );
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(at, rgb, n) {
    const c = this.cfg;
    const len = at.length() || 1;
    for (let k = 0; k < n; k++) {
      let i = this.count;
      if (i >= c.max) i = (Math.random() * c.max) | 0; // pełny bufor: nadpisz losowy
      else this.count++;
      const s = c.minSpeed + Math.random() * (c.maxSpeed - c.minSpeed);
      this.pos.set([at.x, at.y, at.z], i * 3);
      this.vel[i * 3] = (at.x / len) * s + (Math.random() - 0.5) * c.jitter;
      this.vel[i * 3 + 1] = (at.y / len) * s + (Math.random() - 0.5) * c.jitter;
      this.vel[i * 3 + 2] = (at.z / len) * s + (Math.random() - 0.5) * c.jitter;
      this.base.set(rgb, i * 3);
      this.life[i] = 1;
    }
  }

  update() {
    const c = this.cfg;
    const { pos, vel, col, base, life } = this;
    let w = 0;
    for (let r = 0; r < this.count; r++) {
      const l = life[r] - c.fade;
      if (l <= 0) continue;
      const r3 = r * 3, w3 = w * 3;
      for (let a = 0; a < 3; a++) {
        vel[w3 + a] = vel[r3 + a] * c.friction;
        pos[w3 + a] = pos[r3 + a] + vel[w3 + a];
        base[w3 + a] = base[r3 + a];
        col[w3 + a] = base[w3 + a] * l;
      }
      life[w] = l;
      w++;
    }
    this.count = w;
    this.geometry.setDrawRange(0, w);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }
}
