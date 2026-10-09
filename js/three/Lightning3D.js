const THREE = window.THREE;

/**
 * Chain-lightning bolts: a jagged white core with a coloured glow along the drones it jumped
 * between, fading out over `life` frames. Purely visual — the damage is done in
 * VoxelPlanet.weakenAlong on the host.
 */
export class Lightning3D {
  constructor(scene, { life = 20, jag = 0.35, pieces = 5 } = {}) {
    this.scene = scene;
    this.life = life;
    this.jag = jag;
    this.pieces = pieces;
    this.bolts = [];
    this.shown = 0; // bolts drawn so far (tests)
  }

  /** @param {number[]} path [x, y, z, x, y, z, …] — the drones the bolt hit, in order */
  show(path, color) {
    this.shown++;
    const core = this.jagged(path, this.jag);
    const glow = this.jagged(path, this.jag * 1.8);
    const make = (pts, c, opacity) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const m = new THREE.LineBasicMaterial({
        color: c, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const line = new THREE.Line(g, m);
      this.scene.add(line);
      return line;
    };
    this.bolts.push({
      lines: [make(glow, color, 0.9), make(core, 0xffffff, 1)],
      age: 0,
    });
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

  update() {
    for (const b of this.bolts) {
      b.age++;
      const f = 1 - b.age / this.life;
      // flicker while fading
      for (const line of b.lines) line.material.opacity = Math.max(0, f) * (0.6 + 0.4 * Math.random());
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
