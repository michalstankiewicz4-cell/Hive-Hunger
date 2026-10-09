/**
 * The swarm's "brain": the point the flock heads for. Works on any list of axes.
 *
 * - On its own: stays where there is matter to eat; when nothing is left nearby,
 *   it drifts to the nearest matter.
 * - After a click: slowly drifts to the clicked point, stays there for a moment,
 *   then acts on its own again.
 *
 * `world` must provide hasMatterNear(pos) and findMatter(pos) → point or null.
 */
export class Leader {
  constructor(cfg, start, axes) {
    this.cfg = cfg;
    this.axes = axes;
    this.pos = Object.fromEntries(axes.map((a) => [a, start[a]]));
    this.vel = Object.fromEntries(axes.map((a) => [a, 0]));
    this.goal = null;
    this.commanded = false;
    this.dwell = 0;
  }

  command(point) {
    this.goal = Object.fromEntries(this.axes.map((a) => [a, point[a]]));
    this.commanded = true;
    this.dwell = 0;
  }

  distanceTo(p) {
    let s = 0;
    for (const a of this.axes) s += (p[a] - this.pos[a]) ** 2;
    return Math.sqrt(s);
  }

  update(world) {
    const c = this.cfg;

    if (this.commanded && this.distanceTo(this.goal) < c.arriveRadius && ++this.dwell > c.dwellFrames) {
      this.commanded = false;
    }

    if (!this.commanded) {
      if (world.hasMatterNear(this.pos)) this.goal = null;
      else if (!this.goal || this.distanceTo(this.goal) < c.arriveRadius) this.goal = world.findMatter(this.pos);
    }

    if (this.goal) {
      const d = this.distanceTo(this.goal) || 1;
      const speed = c.maxSpeed * Math.min(1, d / c.slowRadius);
      for (const a of this.axes) {
        const desired = ((this.goal[a] - this.pos[a]) / d) * speed;
        this.vel[a] += (desired - this.vel[a]) * c.steer;
      }
    } else {
      for (const a of this.axes) this.vel[a] *= c.brake;
    }

    for (const a of this.axes) this.pos[a] += this.vel[a];
  }
}
