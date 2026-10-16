const THREE = window.THREE;

/**
 * Splashers' shots: a bubble of liquid (`size`, 3 voxels across) flying to its target. It is drawn
 * by the lens pass (BlackHoles.render): an irregular, wobbling drop that bends what is behind it
 * like a lens (upside down, magnified), with a bright rim and a highlight. At the target
 * `onHit(bubble)` — the host starts the soaking there (Game3D.soak).
 *
 * On the host a bubble follows its target voxel (it may be on a drifting piece); on a guest it
 * just flies to the point the host sent.
 */
export class Bubbles {
  constructor(cfg) {
    this.cfg = cfg;
    this.list = [];
    this.nextId = 1;
    this.fired = 0; // (tests)
    this._d = new THREE.Vector3();
  }

  get any() {
    return this.list.length > 0;
  }

  /** A bubble from `from` to `to`; `target` (the voxel, host), `owner` (a player), `unit` (host). */
  fire(from, to, { target = -1, owner = null, unit = -1 } = {}) {
    const b = {
      id: this.nextId++, pos: new THREE.Vector3(from.x, from.y, from.z), to: new THREE.Vector3(to.x, to.y, to.z),
      target, owner, unit, age: 0, seed: Math.random() * 100,
    };
    this.list.push(b);
    this.fired++;
    return b;
  }

  /** One frame: bubbles fly at `speed` to their target (`targetPos(b, out)` may move it); at it `onHit(b)`. */
  update(onHit, targetPos = null) {
    const c = this.cfg;
    for (const b of this.list) {
      b.age++;
      if (targetPos) targetPos(b, b.to);
      const d = this._d.subVectors(b.to, b.pos), dist = d.length();
      if (dist <= c.speed) {
        b.pos.copy(b.to);
        b.done = true;
        onHit?.(b);
        continue;
      }
      b.pos.addScaledVector(d, c.speed / dist);
    }
    this.list = this.list.filter((b) => !b.done);
  }

  /** What the lens pass draws: [{ pos, radius, phase }]. */
  lenses() {
    return this.list.map((b) => ({ pos: b.pos, radius: this.cfg.size / 2, phase: b.seed + b.age * this.cfg.wobble }));
  }

  clear() {
    this.list = [];
  }
}
